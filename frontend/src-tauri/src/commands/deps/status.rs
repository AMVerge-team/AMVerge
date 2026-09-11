use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::utils::logging::console_log;
use crate::utils::process::apply_no_window;
use crate::utils::sidecar::{
    ai_env_dir, ai_env_python, ai_env_ready, bundled_cli_version, dev_python_exe, uv_binary,
    uv_cache_dir, uv_python_dir,
};

use super::packs::{GPU_DECODE_MIN_COMPUTE, PACKS};

/// `Absent` claims there is no GPU; `Unknown` admits the probe could not run
#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum GpuProbe {
    Detected,
    Absent,
    Unknown,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiEnvStatus {
    /// the runtime venv exists and has an interpreter
    pub env_ready: bool,
    /// `uv` is available, so installs are possible at all
    pub uv_available: bool,
    /// pack id -> installed
    pub packs: HashMap<String, bool>,
    /// "cuda" / "cpu" / null when torch is absent
    pub torch_variant: Option<String>,
    pub torch_version: Option<String>,
    /// amverge version inside the AI env, and the one the sidecar was built with
    pub env_cli_version: Option<String>,
    pub bundled_cli_version: Option<String>,
    /// positively detected. false also covers "could not tell" - see `gpu_probe`
    pub gpu_available: bool,
    /// "detected" / "absent" / "unknown"
    pub gpu_probe: GpuProbe,
    /// the GPU can run the CUDA 13 build Nelux needs (Turing or newer)
    pub gpu_decode_supported: bool,
    /// Nelux is installed, so this env is on the GPU-decode profile
    pub gpu_decode_installed: bool,
    /// `major.minor` of the env's interpreter, null when there is no env
    pub env_python_version: Option<String>,
    /// the env could not be inspected: pack fields unreliable, GPU fields still good
    pub status_error: Option<String>,
    /// Apple Silicon MPS needs no special wheel, so this can hold when `gpu_available` doesn't
    pub mps_available: bool,
    pub env_size_bytes: u64,
    /// dev builds run against the CLI checkout's venv and never provision this
    pub managed: bool,
}

/// interpreters and wheel cache live in app data, so uninstalling leaves nothing behind
pub(crate) fn uv_command(app: &AppHandle) -> Result<Command, String> {
    let uv = uv_binary(app)?;
    if !uv.is_file() {
        return Err(format!(
            "The uv installer is missing ({}). Reinstall AMVerge to restore it.",
            uv.display()
        ));
    }
    let mut cmd = Command::new(uv);
    apply_no_window(&mut cmd);
    #[cfg(not(windows))]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    cmd.env("UV_PYTHON_INSTALL_DIR", uv_python_dir(app)?);
    cmd.env("UV_CACHE_DIR", uv_cache_dir(app)?);
    cmd.env("UV_PYTHON_PREFERENCE", "only-managed");
    cmd.env("UV_CONCURRENT_DOWNLOADS", "8");
    Ok(cmd)
}

/// interpreter to inspect for installed packages: the AI env when it exists,
/// otherwise (dev only) the CLI checkout's venv, which already has every extra
pub(crate) fn status_python(app: &AppHandle) -> Option<PathBuf> {
    if ai_env_ready(app) {
        return ai_env_python(app).ok();
    }
    if cfg!(debug_assertions) {
        let dev = dev_python_exe().ok()?;
        if dev.is_file() {
            return Some(dev);
        }
    }
    None
}

/// `uv pip list --format json` against `python`, as {name -> version}
pub(crate) fn installed_distributions(
    app: &AppHandle,
    python: &Path,
) -> Result<HashMap<String, String>, String> {
    let mut cmd = uv_command(app)?;
    let output = cmd
        .arg("pip")
        .arg("list")
        .arg("--format")
        .arg("json")
        .arg("--python")
        .arg(python)
        .output()
        .map_err(|e| format!("Failed to run uv pip list: {e}"))?;

    if !output.status.success() {
        // a venv that exists but can't be listed is treated as empty rather than
        // fatal; the UI then offers a (re)install
        return Ok(HashMap::new());
    }

    let parsed: Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("uv pip list returned invalid JSON: {e}"))?;

    let mut map = HashMap::new();
    if let Some(items) = parsed.as_array() {
        for item in items {
            let name = item.get("name").and_then(|v| v.as_str());
            let version = item.get("version").and_then(|v| v.as_str());
            if let (Some(name), Some(version)) = (name, version) {
                map.insert(name.to_lowercase(), version.to_string());
            }
        }
    }
    Ok(map)
}

/// how much `nvidia-smi` is willing to run for before we give up on it
const NVIDIA_SMI_TIMEOUT: Duration = Duration::from_secs(10);

