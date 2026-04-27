use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn get_default_episodes_dir(app: AppHandle) -> Result<String, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("episodes");

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn move_episodes_to_new_dir(
    app: AppHandle,
    old_dir: Option<String>,
    new_dir: Option<String>,
) -> Result<String, String> {
    let old_path = match old_dir {
        Some(path) if !path.trim().is_empty() => PathBuf::from(path),
        _ => app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("episodes"),
    };

    let new_path = match new_dir {
        Some(path) if !path.trim().is_empty() => PathBuf::from(path),
        _ => app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("episodes"),
    };
    let old_path_string = old_path.to_string_lossy().to_string();

    if old_path == new_path {
        return Ok(old_path_string);
    }

    if !old_path.exists() {
        return Ok(old_path_string);
    }

    fs::create_dir_all(&new_path)
        .map_err(|e| format!("Failed to create new directory: {e}"))?;

    for entry in fs::read_dir(&old_path)
        .map_err(|e| format!("Failed to read old directory: {e}"))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {e}"))?;

        let src = entry.path();
        let dest = new_path.join(entry.file_name());

        fs::rename(&src, &dest).or_else(|_| {
            if src.is_dir() {
                let mut options = fs_extra::dir::CopyOptions::new();
                options.copy_inside = true;

                fs::create_dir_all(&dest)
                    .map_err(|e| format!("Failed to create destination folder: {e}"))?;

                fs_extra::dir::copy(&src, &dest, &options)
                    .map_err(|e| format!("Failed to copy directory: {e}"))?;

                fs::remove_dir_all(&src)
                    .map_err(|e| format!("Failed to remove old directory: {e}"))?;
            } else {
                fs::copy(&src, &dest)
                    .map_err(|e| format!("Failed to copy file: {e}"))?;

                fs::remove_file(&src)
                    .map_err(|e| format!("Failed to remove old file: {e}"))?;
            }

            Ok::<(), String>(())
        })?;
    }

    Ok(old_path_string)
}

#[tauri::command]
pub fn save_background_image(app: tauri::AppHandle, source_path: String) -> Result<String, String> {
    let source = Path::new(&source_path);

    if !source.exists() {
        return Err("Selected image does not exist.".to_string());
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {e}"))?;

    let backgrounds_dir = app_data_dir.join("backgrounds");

    fs::create_dir_all(&backgrounds_dir)
        .map_err(|e| format!("Failed to create backgrounds directory: {e}"))?;

    let extension = source
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("png");

    let file_name = format!("background.{}", extension);
    let destination = backgrounds_dir.join(file_name);

    fs::copy(source, &destination)
        .map_err(|e| format!("Failed to copy background image: {e}"))?;

    Ok(destination.to_string_lossy().to_string())
}
