//! Optional AI dependency management.
//!
//! The shipped sidecar carries everything that runs on ffmpeg/opencv. The heavy
//! AI packages (torch and friends) are installed on demand into an app-managed
//! venv at `<app data>/pyenv`, provisioned by the bundled `uv` binary. Each
//! feature maps to a "pack"; installing a pack installs torch once plus that
//! pack's extra, pinned to the CLI version baked into the sidecar.

use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use crate::state::ActiveInstall;
use crate::utils::logging::{console_log, sanitize_for_console};
use crate::utils::process::apply_no_window;
use crate::utils::sidecar::{
    ai_env_dir, ai_env_python, ai_env_ready, app_data_dir, bundled_cli_version, dev_python_exe,
    uv_binary, uv_cache_dir, uv_python_dir,
};

/// Python the AI env is built on. The CLI itself allows >=3.11, but
/// depth-anything-v2 requires >=3.12, and the env is shared by every pack.
const AI_ENV_PYTHON_VERSION: &str = "3.12";

/// CUDA wheel index used when an NVIDIA GPU is present. Matches the index the
/// sidecar used to be built against.
const TORCH_CUDA_INDEX: &str = "https://download.pytorch.org/whl/cu128";

/// Distributions that must come from the CUDA index together. torchvision is
/// pulled in by depth-anything-v2 and is ABI-locked to its torch build, so a
/// CPU torchvision beside a CUDA torch is not a usable combination.
const TORCH_FAMILY: &[&str] = &["torch", "torchvision"];

/// A pack: one user-facing AI capability, its amverge extra, and the
/// distributions that prove it is installed.
struct Pack {
    id: &'static str,
    extra: &'static str,
    /// Distribution names (as `uv pip list` reports them) that must all be present.
    requires: &'static [&'static str],
}

const PACKS: &[Pack] = &[
    Pack {
        id: "ml",
        extra: "ml",
        requires: &["torch", "transnetv2-pytorch"],
    },
    Pack {
        id: "depth",
        extra: "depth",
        requires: &["torch", "depth-anything-v2", "opencv-python-headless"],
    },
    Pack {
        id: "interpolation",
        extra: "interpolation",
        requires: &["torch", "scipy", "opencv-python-headless"],
    },
    Pack {
        id: "upscale",
        extra: "upscale",
        requires: &["torch", "spandrel", "onnxruntime"],
    },
];

fn pack_by_id(id: &str) -> Result<&'static Pack, String> {
    PACKS
        .iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("Unknown AI pack: {id}"))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiEnvStatus {
    /// The runtime venv exists and has an interpreter.
    pub env_ready: bool,
    /// `uv` is available, so installs are possible at all.
    pub uv_available: bool,
    /// pack id -> installed.
    pub packs: HashMap<String, bool>,
    /// "cuda" / "cpu" / null when torch is absent.
    pub torch_variant: Option<String>,
    pub torch_version: Option<String>,
    /// amverge version inside the AI env, and the one the sidecar was built with.
    pub env_cli_version: Option<String>,
    pub bundled_cli_version: Option<String>,
    /// An NVIDIA GPU was detected, so a CUDA torch build is worth downloading.
    pub gpu_available: bool,
    pub env_size_bytes: u64,
    /// Dev builds run against the CLI checkout's venv and never provision this.
    pub managed: bool,
}

/// Environment every `uv` invocation runs with: keep managed interpreters and
/// the wheel cache inside app data so uninstalling leaves nothing behind, and
/// never fall back to whatever Python happens to be on the machine.
fn uv_command(app: &AppHandle) -> Result<Command, String> {
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
    cmd.env("UV_NO_PROGRESS", "1");
    Ok(cmd)
}

