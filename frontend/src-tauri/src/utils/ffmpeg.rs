use std::path::PathBuf;

use tauri::{AppHandle, Manager};

pub fn resolve_bundled_tool(app: &AppHandle, tool_name: &str) -> Result<PathBuf, String> {
    let exe_name = if cfg!(windows) {
        format!("{tool_name}.exe")
    } else {
        tool_name.to_string()
    };

    let internal_sidecar = if cfg!(windows) {
        "bin/amverge-x86_64-pc-windows-msvc/_internal"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "bin/amverge-aarch64-apple-darwin/_internal"
    } else if cfg!(target_os = "macos") {
        "bin/amverge-x86_64-apple-darwin/_internal"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "bin/amverge-x86_64-unknown-linux-gnu/_internal"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "bin/amverge-aarch64-unknown-linux-gnu/_internal"
    } else {
        return Err("resolve_bundled_tool: unsupported platform".to_string());
    };

    // 1) Common bundled location: resources/bin/<tool>.exe
    if let Ok(p) = app.path().resolve(
        format!("bin/{exe_name}"),
        tauri::path::BaseDirectory::Resource,
    ) {
        if p.exists() {
            return Ok(p);
        }
    }

    // 2) Alternative location if only backend internal <tool> is bundled
    if let Ok(p) = app.path().resolve(
        format!("{internal_sidecar}/{exe_name}"),
        tauri::path::BaseDirectory::Resource,
    ) {
        if p.exists() {
            return Ok(p);
        }
    }

    // 3) Dev fallback: walk upward looking for ./bin/<tool>.exe
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    if let Some(mut dir) = exe.parent().map(|p| p.to_path_buf()) {
        for _ in 0..5 {
            let internal_candidate = dir.join(internal_sidecar).join(&exe_name);
            if internal_candidate.exists() {
                return Ok(internal_candidate);
            }

            let candidate = dir.join("bin").join(&exe_name);
            if candidate.exists() {
                return Ok(candidate);
            }
            if !dir.pop() {
                break;
            }
        }
    }

    Err(format!(
        "{exe_name} not found (looked in resources/bin, backend _internal, and dev src-tauri/bin)"
    ))
}
