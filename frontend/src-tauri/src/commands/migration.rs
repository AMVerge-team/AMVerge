//! first launch after AMVerge 1: imports the settings and episodes V1 1.3.3 exported to `v2-migration.json` (V1 has its own identifier, so its storage is out of V2's reach)

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::commands::settings::move_entry;
use crate::utils::logging::console_log;
use crate::utils::paths::{resolve_episodes_storage_dir, sanitize_episode_cache_id};

const V1_IDENTIFIER: &str = "com.amiri.amverge";
const MIGRATION_FILE: &str = "v2-migration.json";
const IMPORTED_MARKER: &str = "v1-imported";
/// folders of user assets that keep their name between versions
const ASSET_DIRS: &[&str] = &["backgrounds", "profile_icons"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct V1Source {
    v1_data_dir: String,
    v2_data_dir: String,
    /// where V1 kept its episode folders (its custom episodes path, else its app data)
    old_episodes_dir: String,
    /// where they go in V2: the same custom root if V1 had one, else V2's app data
    new_episodes_dir: String,
    /// what the bridge release exported; None when the user came straight from 1.3.2 or older
    migration: Option<Value>,
    /// with no export, the episodes rebuilt from V1's folders on disk
    recovered: Vec<RecoveredEpisode>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveredEpisode {
    id: String,
    name: String,
    /// folder modified time, in ms
    imported_at: u64,
    clips: Vec<RecoveredClip>,
}

#[derive(Serialize)]
pub struct RecoveredClip {
    src: String,
    thumbnail: String,
}

#[derive(Deserialize)]
pub struct V1EpisodeMove {
    id: String,
    /// V2 manifest for the episode, written into its folder after the move
    manifest: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct V1ImportResult {
    moved: Vec<String>,
}

fn v2_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn v1_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    v1_dir_beside(&v2_data_dir(app)?)
}

/// V1's custom episodes path, read out of the settings the bridge exported
fn v1_custom_episodes_path(migration: Option<&Value>) -> Option<String> {
    let raw = migration?
        .get("localStorage")?
        .get("amverge.generalSettings.v2")?
        .as_str()?;
    let parsed: Value = serde_json::from_str(raw).ok()?;
    let path = parsed.get("state")?.get("episodesPath")?.as_str()?.trim();
    (!path.is_empty()).then(|| path.to_string())
}

/// what there is to import from V1, or None when there is nothing (fresh install, or done already)
#[tauri::command]
pub fn v1_migration_source(app: AppHandle) -> Result<Option<V1Source>, String> {
    let v2 = v2_data_dir(&app)?;
    if v2.join(IMPORTED_MARKER).exists() {
        return Ok(None);
    }
    let v1 = v1_data_dir(&app)?;
    if !v1.is_dir() {
        return Ok(None);
    }

    let migration = fs::read_to_string(v1.join(MIGRATION_FILE))
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok());

    // V1's custom path held episode folders directly; in V2 the same path is the storage root
    let custom = v1_custom_episodes_path(migration.as_ref());
    let old_episodes_dir = match &custom {
        Some(path) => PathBuf::from(path),
        None => v1.join("episodes"),
    };
    let new_episodes_dir = resolve_episodes_storage_dir(&app, custom.as_deref())?;

    // last resort, only when there's no export at all
    let recovered = if migration.is_some() { Vec::new() } else { recover_episodes(&old_episodes_dir) };

    Ok(Some(V1Source {
        v1_data_dir: v1.to_string_lossy().to_string(),
        v2_data_dir: v2.to_string_lossy().to_string(),
        old_episodes_dir: old_episodes_dir.to_string_lossy().to_string(),
        new_episodes_dir: new_episodes_dir.to_string_lossy().to_string(),
        migration,
        recovered,
    }))
}

/// rebuilds V1 episodes from their folders: V1 cut each scene to `<video name>_NNNN.mp4` with a matching `.jpg`
fn recover_episodes(episodes_dir: &Path) -> Vec<RecoveredEpisode> {
    let Ok(entries) = fs::read_dir(episodes_dir) else {
        return Vec::new();
    };
    let mut episodes: Vec<RecoveredEpisode> = entries
        .flatten()
        .filter_map(|entry| recover_episode(&entry.path()))
        .collect();
    episodes.sort_by_key(|episode| episode.imported_at);
    episodes
}

fn recover_episode(dir: &Path) -> Option<RecoveredEpisode> {
    let id = sanitize_episode_cache_id(&dir.file_name()?.to_string_lossy()).ok()?;
    if !dir.is_dir() {
        return None;
    }

    let mut clip_paths: Vec<PathBuf> = fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| scene_clip_prefix(path).is_some())
        .collect();
    clip_paths.sort();

    let name = scene_clip_prefix(clip_paths.first()?)?;
    let clips = clip_paths
        .iter()
        .map(|path| RecoveredClip {
            src: path.to_string_lossy().to_string(),
            thumbnail: path.with_extension("jpg").to_string_lossy().to_string(),
        })
        .collect();

    let imported_at = fs::metadata(dir)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |since| since.as_millis() as u64);

    Some(RecoveredEpisode { id, name, imported_at, clips })
}

