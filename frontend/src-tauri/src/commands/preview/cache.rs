//! capped, least-recently-used cache of playable previews for files the app does not own (scout ranges, flow picks)

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use tauri::{AppHandle, Manager};

use crate::utils::logging::console_log;

/// past this the least recently used previews are deleted
const MAX_CACHE_BYTES: u64 = 1024 * 1024 * 1024;

/// a temp file this old belongs to an encode that died, not one still running
const STALE_TMP_AGE: Duration = Duration::from_secs(60 * 60);

pub(crate) fn preview_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("No cache directory: {e}"))?
        .join("scene_range_previews");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create preview cache: {e}"))?;
    Ok(dir)
}

/// marks a cached preview as just used, so pruning keeps it longest
pub(crate) fn touch(path: &Path) {
    if let Ok(file) = std::fs::File::options().write(true).open(path) {
        let _ = file.set_modified(SystemTime::now());
    }
}

struct Entry {
    path: PathBuf,
    size: u64,
    modified: SystemTime,
    in_progress: bool,
}

fn entries(dir: &Path) -> Vec<Entry> {
    let Ok(read) = std::fs::read_dir(dir) else { return Vec::new() };
    read.flatten()
        .filter_map(|item| {
            let meta = item.metadata().ok().filter(|m| m.is_file())?;
            let path = item.path();
            let in_progress = path.to_string_lossy().ends_with(".tmp.mp4");
            Some(Entry { size: meta.len(), modified: meta.modified().unwrap_or(SystemTime::UNIX_EPOCH), path, in_progress })
        })
        .collect()
}

fn total_size(dir: &Path) -> u64 {
    entries(dir).iter().map(|e| e.size).sum()
}

/// deletes dead temp files, then the least recently used previews until the folder fits the cap
fn prune(dir: &Path, max_bytes: u64) {
    let now = SystemTime::now();
    let mut total = 0u64;
    let mut done: Vec<Entry> = Vec::new();
    for entry in entries(dir) {
        let age = now.duration_since(entry.modified).unwrap_or_default();
        if entry.in_progress && age > STALE_TMP_AGE {
            let _ = std::fs::remove_file(&entry.path);
            continue;
        }
        total += entry.size;
        if !entry.in_progress {
            done.push(entry);
        }
    }
    if total <= max_bytes {
        return;
    }

    done.sort_by_key(|e| e.modified);
    let before = total;
    for entry in done {
        if total <= max_bytes {
            break;
        }
        // a preview the webview has open cannot be deleted on windows; it stays and the next one goes
        if std::fs::remove_file(&entry.path).is_ok() {
            total -= entry.size;
        }
    }
    console_log("PREVIEW|cache", &format!("pruned {} MB, {} MB left", (before - total) >> 20, total >> 20));
}

/// prunes on a blocking thread without making the caller wait
pub(crate) fn prune_in_background(app: &AppHandle) {
    let Ok(dir) = preview_cache_dir(app) else { return };
    tauri::async_runtime::spawn_blocking(move || prune(&dir, MAX_CACHE_BYTES));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(dir: &Path, name: &str, bytes: usize, age_secs: u64) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, vec![0u8; bytes]).unwrap();
        let file = std::fs::File::options().write(true).open(&path).unwrap();
        file.set_modified(SystemTime::now() - Duration::from_secs(age_secs)).unwrap();
        path
    }

    #[test]
    fn prunes_oldest_first_and_spares_running_encodes() {
        let dir = std::env::temp_dir().join(format!("amverge-cache-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let oldest = file(&dir, "a.mp4", 100, 300);
        let middle = file(&dir, "b.mp4", 100, 200);
        let newest = file(&dir, "c.mp4", 100, 100);
        let running = file(&dir, "d.tmp.mp4", 100, 10);
        let dead = file(&dir, "e.tmp.mp4", 100, 2 * 60 * 60);

        // 400 bytes count (the dead temp file is just removed), so two finished files must go
        prune(&dir, 250);

        assert!(!dead.exists(), "a temp file from a dead encode is removed");
        assert!(!oldest.exists() && !middle.exists(), "the least recently used go first");
        assert!(newest.exists(), "the newest preview stays");
        assert!(running.exists(), "an encode still running is never touched");
        let _ = std::fs::remove_dir_all(&dir);
    }
}

/// bytes the preview cache holds, for settings
#[tauri::command]
pub async fn preview_cache_size(app: AppHandle) -> Result<u64, String> {
    let dir = preview_cache_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || total_size(&dir))
        .await
        .map_err(|e| format!("cache size task failed: {e}"))
}

/// deletes every finished preview and returns the bytes left (encodes still running, files in use)
#[tauri::command]
pub async fn clear_preview_cache(app: AppHandle) -> Result<u64, String> {
    let dir = preview_cache_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        for entry in entries(&dir).into_iter().filter(|e| !e.in_progress) {
            let _ = std::fs::remove_file(&entry.path);
        }
        total_size(&dir)
    })
    .await
    .map_err(|e| format!("cache clear task failed: {e}"))
}
