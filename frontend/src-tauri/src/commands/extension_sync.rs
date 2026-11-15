use std::path::PathBuf;

use tauri::{AppHandle, Manager};

fn extension_sync_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    Ok(data_dir.join("extension_sync"))
}

#[tauri::command]
pub fn write_app_theme(app: AppHandle, theme_json: String) -> Result<(), String> {
    let parsed: serde_json::Value = serde_json::from_str(&theme_json)
        .map_err(|e| format!("Invalid theme JSON: {e}"))?;
    let serialized = serde_json::to_vec_pretty(&parsed)
        .map_err(|e| format!("Failed to serialize theme: {e}"))?;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let theme_path = data_dir.join("theme.json");
    let temp_path = data_dir.join("theme.json.tmp");
    std::fs::write(&temp_path, serialized)
        .map_err(|e| format!("Failed to write theme.json: {e}"))?;
    std::fs::rename(&temp_path, &theme_path)
        .map_err(|e| format!("Failed to finalize theme.json: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn read_extension_sync_theme(app: AppHandle) -> Result<Option<String>, String> {
    let theme_path = extension_sync_dir(&app)?.join("theme.json");
    if !theme_path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&theme_path)
        .map_err(|e| format!("Failed to read extension theme: {e}"))?;
    Ok(Some(content))
}

#[tauri::command]
pub fn list_extension_sync_episodes(app: AppHandle) -> Result<Vec<String>, String> {
    let episodes_dir = extension_sync_dir(&app)?.join("episodes");
    if !episodes_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = std::fs::read_dir(&episodes_dir)
        .map_err(|e| format!("Failed to read extension episodes dir: {e}"))?;

    let mut manifests: Vec<String> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let manifest_path = path.join("manifest.json");
        if !manifest_path.exists() {
            continue;
        }
        match std::fs::read_to_string(&manifest_path) {
            Ok(content) => manifests.push(content),
            Err(e) => eprintln!("Failed to read extension episode manifest {}: {e}", manifest_path.to_string_lossy()),
        }
    }

    Ok(manifests)
}

#[tauri::command]
pub fn clear_extension_sync(app: AppHandle) -> Result<(), String> {
    let sync_dir = extension_sync_dir(&app)?;
    let episodes_dir = sync_dir.join("episodes");
    if episodes_dir.exists() {
        std::fs::remove_dir_all(&episodes_dir).map_err(|e| e.to_string())?;
    }
    let theme_path = sync_dir.join("theme.json");
    if theme_path.exists() {
        std::fs::remove_file(&theme_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}