/// `Name_0007.mp4` gives `Name`; anything else (previews, proxies) gives None
fn scene_clip_prefix(path: &Path) -> Option<String> {
    if path.extension()?.to_str()? != "mp4" {
        return None;
    }
    let stem = path.file_stem()?.to_str()?;
    let (name, index) = stem.rsplit_once('_')?;
    let is_index = index.len() >= 4 && index.bytes().all(|b| b.is_ascii_digit());
    (is_index && !name.is_empty()).then(|| name.to_string())
}

/// moves V1's episode folders and assets into V2 and marks the import done; called even with no episodes, for the marker
#[tauri::command]
pub async fn import_v1_files(
    app: AppHandle,
    old_episodes_dir: String,
    new_episodes_dir: String,
    episodes: Vec<V1EpisodeMove>,
) -> Result<V1ImportResult, String> {
    let v1 = v1_data_dir(&app)?;
    let v2 = v2_data_dir(&app)?;

    // a same-drive move is a rename, a cross-drive one copies; either way off the main thread
    tauri::async_runtime::spawn_blocking(move || {
        let old_dir = PathBuf::from(old_episodes_dir);
        let new_dir = PathBuf::from(new_episodes_dir);
        fs::create_dir_all(&new_dir).map_err(|e| format!("Failed to create episodes folder: {e}"))?;

        let mut leftovers = Vec::new();
        let mut moved = Vec::new();
        for episode in episodes {
            match move_episode(&old_dir, &new_dir, &episode, &mut leftovers) {
                Ok(()) => moved.push(episode.id),
                Err(e) => console_log("MIGRATION|v1", &format!("skipped episode {}: {e}", episode.id)),
            }
        }

        for name in ASSET_DIRS {
            if let Err(e) = copy_assets(&v1.join(name), &v2.join(name)) {
                console_log("MIGRATION|v1", &format!("could not copy {name}: {e}"));
            }
        }

        fs::create_dir_all(&v2).map_err(|e| e.to_string())?;
        fs::write(v2.join(IMPORTED_MARKER), b"").map_err(|e| e.to_string())?;
        console_log("MIGRATION|v1", &format!("imported {} episode(s) from AMVerge 1", moved.len()));
        Ok(V1ImportResult { moved })
    })
    .await
    .map_err(|e| format!("V1 import failed: {e}"))?
}

fn move_episode(
    old_dir: &Path,
    new_dir: &Path,
    episode: &V1EpisodeMove,
    leftovers: &mut Vec<String>,
) -> Result<(), String> {
    let id = sanitize_episode_cache_id(&episode.id)?;
    let src = old_dir.join(&id);
    if !src.is_dir() {
        return Err("folder not found".to_string());
    }
    let dest = new_dir.join(&id);
    move_entry(&src, &dest, leftovers)?;
    // the manifest is what V2 recognizes an episode folder by (storage moves, cache clears)
    let manifest = serde_json::to_string_pretty(&episode.manifest).map_err(|e| e.to_string())?;
    fs::write(dest.join("manifest.json"), manifest).map_err(|e| e.to_string())
}

/// deletes V1's leftover app data once a previous launch finished the import, so nothing named after V1 stays behind.
/// runs at startup, so never in the same session as the import itself
pub fn remove_v1_data_in_background(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(e) = remove_v1_data(&app) {
            console_log("MIGRATION|v1", &format!("kept AMVerge 1 data: {e}"));
        }
    });
}

fn remove_v1_data(app: &AppHandle) -> Result<(), String> {
    // dev builds run beside a real V1 install on the developer's PC
    if cfg!(debug_assertions) || !v2_data_dir(app)?.join(IMPORTED_MARKER).exists() {
        return Ok(());
    }
    let roaming = v1_data_dir(app)?;
    let local = v1_dir_beside(&app.path().app_local_data_dir().map_err(|e| e.to_string())?)?;

    // an episode that didn't move would be lost, so any file left in V1's episodes keeps everything
    if has_files(&roaming.join("episodes")) {
        return Err("episodes that didn't move are still in its episodes folder".to_string());
    }

    for dir in [roaming, local] {
        remove_v1_dir(&dir)?;
    }
    Ok(())
}

/// V1's folder next to one of V2's (same parent, V1's identifier)
fn v1_dir_beside(v2_dir: &Path) -> Result<PathBuf, String> {
    let parent = v2_dir.parent().ok_or("app data dir has no parent")?;
    Ok(parent.join(V1_IDENTIFIER))
}

/// recursive delete, refused for any folder not named exactly like V1's
fn remove_v1_dir(dir: &Path) -> Result<(), String> {
    if dir.file_name().and_then(|name| name.to_str()) != Some(V1_IDENTIFIER) {
        return Err(format!("refused to delete {}", dir.display()));
    }
    if !dir.exists() {
        return Ok(());
    }
    fs::remove_dir_all(dir).map_err(|e| format!("could not delete {}: {e}", dir.display()))?;
    console_log("MIGRATION|v1", &format!("removed {}", dir.display()));
    Ok(())
}

fn has_files(dir: &Path) -> bool {
    let Ok(entries) = fs::read_dir(dir) else {
        return false;
    };
    entries.flatten().any(|entry| {
        let path = entry.path();
        if path.is_dir() { has_files(&path) } else { true }
    })
}

/// copies, never moves: V1's settings still point here until V1 is uninstalled
fn copy_assets(src: &Path, dest: &Path) -> Result<(), String> {
    if !src.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if let (true, Some(name)) = (path.is_file(), path.file_name()) {
            let target = dest.join(name);
            if !target.exists() {
                fs::copy(&path, &target).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}
