use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

/// subfolder of the storage root (custom path, else app_data/episodes) for episode data; scene_packs/ sits beside it
pub const EPISODES_DIR_NAME: &str = "episodes_storage";
pub const SCENEPACKS_DIR_NAME: &str = "scene_packs";
pub const SCENE_SCOUT_DIR_NAME: &str = "amverge-scene-scout";

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

/// per-episode data (manifest, clips, WebP cache), apart from Scenepacks so they're never deleted together
pub fn resolve_episodes_storage_dir(app: &AppHandle, custom_path: Option<&str>) -> Result<PathBuf, String> {
    Ok(resolve_storage_root(app, custom_path)?.join(EPISODES_DIR_NAME))
}

/// where Scenepacks' own materialized clip copies live
pub fn resolve_scenepacks_storage_dir(app: &AppHandle, custom_path: Option<&str>) -> Result<PathBuf, String> {
    Ok(resolve_storage_root(app, custom_path)?.join(SCENEPACKS_DIR_NAME))
}

/// Scene Scout databases; the name is shared with the CLI's STORAGE_DIR_NAME, so change both together
pub fn resolve_scene_scout_storage_dir(app: &AppHandle, custom_path: Option<&str>) -> Result<PathBuf, String> {
    Ok(resolve_storage_root(app, custom_path)?.join(SCENE_SCOUT_DIR_NAME))
}

/// every folder the app owns under the storage root; a storage move walks this whitelist, never the whole user-chosen root
pub const OWNED_STORAGE_DIRS: &[&str] = &[
    EPISODES_DIR_NAME,
    SCENEPACKS_DIR_NAME,
    SCENE_SCOUT_DIR_NAME,
];

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

/// an episode folder AMVerge created, marked by its `manifest.json` (ids alone could match any user folder)
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