/// Interpreter to inspect for installed packages: the AI env when it exists,
/// otherwise (dev only) the CLI checkout's venv, which already has every extra.
fn status_python(app: &AppHandle) -> Option<PathBuf> {
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

/// `uv pip list --format json` against `python`, as {name -> version}.
fn installed_distributions(
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
        // A venv that exists but can't be listed is treated as empty rather than
        // fatal — the UI then offers a (re)install.
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

/// Any NVIDIA GPU? Decides whether the CUDA torch wheel is worth its size.
/// `nvidia-smi` ships with every driver, so its presence is the signal.
fn nvidia_gpu_present() -> bool {
    let mut cmd = Command::new("nvidia-smi");
    apply_no_window(&mut cmd);
    cmd.arg("-L")
        .output()
        .map(|o| o.status.success() && !o.stdout.is_empty())
        .unwrap_or(false)
}

fn dir_size_bytes(path: &Path) -> u64 {
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

fn compute_status(app: &AppHandle) -> Result<AiEnvStatus, String> {
    let uv_available = uv_binary(app).map(|p| p.is_file()).unwrap_or(false);
    let env_ready = ai_env_ready(app);

    let mut packs: HashMap<String, bool> =
        PACKS.iter().map(|p| (p.id.to_string(), false)).collect();
    let mut torch_version = None;
    let mut torch_variant = None;
    let mut env_cli_version = None;

    if let Some(python) = status_python(app) {
        let installed = installed_distributions(app, &python)?;
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
    } else if let Ok(dir) = sidecar_dir(app) {
        // If the standalone AI env is not provisioned, check if this is the
        // pre-bundled Full CUDA build (torch and transnet in sidecar _internal).
        let internal = dir.join("_internal");
        let has_bundled_torch = internal.join("torch").is_dir()
            || internal.join("torch-bin").is_dir()
            || internal.join("transnetv2_pytorch").is_dir();

        if has_bundled_torch {
            packs.insert("ml".to_string(), true);
            torch_version = Some("bundled".to_string());
            torch_variant = Some("cuda".to_string());
        }
    }

    let env_size_bytes = if env_ready {
        ai_env_dir(app).map(|dir| dir_size_bytes(&dir)).unwrap_or(0)
    } else {
        0
    };

    Ok(AiEnvStatus {
        env_ready,
        uv_available,
        packs,
        torch_variant,
        torch_version,
        env_cli_version,
        bundled_cli_version: bundled_cli_version(app),
        gpu_available: nvidia_gpu_present(),
        env_size_bytes,
        managed: !cfg!(debug_assertions),
    })
}

/// What is installed right now — drives the lock badges and the Dependencies tab.
#[tauri::command]
pub async fn ai_env_status(app: AppHandle) -> Result<AiEnvStatus, String> {
    tokio::task::spawn_blocking(move || compute_status(&app))
        .await
        .map_err(|e| format!("status task panicked: {e}"))?
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct InstallProgressPayload {
    pack: String,
    /// "python" | "torch" | "packages" | "cleanup"
    phase: String,
    percent: u8,
    /// True while a multi-GB wheel downloads and no real percentage exists.
    indeterminate: bool,
    message: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct InstallLogPayload {
    pack: String,
    line: String,
}

fn emit_progress(
    app: &AppHandle,
    pack: &str,
    phase: &str,
    percent: u8,
    indeterminate: bool,
    message: &str,
) {
    let _ = app.emit(
        "ai_install_progress",
        InstallProgressPayload {
            pack: pack.to_string(),
            phase: phase.to_string(),
            percent,
            indeterminate,
            message: message.to_string(),
        },
    );
}

fn emit_log(app: &AppHandle, pack: &str, line: &str) {
    let _ = app.emit(
        "ai_install_log",
        InstallLogPayload {
            pack: pack.to_string(),
            line: line.to_string(),
        },
    );
}

/// Run one uv step, streaming its output to the install modal. Returns the tail
/// of the output on failure so the UI can show a real reason.
fn run_uv_step(
    app: &AppHandle,
    install_state: &ActiveInstall,
    pack: &str,
    mut cmd: Command,
    step_label: &str,
) -> Result<(), String> {
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start {step_label}: {e}"))?;
    if let Ok(mut lock) = install_state.pid.lock() {
        *lock = Some(child.id());
    }

    // uv writes its progress to stderr and command output to stdout. Drain
    // stdout on its own thread so a full pipe can never deadlock the reader.
    let stdout_handle = child.stdout.take().map(|stdout| {
        let app = app.clone();
        let pack = pack.to_string();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    emit_log(&app, &pack, &sanitize_for_console(trimmed));
                }
            }
        })
    });

    let mut tail: Vec<String> = Vec::new();
    if let Some(stderr) = child.stderr.take() {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let sanitized = sanitize_for_console(trimmed);
            console_log("DEPS|uv", &sanitized);
            emit_log(app, pack, &sanitized);
            tail.push(sanitized);
            if tail.len() > 12 {
                tail.remove(0);
            }
        }
    }

    let status = child
        .wait()
        .map_err(|e| format!("Failed waiting for {step_label}: {e}"))?;
    if let Some(handle) = stdout_handle {
        let _ = handle.join();
    }
    if let Ok(mut lock) = install_state.pid.lock() {
        *lock = None;
    }

    if status.success() {
        return Ok(());
    }
    if install_state.canceled() {
        return Err("Install canceled.".to_string());
    }

    let detail = tail.join("\n");
    Err(if detail.is_empty() {
        format!("{step_label} failed ({status})")
    } else {
        format!("{step_label} failed ({status}):\n{detail}")
    })
}

