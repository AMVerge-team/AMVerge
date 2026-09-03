use std::fs;
use std::path::PathBuf;

use super::scripts::script_runtime_dir;

#[cfg(target_os = "windows")]
pub(crate) fn normalize_windows_editor_import_path(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    trimmed.replace('/', "\\")
}

#[cfg(target_os = "windows")]
pub(crate) fn should_stage_windows_editor_import_path(path: &str) -> bool {
    let normalized = normalize_windows_editor_import_path(path);
    if normalized.is_empty() {
        return true;
    }

    if normalized.len() >= 180 {
        return true;
    }

    let lowered = normalized.to_ascii_lowercase();
    lowered.contains("\\appdata\\roaming\\")
        || lowered.contains("\\appdata\\local\\")
        || lowered.contains("\\app.amverge\\episodes\\")
        || lowered.contains("\\episodes_storage\\")
        || lowered.contains("\\scene_packs\\")
}

#[cfg(target_os = "windows")]
pub(crate) fn sanitize_stage_file_stem(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect();

    let trimmed = cleaned.trim_matches('_');
    if trimmed.is_empty() {
        "clip".to_string()
    } else {
        trimmed.chars().take(24).collect()
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn stage_windows_editor_import_paths(
    editor_slug: &str,
    media_paths: &[String],
) -> Result<Vec<String>, String> {
    stage_windows_editor_import_paths_inner(editor_slug, media_paths, false)
}

#[cfg(target_os = "windows")]
pub(crate) fn stage_windows_editor_import_paths_forced(
    editor_slug: &str,
    media_paths: &[String],
) -> Result<Vec<String>, String> {
    stage_windows_editor_import_paths_inner(editor_slug, media_paths, true)
}

#[cfg(target_os = "windows")]
pub(crate) fn stage_windows_editor_import_paths_inner(
    editor_slug: &str,
    media_paths: &[String],
    force_stage: bool,
) -> Result<Vec<String>, String> {
    if media_paths.is_empty() {
        return Err("No media paths were provided for editor import.".to_string());
    }

    let should_stage = force_stage
        || media_paths
            .iter()
            .any(|path| should_stage_windows_editor_import_path(path));

    if !should_stage {
        return Ok(media_paths.to_vec());
    }

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let mut stage_dir = script_runtime_dir()
        .join("staged_media")
        .join(editor_slug.trim().to_ascii_lowercase());
    stage_dir.push(format!("{}_{}", std::process::id(), ts));
    fs::create_dir_all(&stage_dir).map_err(|e| {
        format!(
            "Failed to create staging directory for editor import ({}): {e}",
            stage_dir.display()
        )
    })?;

    let mut staged_paths = Vec::with_capacity(media_paths.len());
    for (idx, raw) in media_paths.iter().enumerate() {
        let normalized = normalize_windows_editor_import_path(raw);
        if normalized.is_empty() {
            return Err("Encountered empty media path during editor import staging.".to_string());
        }

        let source = PathBuf::from(&normalized);
        if !source.exists() {
            return Err(format!(
                "Media path does not exist for editor import: {}",
                source.display()
            ));
        }

        let extension = source
            .extension()
            .and_then(|ext| ext.to_str())
            .map(str::to_ascii_lowercase)
            .filter(|ext| !ext.is_empty())
            .unwrap_or_else(|| "bin".to_string());
        let stem = source
            .file_stem()
            .and_then(|name| name.to_str())
            .map(sanitize_stage_file_stem)
            .unwrap_or_else(|| "clip".to_string());
        let staged_file_name = format!("{:04}_{}.{}", idx + 1, stem, extension);
        let staged = stage_dir.join(staged_file_name);

        if fs::hard_link(&source, &staged).is_err() {
            fs::copy(&source, &staged).map_err(|e| {
                format!(
                    "Failed to stage media for editor import ({} -> {}): {e}",
                    source.display(),
                    staged.display()
                )
            })?;
        }

        staged_paths.push(staged.to_string_lossy().to_string());
    }

    Ok(staged_paths)
}
