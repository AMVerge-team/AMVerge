use std::path::PathBuf;
use std::process::Command;

use tauri::{AppHandle, Manager};

use crate::utils::process::apply_no_window;

/// Where the app keeps everything it provisions at runtime.
///
/// ```text
/// <app data>/uv-cache   wheel cache (cleaned after a successful install)
/// <app data>/python     standalone CPython managed by uv
/// <app data>/pyenv      the optional AI venv (torch + amverge AI extras)
/// ```
pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

pub fn ai_env_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("pyenv"))
}

pub fn uv_python_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("python"))
}

pub fn uv_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("uv-cache"))
}

/// `Scripts` on Windows, `bin` everywhere else.
fn venv_bin_dir(root: &PathBuf) -> PathBuf {
    if cfg!(windows) {
        root.join("Scripts")
    } else {
        root.join("bin")
    }
}

fn exe_name(stem: &str) -> String {
    if cfg!(windows) {
        format!("{stem}.exe")
    } else {
        stem.to_string()
    }
}

pub fn ai_env_python(app: &AppHandle) -> Result<PathBuf, String> {
    let root = ai_env_dir(app)?;
    Ok(venv_bin_dir(&root).join(exe_name("python")))
}

pub fn ai_env_amverge(app: &AppHandle) -> Result<PathBuf, String> {
    let root = ai_env_dir(app)?;
    Ok(venv_bin_dir(&root).join(exe_name("amverge")))
}

/// True once the AI venv has a usable interpreter (a half-provisioned directory
/// counts as missing, so a canceled install is simply redone).
pub fn ai_env_ready(app: &AppHandle) -> bool {
    ai_env_python(app).map(|p| p.is_file()).unwrap_or(false)
}

/// The dev CLI checkout's editable venv — it already carries every extra, so
/// `tauri dev` never needs the runtime AI env.
fn dev_venv_dir() -> Result<PathBuf, String> {
    // current_dir is frontend/src-tauri during `tauri dev`; pop to the repo root.
    let mut root = std::env::current_dir().map_err(|e| e.to_string())?;
    root.pop();
    root.pop();
    let cli_dir = std::env::var("AMVERGE_CLI_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| root.join("AMVerge-CLI"));
    Ok(cli_dir.join(".venv"))
}

fn dev_amverge_exe() -> Result<PathBuf, String> {
    Ok(venv_bin_dir(&dev_venv_dir()?).join(exe_name("amverge")))
}

pub fn dev_python_exe() -> Result<PathBuf, String> {
    Ok(venv_bin_dir(&dev_venv_dir()?).join(exe_name("python")))
}

fn sidecar_rel_dir() -> Result<&'static str, String> {
    if cfg!(windows) {
        Ok("bin/amverge-x86_64-pc-windows-msvc")
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Ok("bin/amverge-aarch64-apple-darwin")
    } else if cfg!(target_os = "macos") {
        Ok("bin/amverge-x86_64-apple-darwin")
    } else {
        Err("amverge sidecar: unsupported platform".to_string())
    }
}

/// Directory holding the bundled sidecar (its `_internal` carries ffmpeg/ffprobe).
pub fn sidecar_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve(sidecar_rel_dir()?, tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())
}

fn prod_amverge_exe(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(sidecar_dir(app)?.join(exe_name("amverge")))
}

/// The `uv` binary shipped as a resource, used to provision the AI env.
pub fn uv_binary(app: &AppHandle) -> Result<PathBuf, String> {
    let triple = if cfg!(windows) {
        "x86_64-pc-windows-msvc"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(target_os = "macos") {
        "x86_64-apple-darwin"
    } else {
        return Err("uv: unsupported platform".to_string());
    };
    let rel = format!("bin/uv/{triple}/{}", exe_name("uv"));

    if cfg!(debug_assertions) {
        // Staged by `npm run fetch:uv` into frontend/src-tauri/bin/uv/<triple>/;
        // current_dir is frontend/src-tauri during `tauri dev`.
        let dir = std::env::current_dir().map_err(|e| e.to_string())?;
        return Ok(dir.join("bin").join("uv").join(triple).join(exe_name("uv")));
    }

    app.path()
        .resolve(&rel, tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())
}

/// Version of the CLI baked into the sidecar, written by `build-sidecar.mjs`.
/// The runtime AI env installs this exact version so the two can never drift.
pub fn bundled_cli_version(app: &AppHandle) -> Option<String> {
    let path = sidecar_dir(app).ok()?.join("_internal").join("cli-version.txt");
    let raw = std::fs::read_to_string(path).ok()?;
    let trimmed = raw.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

/// Resolve the AMVerge CLI executable and return a `Command` ready to spawn
/// (no-window + own process group applied).
///
/// Dev (`debug_assertions`): the editable venv in the in-repo `AMVerge-CLI`
/// checkout (`AMVERGE_CLI_DIR` overrides). Prod: the PyInstaller sidecar bundled
/// under the app's resources.
pub fn amverge_command(app: &AppHandle) -> Result<Command, String> {
    let exe = if cfg!(debug_assertions) {
        dev_amverge_exe()?
    } else {
        prod_amverge_exe(app)?
    };
    Ok(base_command(exe))
}

/// Same as [`amverge_command`], but for work that needs the optional AI packages
/// (TransNetV2 detection, depth maps, interpolation). In a release build those
/// live in the app-managed venv, not the sidecar, so the command resolves to
/// `<app data>/pyenv` and gets the sidecar's `_internal` prepended to PATH —
/// that is where the CLI finds ffmpeg/ffprobe. Falls back to the sidecar when
/// the AI env is missing so the CLI can raise its own "pip install amverge[...]"
/// error instead of failing with a spawn error.
pub fn amverge_ai_command(app: &AppHandle) -> Result<Command, String> {
    if cfg!(debug_assertions) {
        // The dev venv already has every extra installed.
        return Ok(base_command(dev_amverge_exe()?));
    }

    if !ai_env_ready(app) {
        return amverge_command(app);
    }

    let mut cmd = base_command(ai_env_amverge(app)?);
    if let Ok(dir) = sidecar_dir(app) {
        let internal = dir.join("_internal");
        let existing = std::env::var_os("PATH").unwrap_or_default();
        let mut paths = vec![internal];
        paths.extend(std::env::split_paths(&existing));
        if let Ok(joined) = std::env::join_paths(paths) {
            cmd.env("PATH", joined);
        }
    }
    Ok(cmd)
}

fn base_command(exe: PathBuf) -> Command {
    let mut cmd = Command::new(exe);
    apply_no_window(&mut cmd);
    #[cfg(not(windows))]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    cmd
}

/// The CLI executable name for logging.
pub fn amverge_exe_name() -> &'static str {
    if cfg!(windows) {
        "amverge.exe"
    } else {
        "amverge"
    }
}