fn install_ai_pack_inner(
    app: &AppHandle,
    install_state: &ActiveInstall,
    pack: &Pack,
    gpu: bool,
) -> Result<(), String> {
    let env_dir = ai_env_dir(app)?;
    let python = ai_env_python(app)?;
    std::fs::create_dir_all(app_data_dir(app)?).map_err(|e| e.to_string())?;

    console_log("DEPS|install", &format!("pack={} gpu={gpu}", pack.id));

    // 1. Provision the venv (uv downloads a standalone CPython the first time).
    if !ai_env_ready(app) {
        emit_progress(
            app,
            pack.id,
            "python",
            2,
            false,
            "Preparing the Python environment...",
        );
        let mut cmd = uv_command(app)?;
        cmd.arg("venv")
            .arg(&env_dir)
            .arg("--python")
            .arg(AI_ENV_PYTHON_VERSION);
        run_uv_step(app, install_state, pack.id, cmd, "Environment setup")?;
    }
    if install_state.canceled() {
        return Err("Install canceled.".to_string());
    }

    // 2. The pack and torch in ONE resolution. Splitting them was the bug behind
    //    CPU-only depth maps: the pack resolution ran against plain PyPI, and
    //    depth-anything-v2's `torchvision<0.23` ceiling forced torch down to a
    //    version it then satisfied with the CPU wheel — silently replacing the
    //    CUDA build installed moments earlier.
    let installed = installed_distributions(app, &python)?;
    let variant_matches = installed
        .get("torch")
        .map(|v| v.contains("+cu") == gpu)
        .unwrap_or(false);

    // Install the target pack together with everything already installed, as one
    // spec. Installing packs one at a time let each re-resolve torch on its own
    // terms: `interpolation` has no torchvision ceiling, so it would happily
    // upgrade torch to a version with no CUDA wheel and undo `depth`'s install.
    // A single resolution has to satisfy every pack at once.
    let mut extras: Vec<&str> = PACKS
        .iter()
        .filter(|p| {
            p.id != pack.id
                && p.requires
                    .iter()
                    .all(|dist| installed.contains_key(&dist.to_lowercase()))
        })
        .map(|p| p.extra)
        .collect();
    extras.push(pack.extra);

    let spec = match bundled_cli_version(app) {
        Some(version) => format!("amverge[{}]=={version}", extras.join(",")),
        None => format!("amverge[{}]", extras.join(",")),
    };

    emit_progress(
        app,
        pack.id,
        "packages",
        10,
        true,
        &format!(
            "Downloading {} and PyTorch ({}) — this can take several minutes...",
            pack.id,
            if gpu { "GPU build, ~2.7 GB" } else { "CPU build, ~250 MB" }
        ),
    );

    let mut cmd = uv_command(app)?;
    cmd.arg("pip")
        .arg("install")
        .arg("--python")
        .arg(&python)
        .arg(&spec)
        .arg("torch");

    if gpu {
        // uv gives an extra index priority over the default one and, under the
        // default first-index strategy, resolves a package exclusively from the
        // first index that carries it. So torch/torchvision come only from the
        // CUDA index (which never serves a CPU wheel), while av, opencv and the
        // rest — absent there — fall through to PyPI.
        //
        // Do NOT add --index-strategy unsafe-best-match here: it picks the
        // highest version across all indexes, and PyPI ships newer torch
        // releases than the CUDA index does, so it silently selects a CPU wheel.
        cmd.arg("--extra-index-url").arg(TORCH_CUDA_INDEX);
    }

    // An already-installed CPU torch satisfies every constraint, so uv would
    // report "no changes" and leave it in place. Force the swap when the variant
    // on disk isn't the one being asked for.
    if !variant_matches {
        for dist in TORCH_FAMILY {
            if installed.contains_key(*dist) {
                cmd.arg("--reinstall-package").arg(dist);
            }
        }
    }

    run_uv_step(app, install_state, pack.id, cmd, "Package install")?;

    // uv only warns about an extra the published wheel doesn't define, so the
    // step "succeeds" while installing none of the pack's packages. Verify.
    let after = installed_distributions(app, &python)?;
    let missing: Vec<&str> = pack
        .requires
        .iter()
        .copied()
        .filter(|dist| !after.contains_key(&dist.to_lowercase()))
        .collect();
    if !missing.is_empty() {
        return Err(format!(
            "The installed AMVerge CLI ({}) does not provide the [{}] extra, so {} could not be \
             installed. This feature needs a newer CLI release.",
            bundled_cli_version(app).unwrap_or_else(|| "unknown".to_string()),
            pack.extra,
            missing.join(", ")
        ));
    }

    // A CPU torch where a GPU one was asked for means the feature will run, but
    // at a fraction of the speed — the failure this whole single-resolution
    // change exists to prevent. Say so instead of leaving it to be discovered.
    if gpu {
        let torch_version = after.get("torch").cloned().unwrap_or_default();
        if !torch_version.contains("+cu") {
            return Err(format!(
                "PyTorch resolved to the CPU build ({torch_version}), so {} would run without GPU \
                 acceleration. This usually means no CUDA wheel exists for the version this \
                 pack requires.",
                pack.id
            ));
        }
    }

    // 4. The wheel cache holds a second copy of every download (torch alone is
    //    gigabytes), so drop it once the env is built.
    emit_progress(app, pack.id, "cleanup", 95, false, "Cleaning up...");
    if let Ok(cache) = uv_cache_dir(app) {
        let _ = std::fs::remove_dir_all(cache);
    }

    emit_progress(app, pack.id, "cleanup", 100, false, "Done.");
    console_log("DEPS|install", &format!("pack={} ok", pack.id));
    Ok(())
}

