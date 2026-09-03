use std::fs;
use std::path::{Path, PathBuf};

#[cfg(target_os = "windows")]
pub(crate) fn resolve_afterfx_executable() -> Option<PathBuf> {
    if let Ok(custom) = std::env::var("AMVERGE_AFTERFX_PATH") {
        let path = PathBuf::from(custom);
        if path.exists() {
            return Some(path);
        }
    }

    find_latest_adobe_executable(
        "Adobe After Effects",
        Path::new("Support Files").join("AfterFX.exe"),
    )
}

#[cfg(target_os = "windows")]
pub(crate) fn resolve_premier_pro_executable() -> Option<PathBuf> {
    if let Ok(custom) = std::env::var("AMVERGE_PREMIERE_PATH") {
        let path = PathBuf::from(custom);
        if path.exists() {
            return Some(path);
        }
    }

    find_latest_adobe_executable(
        "Adobe Premiere Pro",
        PathBuf::from("Adobe Premiere Pro.exe"),
    )
}

#[cfg(target_os = "windows")]
pub(crate) fn resolve_davinci_executable() -> Option<PathBuf> {
    if let Ok(custom) = std::env::var("AMVERGE_RESOLVE_PATH") {
        let path = PathBuf::from(custom);
        if path.exists() {
            return Some(path);
        }
    }

    let candidates = [
        r"C:\Program Files\Blackmagic Design\DaVinci Resolve\Resolve.exe",
        r"C:\Program Files\blackmagic design\DaVinci Resolve\Resolve.exe",
    ];
    candidates.iter().map(PathBuf::from).find(|p| p.exists())
}

#[cfg(target_os = "windows")]
pub(crate) fn find_latest_adobe_executable(
    prefix: &str,
    executable_relative_path: PathBuf,
) -> Option<PathBuf> {
    let bases = [
        PathBuf::from(r"C:\Program Files\Adobe"),
        PathBuf::from(r"C:\Program Files (x86)\Adobe"),
    ];

    for base in bases {
        let Ok(entries) = fs::read_dir(&base) else {
            continue;
        };

        let mut candidates: Vec<PathBuf> = entries
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .filter(|path| path.is_dir())
            .filter(|path| {
                path.file_name()
                    .and_then(|n| n.to_str())
                    .map(|name| name.starts_with(prefix))
                    .unwrap_or(false)
            })
            .collect();

        candidates.sort_by(|a, b| {
            let an = a.file_name().and_then(|n| n.to_str()).unwrap_or_default();
            let bn = b.file_name().and_then(|n| n.to_str()).unwrap_or_default();
            an.cmp(bn)
        });

        for dir in candidates.into_iter().rev() {
            let exe = dir.join(&executable_relative_path);
            if exe.exists() {
                return Some(exe);
            }
        }
    }

    None
}
