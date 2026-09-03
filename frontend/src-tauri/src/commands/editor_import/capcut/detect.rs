use std::path::{Path, PathBuf};
use std::process::Command;

use crate::utils::process::apply_no_window;

#[cfg(target_os = "windows")]
pub(super) fn is_capcut_app_process_running() -> bool {
    let mut cmd = Command::new("tasklist");
    apply_no_window(&mut cmd);

    let output = cmd.arg("/FO").arg("CSV").arg("/NH").output();
    let Ok(out) = output else {
        return false;
    };
    if !out.status.success() {
        return false;
    }

    String::from_utf8_lossy(&out.stdout).lines().any(|line| {
        let trimmed = line.trim();
        if !trimmed.starts_with('"') {
            return false;
        }
        let Some(end_quote) = trimmed[1..].find('"') else {
            return false;
        };
        let image = &trimmed[1..1 + end_quote];
        let lowered = image.to_ascii_lowercase();
        lowered.starts_with("capcut")
            && lowered.ends_with(".exe")
            && !lowered.contains("service")
            && !lowered.contains("update")
            && !lowered.contains("crash")
            && !lowered.contains("helper")
    })
}

#[cfg(target_os = "windows")]
pub(super) fn is_capcut_media_extension_supported(path: &str) -> bool {
    let extension = Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase());

    matches!(
        extension.as_deref(),
        Some("mp4") | Some("mov") | Some("jpg") | Some("jpeg") | Some("png") | Some("mp3")
    )
}

#[cfg(target_os = "windows")]
pub(super) fn resolve_capcut_executable() -> Option<PathBuf> {
    if let Ok(custom) = std::env::var("AMVERGE_CAPCUT_PATH") {
        let path = PathBuf::from(custom);
        if path.exists() {
            return Some(path);
        }
    }

    if let Some(running) = resolve_running_capcut_executable() {
        return Some(running);
    }

    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        candidates.push(
            PathBuf::from(&local_app_data)
                .join("CapCut")
                .join("Apps")
                .join("CapCut.exe"),
        );
        candidates.push(
            PathBuf::from(&local_app_data)
                .join("Programs")
                .join("CapCut")
                .join("CapCut.exe"),
        );
    }
    candidates.push(PathBuf::from(r"C:\Program Files\CapCut\Apps\CapCut.exe"));
    candidates.into_iter().find(|candidate| candidate.exists())
}

#[cfg(target_os = "windows")]
fn resolve_running_capcut_executable() -> Option<PathBuf> {
    let mut cmd = Command::new("powershell");
    apply_no_window(&mut cmd);
    let output = cmd
        .arg("-NoProfile")
        .arg("-Command")
        .arg(
            "Get-Process -Name 'CapCut*' -ErrorAction SilentlyContinue | \
             ForEach-Object { $_.Path }",
        )
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    raw.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(PathBuf::from)
        .filter(|candidate| candidate.exists())
        .filter(|candidate| {
            candidate
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| {
                    let lowered = name.to_ascii_lowercase();
                    lowered.starts_with("capcut")
                        && lowered.ends_with(".exe")
                        && !lowered.contains("service")
                        && !lowered.contains("update")
                        && !lowered.contains("crash")
                        && !lowered.contains("helper")
                })
                .unwrap_or(false)
        })
        .max_by_key(|candidate| {
            candidate
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| {
                    if name.eq_ignore_ascii_case("CapCut.exe") {
                        2
                    } else {
                        1
                    }
                })
                .unwrap_or(0)
        })
}
