use tauri::AppHandle;

use crate::utils::paths::{is_episode_cache_dir, resolve_episodes_storage_dir, sanitize_episode_cache_id};

#[tauri::command]
pub async fn delete_episode_cache(
    app: AppHandle,
    episode_cache_id: String,
    custom_path: Option<String>,
) -> Result<(), String> {
    let id = sanitize_episode_cache_id(&episode_cache_id)?;
    let base_dir = resolve_episodes_storage_dir(&app, custom_path.as_deref())?;

    let episode_dir = base_dir.join(id);
    if episode_dir.exists() {
        std::fs::remove_dir_all(&episode_dir).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn clear_episode_panel_cache(
    app: AppHandle,
    custom_path: Option<String>,
) -> Result<(), String> {
    let episodes_dir = resolve_episodes_storage_dir(&app, custom_path.as_deref())?;

    if !episodes_dir.exists() {
        return Ok(());
    }

    // delete episode folders individually rather than the directory itself. The
    // episodes directory is user-chosen, so wiping it whole would destroy any of
    // their own files stored alongside the cache.
    let entries = std::fs::read_dir(&episodes_dir)
        .map_err(|e| format!("Failed to read episodes directory: {e}"))?;

    let mut failures: Vec<String> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !is_episode_cache_dir(&path) {
            continue;
        }
        if let Err(e) = std::fs::remove_dir_all(&path) {
            failures.push(format!("{}: {e}", entry.file_name().to_string_lossy()));
        }
    }

    if !failures.is_empty() {
        return Err(format!(
            "Failed to delete {} episode folder(s): {}",
            failures.len(),
            failures.join("; ")
        ));
    }

    Ok(())
}