/// Install one pack (and torch, the first time). `gpu` picks the CUDA wheel.
#[tauri::command]
pub async fn install_ai_pack(
    app: AppHandle,
    install_state: State<'_, ActiveInstall>,
    pack: String,
    gpu: bool,
) -> Result<AiEnvStatus, String> {
    let target = pack_by_id(&pack)?;

    if cfg!(debug_assertions) {
        return Err(
            "Dev builds run against the AMVerge-CLI checkout's venv — install the extras there \
             with `pip install -e .[all]` instead."
                .to_string(),
        );
    }

    let state = install_state.inner().clone();
    state.begin()?;

    let app_for_task = app.clone();
    let state_for_task = state.clone();
    let outcome = tokio::task::spawn_blocking(move || {
        let result = install_ai_pack_inner(&app_for_task, &state_for_task, target, gpu);
        state_for_task.finish();
        result
    })
    .await
    .map_err(|e| {
        state.finish();
        format!("install task panicked: {e}")
    })?;

    outcome?;
    ai_env_status(app).await
}

/// Stop an in-flight install. The venv is left in place; a half-installed pack
/// simply reports as not installed and can be retried.
#[tauri::command]
pub async fn abort_ai_install(install_state: State<'_, ActiveInstall>) -> Result<(), String> {
    install_state.cancel();

    let pid = install_state.pid.lock().map_err(|e| e.to_string())?.take();
    let Some(pid) = pid else {
        console_log("DEPS|abort", "no active install");
        return Ok(());
    };

    console_log("DEPS|abort", &format!("killing uv pid={pid}"));

    #[cfg(windows)]
    {
        let mut cmd = Command::new("taskkill");
        apply_no_window(&mut cmd);
        let _ = cmd.args(["/F", "/T", "/PID", &pid.to_string()]).output();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill")
            .args(["-9", &format!("-{pid}")])
            .output();
    }

    Ok(())
}

/// Remove one pack's distinguishing packages. torch stays because other packs
/// share it — use `remove_ai_env` to reclaim that space.
#[tauri::command]
pub async fn uninstall_ai_pack(app: AppHandle, pack: String) -> Result<AiEnvStatus, String> {
    let target = pack_by_id(&pack)?;
    if !ai_env_ready(&app) {
        return ai_env_status(app).await;
    }

    let app_for_task = app.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let python = ai_env_python(&app_for_task)?;
        let mut cmd = uv_command(&app_for_task)?;
        cmd.arg("pip").arg("uninstall").arg("--python").arg(&python);
        for dist in target.requires.iter().filter(|d| **d != "torch") {
            cmd.arg(dist);
        }
        let output = cmd
            .output()
            .map_err(|e| format!("Failed to run uv pip uninstall: {e}"))?;
        if !output.status.success() {
            return Err(format!(
                "Uninstall failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        console_log("DEPS|uninstall", &format!("pack={}", target.id));
        Ok(())
    })
    .await
    .map_err(|e| format!("uninstall task panicked: {e}"))??;

    ai_env_status(app).await
}

/// Delete the whole AI environment (venv + managed interpreters + wheel cache).
#[tauri::command]
pub async fn remove_ai_env(app: AppHandle) -> Result<AiEnvStatus, String> {
    let app_for_task = app.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        for dir in [
            ai_env_dir(&app_for_task)?,
            uv_python_dir(&app_for_task)?,
            uv_cache_dir(&app_for_task)?,
        ] {
            if dir.exists() {
                std::fs::remove_dir_all(&dir)
                    .map_err(|e| format!("Failed to remove {}: {e}", dir.display()))?;
            }
        }
        console_log("DEPS|remove", "ai env removed");
        Ok(())
    })
    .await
    .map_err(|e| format!("remove task panicked: {e}"))??;

    ai_env_status(app).await
}
