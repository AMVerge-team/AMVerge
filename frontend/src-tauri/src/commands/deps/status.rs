use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::utils::process::apply_no_window;
use crate::utils::sidecar::{
    ai_env_dir, ai_env_python, ai_env_ready, bundled_cli_version, dev_python_exe, uv_binary,
    uv_cache_dir, uv_python_dir,
};

use super::packs::PACKS;

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
    /// an NVIDIA GPU was detected, so a CUDA torch build is worth downloading
    pub gpu_available: bool,
    /// Apple Silicon: torch's MPS backend accelerates inference (TransNetV2
    /// included) without any special wheel, so this holds even when
    /// `gpu_available`/`torch_variant` (both NVIDIA-only signals) don't
    pub mps_available: bool,
    pub env_size_bytes: u64,
    /// dev builds run against the CLI checkout's venv and never provision this
    pub managed: bool,
}

/// environment every `uv` invocation runs with: keep managed interpreters and
/// the wheel cache inside app data so uninstalling leaves nothing behind, and
/// never fall back to whatever Python happens to be on the machine
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

/// any NVIDIA GPU? decides whether the CUDA torch wheel is worth its size.
/// `nvidia-smi` ships with every driver, so its presence is the signal
pub(crate) fn nvidia_gpu_present() -> bool {
    let mut cmd = Command::new("nvidia-smi");
    apply_no_window(&mut cmd);
    cmd.arg("-L")
        .output()
        .map(|o| o.status.success() && !o.stdout.is_empty())
        .unwrap_or(false)
}

/// Apple Silicon ships torch's MPS backend in the ordinary (non-CUDA) wheel,
/// and `ai_scene_detection.py`'s own device picker falls back to it ahead of
/// CPU (`cuda > mps > cpu`). detected by target rather than probing torch
/// itself, since this only needs to answer "would MPS be tried", not "is a
/// specific env's torch build new enough"
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
        mps_available: mps_available(),
        env_size_bytes,
        managed: !cfg!(debug_assertions),
    })
}
