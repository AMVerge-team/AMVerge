use std::path::PathBuf;
use std::process::Command;

use tauri::{AppHandle, Manager};

use crate::utils::process::apply_no_window;

/// Resolve the AMVerge CLI executable and return a `Command` ready to spawn
/// (no-window + own process group applied).
///
/// Dev (`debug_assertions`): the editable venv in the in-repo `AMVerge-CLI`
/// checkout (`AMVERGE_CLI_DIR` overrides). Prod: the PyInstaller sidecar bundled
/// under the app's resources. Mirrors the resolution used by `detect_scenes`.
pub fn amverge_command(app: &AppHandle) -> Result<Command, String> {
    let exe: PathBuf = if cfg!(debug_assertions) {
        // current_dir is frontend/src-tauri during `tauri dev`; pop to repo root.
        let mut root = std::env::current_dir().map_err(|e| e.to_string())?;
        root.pop();
        root.pop();
        let cli_dir = std::env::var("AMVERGE_CLI_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| root.join("AMVerge-CLI"));
        if cfg!(windows) {
            cli_dir.join(".venv").join("Scripts").join("amverge.exe")
        } else {
            cli_dir.join(".venv").join("bin").join("amverge")
        }
    } else {
        let sidecar_rel = if cfg!(windows) {
            "bin/amverge-x86_64-pc-windows-msvc/amverge.exe"
        } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
            "bin/amverge-aarch64-apple-darwin/amverge"
        } else if cfg!(target_os = "macos") {
            "bin/amverge-x86_64-apple-darwin/amverge"
        } else {
            return Err("amverge_command: unsupported platform".to_string());
        };
        app.path()
            .resolve(sidecar_rel, tauri::path::BaseDirectory::Resource)
            .map_err(|e| e.to_string())?
    };

    let mut cmd = Command::new(exe);
    apply_no_window(&mut cmd);
    #[cfg(not(windows))]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    Ok(cmd)
}

/// The CLI executable name for logging.
pub fn amverge_exe_name() -> &'static str {
    if cfg!(windows) {
        "amverge.exe"
    } else {
        "amverge"
    }
}