/// what one `nvidia-smi -L` attempt told us
enum SmiOutcome {
    /// ran and named at least one GPU
    Listed,
    /// ran cleanly and named none
    Empty,
    /// the executable is not at this location
    NotFound,
    /// present but unquestionable (blocked, timed out, driver mismatch)
    Failed(String),
}

/// PATH first, then the driver's install locations: a GUI process may not inherit PATH
fn nvidia_smi_candidates() -> Vec<PathBuf> {
    let mut out = vec![PathBuf::from("nvidia-smi")];

    #[cfg(windows)]
    {
        let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
        out.push(
            PathBuf::from(system_root)
                .join("System32")
                .join("nvidia-smi.exe"),
        );
        for var in ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"] {
            if let Ok(dir) = std::env::var(var) {
                out.push(
                    PathBuf::from(dir)
                        .join("NVIDIA Corporation")
                        .join("NVSMI")
                        .join("nvidia-smi.exe"),
                );
            }
        }
    }

    out
}

fn run_nvidia_smi(exe: &Path) -> SmiOutcome {
    let mut cmd = Command::new(exe);
    apply_no_window(&mut cmd);
    cmd.arg("-L").stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return SmiOutcome::NotFound,
        Err(e) => return SmiOutcome::Failed(e.to_string()),
    };

    // std has no timeout, and a wedged nvidia-smi would hang the whole status call.
    // polling before draining the pipes is safe: `-L` prints far less than one buffer
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if start.elapsed() > NVIDIA_SMI_TIMEOUT {
                    let _ = child.kill();
                    return SmiOutcome::Failed("timed out".to_string());
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => return SmiOutcome::Failed(e.to_string()),
        }
    }

    let output = match child.wait_with_output() {
        Ok(output) => output,
        Err(e) => return SmiOutcome::Failed(e.to_string()),
    };
    if !output.status.success() {
        return SmiOutcome::Failed(format!("exited with {}", output.status));
    }

    if String::from_utf8_lossy(&output.stdout)
        .lines()
        .any(|line| line.trim_start().starts_with("GPU "))
    {
        SmiOutcome::Listed
    } else {
        SmiOutcome::Empty
    }
}

/// picks the CUDA vs CPU torch wheel, so a wrong answer costs all GPU acceleration
pub(crate) fn nvidia_gpu_probe() -> GpuProbe {
    let mut driver_present = false;
    let mut last_failure = String::new();

    for exe in nvidia_smi_candidates() {
        // a bare name is resolved through PATH; anything else we can check for
        let on_path = exe.parent().map(|p| p.as_os_str().is_empty()).unwrap_or(true);
        if !on_path && !exe.is_file() {
            continue;
        }

        match run_nvidia_smi(&exe) {
            SmiOutcome::Listed => {
                console_log("DEPS|gpu", &format!("NVIDIA GPU found via {}", exe.display()));
                return GpuProbe::Detected;
            }
            SmiOutcome::Empty => {
                driver_present = true;
                console_log(
                    "DEPS|gpu",
                    &format!("{} ran and listed no GPU", exe.display()),
                );
            }
            SmiOutcome::NotFound => {}
            SmiOutcome::Failed(detail) => {
                driver_present = true;
                last_failure = format!("{} ({})", detail, exe.display());
                console_log(
                    "DEPS|gpu",
                    &format!("nvidia-smi failed: {last_failure}"),
                );
            }
        }
    }

    if driver_present && !last_failure.is_empty() {
        console_log(
            "DEPS|gpu",
            "nvidia-smi is installed but unusable, so GPU support is undetermined",
        );
        return GpuProbe::Unknown;
    }

    console_log(
        "DEPS|gpu",
        "nvidia-smi not found in PATH or any driver install location",
    );
    GpuProbe::Absent
}

#[cfg(test)]
mod nvidia_probe_tests {
    use super::*;

    #[test]
    fn path_lookup_is_tried_first() {
        let candidates = nvidia_smi_candidates();
        assert_eq!(candidates[0], PathBuf::from("nvidia-smi"));
    }

    #[cfg(windows)]
    #[test]
    fn windows_has_absolute_fallbacks() {
        // the whole point of the fix: PATH alone is not enough
        assert!(
            nvidia_smi_candidates().len() > 1,
            "windows must fall back to the driver's install locations"
        );
    }

