use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

/// the configured storage root: `custom_path` if the user set one, otherwise
/// `app_data_dir/episodes`. `episodes_storage/` and `scene_packs/` are separate
/// subfolders beneath this root, see `resolve_episodes_storage_dir` and
/// `resolve_scenepacks_storage_dir`
pub fn resolve_storage_root(app: &AppHandle, custom_path: Option<&str>) -> Result<PathBuf, String> {
    match custom_path.map(str::trim) {
        Some(p) if !p.is_empty() => Ok(PathBuf::from(p)),
        _ => Ok(app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("episodes")),
    }
}

/// where per-episode data (manifest, cut clips, WebP cache) lives. kept in its
/// own subfolder, separate from `scene_packs/`, so a Scenepack's materialized
/// copies never share storage with, or get deleted alongside, episode data
pub fn resolve_episodes_storage_dir(app: &AppHandle, custom_path: Option<&str>) -> Result<PathBuf, String> {
    Ok(resolve_storage_root(app, custom_path)?.join("episodes_storage"))
}

/// where Scenepacks' own materialized clip copies live
pub fn resolve_scenepacks_storage_dir(app: &AppHandle, custom_path: Option<&str>) -> Result<PathBuf, String> {
    Ok(resolve_storage_root(app, custom_path)?.join("scene_packs"))
}

pub fn file_name_only(s: &str) -> String {
    let p = Path::new(s);
    p.file_name()
        .and_then(|x| x.to_str())
        .unwrap_or(s)
        .to_string()
}

pub fn dir_name_only(p: &Path) -> String {
    if let Some(name) = p.file_name().and_then(|x| x.to_str()) {
        return name.to_string();
    }
    p.to_string_lossy().to_string()
}

/// true when `path` is a directory AMVerge created for an episode.
///
/// the episodes directory is user-chosen, so it is routinely a folder that also
/// holds files AMVerge did not create. moving or clearing the cache must touch
/// only our own folders, everything else in there belongs to the user.
///
/// `manifest.json` is the ownership marker: every episode gets one written into
/// its folder once detection finishes, for both the video-file and WebP import
/// methods. matching on the folder *name* would not work, since episode ids are
/// ordinary `[A-Za-z0-9_-]` strings that any user folder could match
pub fn is_episode_cache_dir(path: &Path) -> bool {
    path.is_dir() && path.join("manifest.json").is_file()
}

pub fn sanitize_episode_cache_id(raw: &str) -> Result<String, String> {
    let id = raw.trim();
    if id.is_empty() {
        return Err("episode_cache_id is empty".to_string());
    }

    if id.len() > 96 {
        return Err("episode_cache_id is too long".to_string());
    }

    let ok = id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !ok {
        return Err("episode_cache_id contains invalid characters".to_string());
    }

    Ok(id.to_string())
}

pub fn clear_files_in_dir(dir: &Path) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let _ = std::fs::remove_file(path);
            }
        }
    }
}
