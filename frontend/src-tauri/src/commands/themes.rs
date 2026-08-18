//! Developer theme loading.
//!
//! A theme is a folder under `<app_data>/themes/`:
//!
//! ```text
//! themes/
//!   my-theme/
//!     theme-info.json       # id, name, author, description, vars?, layout?
//!     style/
//!       layout.css          # any .css files, nested anywhere in the folder
//!       colors.css
//! ```
//!
//! Every `.css` file in the folder is collected (sorted by relative path, so
//! `00-base.css` sorts before `01-components.css`) and served to the frontend
//! as a single stylesheet. This gives theme authors full control over the app's
//! look without limiting them to a fixed variable set.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

/// The folder the app scans for themes.
pub fn themes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("themes"))
}

/// A theme, parsed from its `theme-info.json` plus the CSS files beside it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeFile {
    pub id: String,
    pub name: String,
    pub author: Option<String>,
    pub description: Option<String>,
    pub vars: serde_json::Map<String, serde_json::Value>,
    pub layout: Option<serde_json::Value>,
    /// Absolute path to the theme folder (used for load/delete).
    pub path: String,
    /// Relative paths of the theme's `.css` files, sorted.
    pub css_files: Vec<String>,
    /// Absolute path to the theme's thumbnail image, if present.
    pub thumbnail: Option<String>,
}

/// Look for a `thumbnail.{png,jpg,jpeg,webp,gif,svg}` in the theme folder root.
fn find_thumbnail(folder: &Path) -> Option<String> {
    for ext in ["png", "jpg", "jpeg", "webp", "gif", "svg"] {
        let candidate = folder.join(format!("thumbnail.{ext}"));
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    None
}

fn parse_theme_info(path: &Path) -> Option<ThemeFile> {
    let text = std::fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    let id = value.get("id")?.as_str()?;
    let name = value.get("name")?.as_str()?;
    if id.trim().is_empty() || name.trim().is_empty() {
        return None;
    }

    let vars = value
        .get("vars")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    let layout = value.get("layout").cloned();

    let folder = path.parent()?.to_path_buf();
    let css_files = collect_css_files(&folder, &folder);
    let thumbnail = find_thumbnail(&folder);

    Some(ThemeFile {
        id: id.to_string(),
        name: name.to_string(),
        author: value.get("author").and_then(|v| v.as_str()).map(String::from),
        description: value
            .get("description")
            .and_then(|v| v.as_str())
            .map(String::from),
        vars,
        layout,
        path: folder.to_string_lossy().to_string(),
        css_files,
        thumbnail,
    })
}

/// Recursively list every `.css` file under `dir`, relative to `base`, sorted.
fn collect_css_files(dir: &Path, base: &Path) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return out;
    };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let path = entry.path();
        if path.is_dir() {
            out.extend(collect_css_files(&path, base));
        } else if path.extension().and_then(|e| e.to_str()) == Some("css") {
            let rel = path
                .strip_prefix(base)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            out.push(rel);
        }
    }

    out.sort();
    out
}

#[tauri::command]
pub fn list_themes(app: AppHandle) -> Result<Vec<ThemeFile>, String> {
    let dir = themes_dir(&app)?;
    let mut themes: Vec<ThemeFile> = Vec::new();

    if dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            let mut entries: Vec<_> = entries.flatten().collect();
            entries.sort_by_key(|e| e.file_name());

            for entry in entries {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let info = path.join("theme-info.json");
                if info.is_file() {
                    if let Some(theme) = parse_theme_info(&info) {
                        themes.push(theme);
                    }
                }
            }
        }
    }

    themes.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(themes)
}

/// Concatenate every `.css` file in a theme folder (sorted) into one stylesheet.
#[tauri::command]
pub fn load_theme_css(app: AppHandle, path: String) -> Result<String, String> {
    let dir = themes_dir(&app)?;
    let folder = PathBuf::from(path.trim());
    let dir_canon = dir.canonicalize().unwrap_or(dir.clone());
    let folder_canon = folder.canonicalize().map_err(|e| e.to_string())?;
    if !folder_canon.starts_with(&dir_canon) {
        return Err("Refusing to load CSS from outside the themes folder.".to_string());
    }

    let css_files = collect_css_files(&folder_canon, &folder_canon);
    let mut css = String::new();
    for rel in css_files {
        let file = folder_canon.join(&rel);
        if let Ok(text) = std::fs::read_to_string(&file) {
            css.push_str(&format!("/* {} */\n", rel));
            css.push_str(&text);
            css.push('\n');
        }
    }
    Ok(css)
}

#[tauri::command]
pub fn delete_theme(app: AppHandle, path: String) -> Result<(), String> {
    let dir = themes_dir(&app)?;
    let target = PathBuf::from(path.trim());
    let dir_canon = dir.canonicalize().unwrap_or(dir.clone());
    let target_canon = target.canonicalize().map_err(|e| e.to_string())?;
    if !target_canon.starts_with(&dir_canon) || target_canon == dir_canon {
        return Err("Refusing to delete a path outside the themes folder.".to_string());
    }
    std::fs::remove_dir_all(&target_canon).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_themes_folder(app: AppHandle) -> Result<(), String> {
    let dir = themes_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let dir_string = dir.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&dir_string)
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&dir_string)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {e}"))?;
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&dir_string)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {e}"))?;
    }

    Ok(())
}
