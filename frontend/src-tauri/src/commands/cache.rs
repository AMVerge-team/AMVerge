use std::path::Path;
use tauri::AppHandle;

use crate::utils::paths::{resolve_episodes_storage_dir, sanitize_episode_cache_id};

fn remove_dir_with_retries(path: &Path) -> Result<(), std::io::Error> {
    let mut last_err = None;
    for attempt in 0..5 {
        match std::fs::remove_dir_all(path) {
            Ok(()) => return Ok(()),
            Err(e) => {
                if !path.exists() {
                    return Ok(());
                }
                last_err = Some(e);
                if attempt < 4 {
                    std::thread::sleep(std::time::Duration::from_millis(250));
                }
            }
        }
    }
    Err(last_err.unwrap_or_else(|| std::io::Error::other("failed to remove directory")))
}

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
        tokio::task::spawn_blocking(move || remove_dir_with_retries(&episode_dir))
            .await
            .map_err(|e| format!("delete_episode_cache task panicked: {e}"))?
            .map_err(|e| e.to_string())?;
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

    tokio::task::spawn_blocking(move || {
        // episodes_dir is the dedicated `episodes_storage` folder, so every child dir (including
        // half-deleted episodes whose manifest.json was already removed) belongs to the cache
        let entries = std::fs::read_dir(&episodes_dir)
            .map_err(|e| format!("Failed to read episodes directory: {e}"))?;

        let mut failures: Vec<String> = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            if let Err(e) = remove_dir_with_retries(&path) {
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
    })
    .await
    .map_err(|e| format!("clear_episode_panel_cache task panicked: {e}"))?
}