    /// the fallback that rescues a machine whose PATH lacks nvidia-smi
    #[cfg(windows)]
    #[test]
    fn absolute_system32_path_can_be_questioned() {
        let exe = PathBuf::from(std::env::var("SystemRoot").unwrap_or("C:\\Windows".to_string()))
            .join("System32")
            .join("nvidia-smi.exe");
        if !exe.is_file() {
            return; // no NVIDIA driver here, nothing to assert
        }
        assert!(
            matches!(run_nvidia_smi(&exe), SmiOutcome::Listed | SmiOutcome::Empty),
            "an installed nvidia-smi should answer when called by absolute path"
        );
    }

    #[test]
    fn missing_executable_is_not_a_failure() {
        // NotFound, never Failed: absent is evidence, unrunnable is not
        let outcome = run_nvidia_smi(Path::new("amverge-no-such-binary-xyz"));
        assert!(matches!(outcome, SmiOutcome::NotFound));
    }
}

/// e.g. 8.9. asked of the driver, since it decides which torch we may install
fn nvidia_compute_capability() -> Option<f32> {
    for exe in nvidia_smi_candidates() {
        let on_path = exe.parent().map(|p| p.as_os_str().is_empty()).unwrap_or(true);
        if !on_path && !exe.is_file() {
            continue;
        }

        let mut cmd = Command::new(&exe);
        apply_no_window(&mut cmd);
        let output = cmd
            .args(["--query-gpu=compute_cap", "--format=csv,noheader"])
            .output()
            .ok()?;
        if !output.status.success() {
            continue;
        }
        // the highest, for a machine with more than one card
        let best = String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter_map(|line| line.trim().parse::<f32>().ok())
            .fold(f32::NAN, f32::max);
        if best.is_finite() {
            return Some(best);
        }
    }
    None
}

/// `major.minor` of the env's interpreter, so a profile switch knows to rebuild
pub(crate) fn env_python_version_of(python: &Path) -> Option<String> {
    let mut cmd = Command::new(python);
    apply_no_window(&mut cmd);
    let output = cmd
        .args([
            "-c",
            "import sys; print('%d.%d' % sys.version_info[:2])",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!version.is_empty()).then_some(version)
}

/// MPS ships in the ordinary wheel, so the target tells us all we need
pub(crate) fn mps_available() -> bool {
    cfg!(all(target_os = "macos", target_arch = "aarch64"))
}

pub(crate) fn dir_size_bytes(path: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    let mut total = 0u64;
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            total += dir_size_bytes(&entry.path());
        } else {
            total += meta.len();
        }
    }
    total
}

pub(crate) fn compute_status(app: &AppHandle) -> Result<AiEnvStatus, String> {
    let uv_available = uv_binary(app).map(|p| p.is_file()).unwrap_or(false);
    let env_ready = ai_env_ready(app);

    let mut packs: HashMap<String, bool> =
        PACKS.iter().map(|p| (p.id.to_string(), false)).collect();
    let mut torch_version = None;
    let mut torch_variant = None;
    let mut env_cli_version = None;
    let mut status_error = None;
    let mut gpu_decode_installed = false;
    let mut env_python_version = None;

    if let Some(python) = status_python(app) {
        env_python_version = env_python_version_of(&python);
        // reported, not propagated: a `?` here made a broken uv look like a missing GPU
        match installed_distributions(app, &python) {
            Ok(installed) => {
                for pack in PACKS {
                    let ok = pack
                        .requires
                        .iter()
                        .all(|dist| installed.contains_key(&dist.to_lowercase()));
                    packs.insert(pack.id.to_string(), ok);
                }
                torch_version = installed.get("torch").cloned();
                torch_variant = torch_version.as_ref().map(|v| {
                    if v.contains("+cu") {
                        "cuda".to_string()
                    } else {
                        "cpu".to_string()
                    }
                });
                env_cli_version = installed.get("amverge").cloned();
                gpu_decode_installed = installed.contains_key("nelux");
            }
            Err(e) => {
                console_log("DEPS|status", &format!("could not read packages: {e}"));
                status_error = Some(e);
            }
        }
    }

    let env_size_bytes = if env_ready {
        ai_env_dir(app).map(|dir| dir_size_bytes(&dir)).unwrap_or(0)
    } else {
        0
    };

    let gpu_probe = nvidia_gpu_probe();

    Ok(AiEnvStatus {
        env_ready,
        uv_available,
        packs,
        torch_variant,
        torch_version,
        env_cli_version,
        bundled_cli_version: bundled_cli_version(app),
        gpu_available: gpu_probe == GpuProbe::Detected,
        gpu_probe,
        gpu_decode_supported: nvidia_compute_capability()
            .map(|cap| cap >= GPU_DECODE_MIN_COMPUTE)
            .unwrap_or(false),
        gpu_decode_installed,
        env_python_version,
        status_error,
        mps_available: mps_available(),
        env_size_bytes,
        managed: !cfg!(debug_assertions),
    })
}
