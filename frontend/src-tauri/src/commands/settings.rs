use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use image::DynamicImage;
use tauri::{AppHandle, Manager, State};

use crate::commands::scene_scout::SceneScoutWorkerState;
use crate::state::{ActiveFfmpegPids, ActiveInstall, ActiveResume, ActiveSidecar, ExportAbortState};
use crate::utils::ffmpeg::resolve_bundled_tool;
use crate::utils::logging::console_log;
use crate::utils::paths::{
    resolve_episodes_storage_dir, resolve_storage_root,
    OWNED_STORAGE_DIRS, STORAGE_MOVE_LOCK,
};
use crate::utils::process::apply_no_window;

/// true when a file is still at `path`; the webview cannot stat files itself
#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).is_file()
}

#[tauri::command]
pub fn get_default_episodes_dir(app: AppHandle) -> Result<String, String> {
    let path = resolve_episodes_storage_dir(&app, None)?;

    Ok(path.to_string_lossy().to_string())
}

fn rebase_owned_path(raw: &str, new_root: &Path) -> String {
    let slashed = raw.replace('\\', "/");
    let lower = slashed.to_lowercase();
    for dir in OWNED_STORAGE_DIRS {
        let with_child = format!("/{dir}/");
        if let Some(at) = lower.rfind(&with_child) {
            return new_root
                .join(&slashed[at + 1..])
                .to_string_lossy()
                .to_string();
        }
        let whole_dir = format!("/{dir}");
        if lower.ends_with(&whole_dir) {
            return new_root.join(dir).to_string_lossy().to_string();
        }
    }
    raw.to_string()
}

fn rebase_manifest_value(value: &mut serde_json::Value, new_root: &Path) {
    match value {
        serde_json::Value::String(path) => *path = rebase_owned_path(path, new_root),
        serde_json::Value::Array(items) => {
            for item in items {
                rebase_manifest_value(item, new_root);
            }
        }
        serde_json::Value::Object(map) => {
            for item in map.values_mut() {
                rebase_manifest_value(item, new_root);
            }
        }
        _ => {}
    }
}

fn rebase_manifest_file(path: &Path, new_root: &Path) -> Result<bool, String> {
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let Ok(mut manifest) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return Ok(false);
    };
    let original = manifest.clone();
    rebase_manifest_value(&mut manifest, new_root);
    if manifest == original {
        return Ok(false);
    }
    let serialized = serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, serialized).map_err(|e| e.to_string())?;
    fs::rename(&temp, path).map_err(|e| e.to_string())?;
    Ok(true)
}

fn rebase_storage_manifests_sync(storage_root: &Path) -> Result<usize, String> {
    let episodes = storage_root.join("episodes_storage");
    let Ok(entries) = fs::read_dir(episodes) else {
        return Ok(0);
    };
    let mut changed = 0;
    for entry in entries.flatten() {
        for name in ["manifest.json", "sync_preview.json"] {
            let manifest = entry.path().join(name);
            if manifest.is_file() {
                match rebase_manifest_file(&manifest, storage_root) {
                    Ok(true) => changed += 1,
                    Ok(false) => {}
                    Err(err) => console_log(
                        "SETTINGS|rebase",
                        &format!("could not repair {}: {err}", manifest.display()),
                    ),
                }
            }
        }
    }
    Ok(changed)
}

fn rebase_path_from_root(raw: &str, old_root: &Path, new_root: &Path) -> String {
    let slashed = raw.replace('\\', "/");
    let old_slashed = old_root.to_string_lossy().replace('\\', "/");
    let old_trimmed = old_slashed.trim_end_matches('/');
    let normalize = |path: &str| {
        let value = path.replace('\\', "/");
        let value = value.trim_end_matches('/').to_string();
        if cfg!(windows) || cfg!(target_os = "macos") {
            value.to_lowercase()
        } else {
            value
        }
    };
    if normalize(&slashed) == normalize(old_trimmed) {
        return new_root.to_string_lossy().to_string();
    }
    let prefix = format!("{old_trimmed}/");
    if normalize(&slashed).starts_with(&normalize(&prefix)) {
        return new_root
            .join(&slashed[prefix.len()..])
            .to_string_lossy()
            .to_string();
    }
    raw.to_string()
}

fn scene_scout_table_exists(conn: &rusqlite::Connection, table: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
        [table],
        |_| Ok(true),
    )
    .unwrap_or(false)
}

fn rebase_scene_scout_database(
    path: &Path,
    old_root: &Path,
    new_root: &Path,
) -> Result<bool, String> {
    let mut conn = rusqlite::Connection::open(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut changed = false;
    for (table, id_column, path_column) in [
        ("processed_videos", "id", "filepath"),
        ("image_embeddings", "id", "filepath"),
        ("index_queue", "id", "path"),
    ] {
        if !scene_scout_table_exists(&tx, table) {
            continue;
        }
        let mut updates = Vec::new();
        {
            let mut stmt = tx
                .prepare(&format!("SELECT {id_column}, {path_column} FROM {table}"))
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |row| {
                    let id: i64 = row.get(0)?;
                    let path: String = row.get(1)?;
                    Ok((id, path))
                })
                .map_err(|e| e.to_string())?;
            for row in rows {
                let (id, old_path) = row.map_err(|e| e.to_string())?;
                let new_path = rebase_path_from_root(&old_path, old_root, new_root);
                if new_path != old_path {
                    updates.push((id, new_path));
                }
            }
        }
        for (id, new_path) in updates {
            tx.execute(
                &format!("UPDATE {table} SET {path_column} = ?1 WHERE {id_column} = ?2"),
                rusqlite::params![new_path, id],
            )
            .map_err(|e| format!("Failed to rebase {} in {}: {e}", path.display(), table))?;
            changed = true;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(changed)
}

fn rebase_scene_scout_databases(
    staged_root: &Path,
    old_root: &Path,
    new_root: &Path,
) -> Result<usize, String> {
    let directory = staged_root.join("amverge-scene-scout");
    let Ok(entries) = fs::read_dir(directory) else {
        return Ok(0);
    };
    let mut changed = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let supported = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| matches!(ext.to_lowercase().as_str(), "scoutdb" | "db" | "scdb" | "sqlite" | "sqlite3"))
            .unwrap_or(false);
        if supported && rebase_scene_scout_database(&path, old_root, new_root)? {
            changed += 1;
        }
    }
    Ok(changed)
}

#[tauri::command]
pub async fn rebase_storage_manifests(
    app: AppHandle,
    custom_episodes_path: Option<String>,
) -> Result<usize, String> {
    let root = resolve_storage_root(&app, custom_episodes_path.as_deref())?;
    tauri::async_runtime::spawn_blocking(move || rebase_storage_manifests_sync(&root))
        .await
        .map_err(|e| format!("Manifest path repair failed: {e}"))?
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageBreakdown {
    pub episodes_root: String,
    pub episodes_bytes: u64,
    pub episodes_count: usize,
    pub scenepacks_bytes: u64,
    pub scenepacks_count: usize,
    pub scene_scout_bytes: u64,
    pub scene_scout_count: usize,
    pub preview_cache_bytes: u64,
    pub tools_cache_bytes: u64,
    pub export_cache_bytes: u64,
}

#[tauri::command]
pub async fn get_storage_breakdown(
    app: AppHandle,
    custom_episodes_path: Option<String>,
) -> Result<StorageBreakdown, String> {
    let app_for_task = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        use crate::commands::deps::status::dir_size_bytes;
        use crate::utils::paths::{
            is_episode_cache_dir, resolve_episodes_storage_dir, resolve_scene_scout_storage_dir,
            resolve_scenepacks_storage_dir, resolve_storage_root,
        };

        let root = resolve_storage_root(&app_for_task, custom_episodes_path.as_deref())?;
        let ep_dir = resolve_episodes_storage_dir(&app_for_task, custom_episodes_path.as_deref())?;
        let sp_dir =
            resolve_scenepacks_storage_dir(&app_for_task, custom_episodes_path.as_deref())?;
        let scout_dir =
            resolve_scene_scout_storage_dir(&app_for_task, custom_episodes_path.as_deref())?;

        let episodes_bytes = dir_size_bytes(&ep_dir);
        let episodes_count = std::fs::read_dir(&ep_dir)
            .ok()
            .map(|rd| {
                rd.flatten()
                    .filter(|e| is_episode_cache_dir(&e.path()))
                    .count()
            })
            .unwrap_or(0);

        let scenepacks_bytes = dir_size_bytes(&sp_dir);
        let scenepacks_count = std::fs::read_dir(&sp_dir)
            .ok()
            .map(|rd| rd.flatten().filter(|e| e.path().is_dir()).count())
            .unwrap_or(0);

        let scene_scout_bytes = dir_size_bytes(&scout_dir);
        let scene_scout_count = std::fs::read_dir(&scout_dir)
            .ok()
            .map(|rd| {
                rd.flatten()
                    .filter(|e| {
                        let p = e.path();
                        p.is_file()
                            && matches!(
                                p.extension().and_then(|s| s.to_str()).map(|s| s.to_lowercase()).as_deref(),
                                Some("scoutdb") | Some("db") | Some("scdb") | Some("sqlite") | Some("sqlite3")
                            )
                    })
                    .count()
            })
            .unwrap_or(0);

        let app_cache = app_for_task.path().app_cache_dir().ok();
        let preview_cache_bytes = app_cache
            .as_ref()
            .map(|c| dir_size_bytes(&c.join("scene_range_previews")))
            .unwrap_or(0);
        let tools_cache_bytes = app_cache
            .as_ref()
            .map(|c| dir_size_bytes(&c.join("tools_inputs")))
            .unwrap_or(0);
        let export_cache_bytes = app_cache
            .as_ref()
            .map(|c| dir_size_bytes(&c.join("export_keyframes")))
            .unwrap_or(0);

        Ok(StorageBreakdown {
            episodes_root: root.to_string_lossy().to_string(),
            episodes_bytes,
            episodes_count,
            scenepacks_bytes,
            scenepacks_count,
            scene_scout_bytes,
            scene_scout_count,
            preview_cache_bytes,
            tools_cache_bytes,
            export_cache_bytes,
        })
    })
    .await
    .map_err(|e| format!("Storage breakdown failed: {e}"))?
}

pub(crate) fn ensure_media_idle(
    sidecar: &ActiveSidecar,
    install: &ActiveInstall,
    resume: &ActiveResume,
    ffmpeg: &ActiveFfmpegPids,
    export: &ExportAbortState,
) -> Result<(), String> {
    let sidecar_active = sidecar.procs.lock().map(|procs| !procs.is_empty()).unwrap_or(true);
    let resume_active = resume.pids.lock().map(|pids| !pids.is_empty()).unwrap_or(true);
    let ffmpeg_active = ffmpeg.pids.lock().map(|pids| !pids.is_empty()).unwrap_or(true);
    let export_active = export.pids.lock().map(|pids| !pids.is_empty()).unwrap_or(true);
    if sidecar_active || install.is_running() || resume_active || ffmpeg_active || export_active {
        return Err("Stop the current import, export, preview, or AI install before moving storage.".to_string());
    }
    Ok(())
}

/// moves every folder in `OWNED_STORAGE_DIRS` to the new root; returns the old episodes folder for path rewrites
#[tauri::command]
pub async fn move_storage_to_new_dir(
    app: AppHandle,
    sidecar: State<'_, ActiveSidecar>,
    install: State<'_, ActiveInstall>,
    resume: State<'_, ActiveResume>,
    ffmpeg: State<'_, ActiveFfmpegPids>,
    export: State<'_, ExportAbortState>,
    worker: State<'_, SceneScoutWorkerState>,
    old_dir: Option<String>,
    new_dir: Option<String>,
) -> Result<String, String> {
    let _move_guard = STORAGE_MOVE_LOCK
        .try_lock()
        .map_err(|_| "Another storage move is already running.".to_string())?;
    ensure_media_idle(&sidecar, &install, &resume, &ffmpeg, &export)?;
    worker.stop_daemon("moving library storage").await;

    let old_root = resolve_storage_root(&app, old_dir.as_deref())?;
    let new_root = resolve_storage_root(&app, new_dir.as_deref())?;

    let old_episodes = resolve_episodes_storage_dir(&app, old_dir.as_deref())?;
    let old_episodes_string = old_episodes.to_string_lossy().to_string();

    if same_fs_path(&old_root, &new_root) {
        return Ok(old_episodes_string);
    }

    let app_for_task = app.clone();
    // a cross-drive move copies gigabytes; on the main thread windows marked the app hung and closed it
    tauri::async_runtime::spawn_blocking(move || {
        move_storage_with_progress(&old_root, &new_root, Some(&app_for_task))
    })
    .await
    .map_err(|e| format!("Storage move failed: {e}"))??;

    Ok(old_episodes_string)
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StorageMoveProgressPayload {
    percent: f64,
    indeterminate: bool,
    message: String,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StorageMoveLogPayload {
    line: String,
}

pub(crate) fn emit_move_log(app: Option<&AppHandle>, line: impl Into<String>) {
    let text = line.into();
    if let Some(app) = app {
        use tauri::Emitter;
        let _ = app.emit("storage_move_log", StorageMoveLogPayload { line: text });
    }
}

pub(crate) fn emit_move_progress(
    app: Option<&AppHandle>,
    percent: f64,
    indeterminate: bool,
    message: impl Into<String>,
) {
    if let Some(app) = app {
        use tauri::Emitter;
        let _ = app.emit(
            "storage_move_progress",
            StorageMoveProgressPayload {
                percent,
                indeterminate,
                message: message.into(),
            },
        );
    }
}

pub(crate) fn format_bytes_human(bytes: u64) -> String {
    const MB: f64 = 1024.0 * 1024.0;
    const GB: f64 = 1024.0 * MB;
    if (bytes as f64) >= GB {
        format!("{:.2} GB", bytes as f64 / GB)
    } else if (bytes as f64) >= MB {
        format!("{:.1} MB", bytes as f64 / MB)
    } else if bytes >= 1024 {
        format!("{:.0} KB", bytes as f64 / 1024.0)
    } else {
        format!("{bytes} B")
    }
}

pub(crate) fn scan_path_stats(path: &Path) -> (u64, usize) {
    if !path.exists() {
        return (0, 0);
    }
    if path.is_file() {
        let len = path.metadata().map(|m| m.len()).unwrap_or(0);
        return (len, 1);
    }
    let Ok(entries) = fs::read_dir(path) else {
        return (0, 0);
    };
    let mut bytes = 0u64;
    let mut files = 0usize;
    for entry in entries.flatten() {
        let p = entry.path();
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            let (sub_b, sub_f) = scan_path_stats(&p);
            bytes += sub_b;
            files += sub_f;
        } else {
            bytes += meta.len();
            files += 1;
        }
    }
    (bytes, files)
}

pub(crate) struct MoveProgressTracker<'a> {
    pub app: Option<&'a AppHandle>,
    pub total_bytes: u64,
    pub total_files: usize,
    pub moved_bytes: u64,
    pub moved_files: usize,
    pub started_at: std::time::Instant,
    pub last_progress_emit: std::time::Instant,
    pub last_log_emit: std::time::Instant,
}

impl<'a> MoveProgressTracker<'a> {
    pub fn new(app: Option<&'a AppHandle>, total_bytes: u64, total_files: usize) -> Self {
        let now = std::time::Instant::now();
        Self {
            app,
            total_bytes,
            total_files,
            moved_bytes: 0,
            moved_files: 0,
            started_at: now,
            last_progress_emit: now,
            last_log_emit: now,
        }
    }

    pub fn log(&self, line: impl Into<String>) {
        emit_move_log(self.app, line);
    }

    pub fn advance(&mut self, bytes: u64, files: usize, label: &str, force_log: bool) {
        self.moved_bytes = self.moved_bytes.saturating_add(bytes);
        self.moved_files = self.moved_files.saturating_add(files);

        let now = std::time::Instant::now();
        let pct = if self.total_bytes > 0 {
            ((self.moved_bytes as f64 / self.total_bytes as f64) * 98.0).clamp(1.0, 98.0)
        } else if self.total_files > 0 {
            ((self.moved_files as f64 / self.total_files as f64) * 98.0).clamp(1.0, 98.0)
        } else {
            98.0
        };

        let elapsed = self.started_at.elapsed().as_secs_f64().max(0.05);
        let speed_mb = (self.moved_bytes as f64 / (1024.0 * 1024.0)) / elapsed;
        let msg = if self.total_bytes > 0 {
            format!(
                "Moving files ({} / {} · {:.1} MB/s)",
                format_bytes_human(self.moved_bytes),
                format_bytes_human(self.total_bytes),
                speed_mb
            )
        } else {
            format!("Moving {}/{}: {label}", self.moved_files, self.total_files)
        };

        if force_log || now.duration_since(self.last_progress_emit).as_millis() >= 90 {
            self.last_progress_emit = now;
            emit_move_progress(self.app, pct, false, msg);
        }

        if force_log
            || bytes >= 8 * 1024 * 1024
            || now.duration_since(self.last_log_emit).as_millis() >= 180
        {
            self.last_log_emit = now;
            self.log(format!("  moved {label} ({})", format_bytes_human(bytes)));
        }
    }
}

#[allow(dead_code)]
fn move_storage(old_root: &Path, new_root: &Path) -> Result<(), String> {
    move_storage_with_progress(old_root, new_root, None)?;
    let leftovers = finalize_storage_move_sync(old_root, new_root);
    if leftovers.is_empty() {
        Ok(())
    } else {
        Err(format!("Could not clean previous storage: {}", leftovers.join(", ")))
    }
}

pub(crate) fn normalize_fs_path(path: &Path) -> PathBuf {
    let resolved = fs::canonicalize(path).unwrap_or_else(|_| {
        // resolve the longest existing ancestor so non-existent child paths still normalize drive/symlinks
        let mut tail = Vec::new();
        let mut cur = Some(path);
        while let Some(p) = cur {
            if let Ok(canon) = fs::canonicalize(p) {
                let mut out = canon;
                for part in tail.into_iter().rev() {
                    out.push(part);
                }
                return out;
            }
            if let Some(name) = p.file_name() {
                tail.push(name.to_os_string());
                cur = p.parent();
            } else {
                break;
            }
        }
        path.to_path_buf()
    });

    let raw = resolved.to_string_lossy();
    let stripped = raw.trim_start_matches(r"\\?\");
    let clean = stripped.trim_end_matches(['/', '\\']);
    if cfg!(windows) || cfg!(target_os = "macos") {
        PathBuf::from(clean.replace('/', "\\").to_lowercase())
    } else {
        PathBuf::from(clean)
    }
}

pub(crate) fn same_fs_path(a: &Path, b: &Path) -> bool {
    normalize_fs_path(a) == normalize_fs_path(b)
}

pub(crate) fn path_is_inside_fs(child: &Path, parent: &Path) -> bool {
    let norm_child = normalize_fs_path(child);
    let norm_parent = normalize_fs_path(parent);
    norm_child.starts_with(&norm_parent)
}

fn move_storage_with_progress(
    old_root: &Path,
    new_root: &Path,
    app: Option<&AppHandle>,
) -> Result<(), String> {
    if same_fs_path(old_root, new_root) {
        return Ok(());
    }

    for dir_name in OWNED_STORAGE_DIRS {
        if path_is_inside_fs(new_root, &old_root.join(dir_name)) {
            return Err(format!("Pick a folder outside the current {dir_name} folder."));
        }
        if path_is_inside_fs(old_root, &new_root.join(dir_name))
            && !same_fs_path(old_root, &new_root.join(dir_name))
        {
            return Err("Pick a folder that does not overlap the current storage subfolders.".to_string());
        }
    }

    fs::create_dir_all(new_root).map_err(|e| format!("Failed to create new directory: {e}"))?;
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let stage_root = new_root.join(format!(".amverge-move-{nonce}"));
    let backup_root = new_root.join(format!(".amverge-backup-{nonce}"));

    emit_move_progress(app, 0.0, true, "Scanning files...");
    let mut total_bytes = 0u64;
    let mut total_files = 0usize;
    for dir_name in OWNED_STORAGE_DIRS {
        let src_dir = old_root.join(dir_name);
        if src_dir.is_dir() {
            let (b, f) = scan_path_stats(&src_dir);
            total_bytes += b;
            total_files += f;
        }
    }

    let mut tracker = MoveProgressTracker::new(app, total_bytes, total_files);
    tracker.log(format!(
        "Staging library storage -> {} ({} across {} file{})",
        new_root.display(),
        format_bytes_human(total_bytes),
        total_files,
        if total_files == 1 { "" } else { "s" }
    ));

    let mut leftovers = Vec::new();
    let mut committed: Vec<(PathBuf, PathBuf)> = Vec::new();
    let result = (|| -> Result<(), String> {
        for dir_name in OWNED_STORAGE_DIRS {
            let src_dir = old_root.join(dir_name);
            let dest_dir = new_root.join(dir_name);
            let staged = stage_root.join(dir_name);
            if dest_dir.is_dir() {
                copy_entry_tracked(
                    &dest_dir,
                    &staged,
                    &mut leftovers,
                    Some(&mut tracker),
                    &format!("existing/{dir_name}"),
                )?;
            }
            if src_dir.is_dir() {
                tracker.log(format!("Staging {dir_name}..."));
                copy_entry_tracked(
                    &src_dir,
                    &staged,
                    &mut leftovers,
                    Some(&mut tracker),
                    dir_name,
                )?;
            }
        }

        rebase_scene_scout_databases(&stage_root, old_root, new_root)?;

        for dir_name in OWNED_STORAGE_DIRS {
            let staged = stage_root.join(dir_name);
            if !staged.exists() {
                continue;
            }
            let dest_dir = new_root.join(dir_name);
            let backup = backup_root.join(dir_name);
            replace_staged_entry(&staged, &dest_dir, &backup)?;
            committed.push((dest_dir, backup));
        }
        Ok(())
    })();

    if let Err(err) = result {
        for (dest, backup) in committed.into_iter().rev() {
            if dest.exists() {
                let _ = remove_with_retries(&dest);
            }
            if backup.exists() {
                let _ = fs::rename(&backup, &dest);
            }
        }
        let _ = fs::remove_dir_all(&stage_root);
        let _ = fs::remove_dir_all(&backup_root);
        return Err(err);
    }

    let _ = fs::remove_dir_all(&stage_root);
    let _ = fs::remove_dir_all(&backup_root);
    let _ = rebase_storage_manifests_sync(new_root);

    emit_move_progress(app, 100.0, false, "Storage move complete.");
    tracker.log("Storage move complete.");
    Ok(())
}

pub(crate) fn move_entry(src: &Path, dest: &Path, leftovers: &mut Vec<String>) -> Result<(), String> {
    move_entry_tracked(src, dest, leftovers, None, "")
}

/// moves a folder or file, else copy then best-effort delete; a locked survivor becomes a leftover, never an abort
pub(crate) fn move_entry_tracked(
    src: &Path,
    dest: &Path,
    leftovers: &mut Vec<String>,
    tracker: Option<&mut MoveProgressTracker<'_>>,
    rel_label: &str,
) -> Result<(), String> {
    transfer_entry_tracked(src, dest, leftovers, tracker, rel_label, true)
}

pub(crate) fn copy_entry_tracked(
    src: &Path,
    dest: &Path,
    leftovers: &mut Vec<String>,
    tracker: Option<&mut MoveProgressTracker<'_>>,
    rel_label: &str,
) -> Result<(), String> {
    transfer_entry_tracked(src, dest, leftovers, tracker, rel_label, false)
}

fn transfer_entry_tracked(
    src: &Path,
    dest: &Path,
    leftovers: &mut Vec<String>,
    mut tracker: Option<&mut MoveProgressTracker<'_>>,
    rel_label: &str,
    delete_source: bool,
) -> Result<(), String> {
    if same_fs_path(src, dest) {
        return Ok(());
    }

    let sym_meta = fs::symlink_metadata(src)
        .map_err(|e| format!("Failed to inspect {}: {e}", src.display()))?;
    let is_symlink = sym_meta.file_type().is_symlink();

    // fast path: same volume, nothing holding the files open (only when destination doesn't already exist)
    if delete_source && fs::symlink_metadata(dest).is_err() && fs::rename(src, dest).is_ok() {
        if let Some(t) = tracker.as_deref_mut() {
            let (b, f) = scan_path_stats(dest);
            t.advance(b, f, rel_label, true);
        }
        return Ok(());
    }

    if is_symlink {
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent folder: {e}"))?;
        }
        if fs::symlink_metadata(dest).is_ok() {
            let _ = remove_with_retries(dest);
        }
        let link_target = fs::read_link(src)
            .map_err(|e| format!("Failed to read symlink {}: {e}", src.display()))?;
        recreate_or_materialize_symlink(src, dest, &link_target, &sym_meta)?;
        if let Some(t) = tracker.as_deref_mut() {
            t.advance(0, 1, rel_label, false);
        }
        if delete_source && !remove_with_retries(src) {
            leftovers.push(src.to_string_lossy().to_string());
        }
        return Ok(());
    }

    if sym_meta.is_dir() {
        fs::create_dir_all(dest)
            .map_err(|e| format!("Failed to create destination folder: {e}"))?;
        let mut entries: Vec<fs::DirEntry> = fs::read_dir(src)
            .map_err(|e| format!("Failed to read directory: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to read entry: {e}"))?;
        // move real files/folders (e.g. HF `blobs/`) before symlinks or `snapshots/` so relative targets exist in dest first
        entries.sort_by_key(|entry| {
            let is_sym = fs::symlink_metadata(entry.path())
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false);
            let name = entry.file_name().to_string_lossy().to_lowercase();
            let is_snapshots = name == "snapshots";
            (is_sym || is_snapshots, name)
        });
        for entry in entries {
            let child_src = entry.path();
            let child_name = entry.file_name();
            let child_dest = dest.join(&child_name);
            let child_rel = format!("{rel_label}/{}", child_name.to_string_lossy());
            transfer_entry_tracked(
                &child_src,
                &child_dest,
                leftovers,
                tracker.as_deref_mut(),
                &child_rel,
                delete_source,
            )?;
        }
        if delete_source && !remove_with_retries(src) {
            leftovers.push(src.to_string_lossy().to_string());
        }
    } else {
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent folder: {e}"))?;
        }
        let copied = fs::copy(src, dest).map_err(|e| format!("Failed to copy file: {e}"))?;
        if let Some(t) = tracker.as_deref_mut() {
            t.advance(copied, 1, rel_label, false);
        }
        if delete_source && !remove_with_retries(src) {
            leftovers.push(src.to_string_lossy().to_string());
        }
    }

    Ok(())
}

pub(crate) fn replace_staged_entry(
    staged: &Path,
    dest: &Path,
    backup: &Path,
) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create destination parent: {e}"))?;
    }
    if let Some(parent) = backup.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create backup parent: {e}"))?;
    }
    let had_dest = fs::symlink_metadata(dest).is_ok();
    if had_dest {
        fs::rename(dest, backup).map_err(|e| {
            format!("Failed to back up {}: {e}", dest.display())
        })?;
    }
    if let Err(err) = fs::rename(staged, dest) {
        if had_dest {
            let _ = fs::rename(backup, dest);
        }
        return Err(format!("Failed to activate {}: {err}", dest.display()));
    }
    Ok(())
}

pub(crate) fn finalize_storage_move_sync(old_root: &Path, current_root: &Path) -> Vec<String> {
    let mut leftovers = Vec::new();
    if same_fs_path(old_root, current_root) {
        return leftovers;
    }
    for dir_name in OWNED_STORAGE_DIRS {
        let source = old_root.join(dir_name);
        if source.exists() && !remove_with_retries(&source) {
            leftovers.push(source.to_string_lossy().to_string());
        }
    }
    leftovers
}

#[tauri::command]
pub async fn finalize_storage_move(
    app: AppHandle,
    old_dir: Option<String>,
    current_dir: Option<String>,
) -> Result<Vec<String>, String> {
    let old_root = resolve_storage_root(&app, old_dir.as_deref())?;
    let current_root = resolve_storage_root(&app, current_dir.as_deref())?;
    tauri::async_runtime::spawn_blocking(move || finalize_storage_move_sync(&old_root, &current_root))
        .await
        .map_err(|e| format!("Previous storage cleanup failed: {e}"))
}

/// recreates a symlink (like Hugging Face snapshot -> ../../blobs/<sha>) or hard-links/copies the moved target when symlink privilege is unavailable
fn recreate_or_materialize_symlink(
    src: &Path,
    dest: &Path,
    link_target: &Path,
    sym_meta: &fs::Metadata,
) -> Result<(), String> {
    #[cfg(windows)]
    let link_res = {
        use std::os::windows::fs::FileTypeExt;
        if sym_meta.file_type().is_symlink_dir() {
            std::os::windows::fs::symlink_dir(link_target, dest)
        } else {
            std::os::windows::fs::symlink_file(link_target, dest)
        }
    };
    #[cfg(unix)]
    let link_res = {
        let _ = sym_meta;
        std::os::unix::fs::symlink(link_target, dest)
    };

    if link_res.is_ok() {
        return Ok(());
    }

    // fallback when OS blocks symlink creation: resolve the target in dest first (since blobs/ moves before snapshots/), else in src
    let resolved = if link_target.is_absolute() {
        link_target.to_path_buf()
    } else {
        let in_dest = dest
            .parent()
            .map(|p| p.join(link_target))
            .filter(|p| p.exists());
        let in_src = src
            .parent()
            .map(|p| p.join(link_target))
            .filter(|p| p.exists());
        in_dest
            .or(in_src)
            .ok_or_else(|| format!("Failed to resolve symlink target {}", link_target.display()))?
    };

    if resolved.is_file() {
        if fs::hard_link(&resolved, dest).is_ok() {
            return Ok(());
        }
        fs::copy(&resolved, dest)
            .map(|_| ())
            .map_err(|e| format!("Failed to copy symlink target: {e}"))
    } else {
        Err(format!(
            "Failed to recreate directory symlink {} -> {}",
            dest.display(),
            link_target.display()
        ))
    }
}

/// deletes with short retries, since windows frees handles just after the webview drops them; false leaves a leftover
pub(crate) fn remove_with_retries(path: &Path) -> bool {
    let is_real_dir = fs::symlink_metadata(path)
        .map(|m| m.is_dir() && !m.file_type().is_symlink())
        .unwrap_or(false);
    for attempt in 0..5 {
        let result = if is_real_dir {
            fs::remove_dir_all(path)
        } else {
            fs::remove_file(path).or_else(|_| fs::remove_dir(path))
        };

        match result {
            Ok(()) => return true,
            Err(_) if attempt < 4 => {
                std::thread::sleep(std::time::Duration::from_millis(250));
            }
            Err(e) => {
                console_log(
                    "SETTINGS|move",
                    &format!("could not remove {}: {e}", path.to_string_lossy()),
                );
                return false;
            }
        }
    }

    false
}

/// copying or converting a video can take a while, so it never runs on the main thread
#[tauri::command]
pub async fn save_background_image(app: tauri::AppHandle, source_path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || save_background_media(&app, &source_path))
        .await
        .map_err(|e| e.to_string())?
}

fn save_background_media(app: &AppHandle, source_path: &str) -> Result<String, String> {
    let source = Path::new(source_path);
    if !source.exists() {
        return Err("Selected file does not exist.".to_string());
    }

    let backgrounds_dir = backgrounds_dir(app)?;
    let extension = source
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("png")
        .to_lowercase();

    let saved = if is_video_extension(&extension) && !webview_plays_video(app, source_path, &extension) {
        let destination = new_background_path(&backgrounds_dir, "mp4");
        transcode_background_video(app, source_path, &destination)?
    } else {
        let destination = new_background_path(&backgrounds_dir, &extension);
        fs::copy(source, &destination).map_err(|e| format!("Failed to copy background: {e}"))?;
        destination.to_string_lossy().to_string()
    };

    remove_old_backgrounds(&backgrounds_dir, Path::new(&saved));
    Ok(saved)
}

fn backgrounds_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {e}"))?
        .join("backgrounds");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create backgrounds directory: {e}"))?;
    Ok(dir)
}

/// a fresh name per pick: the webview may still be playing the old file, which windows refuses to overwrite
fn new_background_path(dir: &Path, ext: &str) -> PathBuf {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    dir.join(format!("background-{stamp}.{ext}"))
}

/// earlier backgrounds go; one the webview still holds open is skipped and cleared on a later pick
fn remove_old_backgrounds(dir: &Path, keep: &Path) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_background = path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("background"));
        if is_background && path != keep {
            let _ = fs::remove_file(&path);
        }
    }
}

/// webview2 plays these straight from the file; anything else (avi, prores, hevc...) is converted once
fn webview_plays_video(app: &AppHandle, source_path: &str, extension: &str) -> bool {
    const CONTAINERS: &[&str] = &["mp4", "m4v", "webm", "mov"];
    const CODECS: &[&str] = &["h264", "vp8", "vp9", "av1"];
    if !CONTAINERS.contains(&extension) {
        return false;
    }
    let Ok(ffprobe) = resolve_bundled_tool(app, "ffprobe") else { return false };
    let mut cmd = Command::new(&ffprobe);
    apply_no_window(&mut cmd);
    cmd.args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "default=nk=1:nw=1"])
        .arg(source_path);
    crate::utils::process::output_bound(&mut cmd)
        .map(|out| CODECS.contains(&String::from_utf8_lossy(&out.stdout).trim()))
        .unwrap_or(false)
}

/// silent, faststart h264 any webview plays; shared by converted and cropped video backgrounds
const BACKGROUND_VIDEO_ARGS: &[&str] = &[
    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
];

fn transcode_background_video(app: &AppHandle, source_path: &str, destination: &Path) -> Result<String, String> {
    let ffmpeg = resolve_bundled_tool(app, "ffmpeg")?;
    let mut cmd = Command::new(&ffmpeg);
    apply_no_window(&mut cmd);
    // yuv420p needs even dimensions
    cmd.arg("-y")
        .arg("-i")
        .arg(source_path)
        .args(["-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2"])
        .args(BACKGROUND_VIDEO_ARGS)
        .arg(destination);
    run_background_ffmpeg(&mut cmd, &ffmpeg, destination)
}

fn run_background_ffmpeg(cmd: &mut Command, ffmpeg: &Path, destination: &Path) -> Result<String, String> {
    let output = crate::utils::process::output_bound(cmd)
        .map_err(|e| format!("Failed to run ffmpeg ({}): {e}", ffmpeg.display()))?;

    if !output.status.success() {
        // ffmpeg's full output goes to the console; the ui only gets one line
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        console_log("ERROR|background", &stderr);
        return Err("Could not process that image or video. Check the console for details.".to_string());
    }

    Ok(destination.to_string_lossy().to_string())
}

#[derive(serde::Deserialize, serde::Serialize)]
pub struct CropData {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: i32,
    pub flip_h: bool,
    pub flip_v: bool,
}

fn is_no_transform(crop: &CropData) -> bool {
    crop.x == 0.0 && crop.y == 0.0 && crop.rotation == 0 && !crop.flip_h && !crop.flip_v
}

fn is_video_extension(ext: &str) -> bool {
    matches!(
        ext,
        "mp4" | "webm" | "mov" | "mkv" | "avi" | "m4v"
    )
}

fn build_ffmpeg_filter(crop: &CropData) -> String {
    let mut steps: Vec<String> = Vec::new();

    match crop.rotation.rem_euclid(360) {
        90 => steps.push("transpose=1".to_string()),
        180 => {
            steps.push("transpose=1".to_string());
            steps.push("transpose=1".to_string());
        }
        270 => steps.push("transpose=2".to_string()),
        _ => {}
    }

    if crop.flip_h {
        steps.push("hflip".to_string());
    }

    if crop.flip_v {
        steps.push("vflip".to_string());
    }

    let x = crop.x.round().max(0.0) as i64;
    let y = crop.y.round().max(0.0) as i64;
    let w = crop.width.round().max(1.0) as i64;
    let h = crop.height.round().max(1.0) as i64;
    steps.push(format!("crop={w}:{h}:{x}:{y}"));

    steps.join(",")
}

fn run_ffmpeg_transform(
    app: &AppHandle,
    source_path: &str,
    destination: &Path,
    crop: &CropData,
    preserve_gif_animation: bool,
) -> Result<String, String> {
    let ffmpeg = resolve_bundled_tool(app, "ffmpeg")?;
    let mut cmd = Command::new(&ffmpeg);
    apply_no_window(&mut cmd);

    let base_filter = build_ffmpeg_filter(crop);

    cmd.arg("-y").arg("-i").arg(source_path);

    if preserve_gif_animation {
        let gif_filter = format!(
            "{base_filter},split[s0][s1];[s0]palettegen=reserve_transparent=on[p];[s1][p]paletteuse=dither=sierra2_4a"
        );
        cmd.arg("-vf")
            .arg(gif_filter)
            .arg("-loop")
            .arg("0")
            .arg(destination);
    } else {
        cmd.arg("-vf").arg(base_filter).args(BACKGROUND_VIDEO_ARGS).arg(destination);
    }

    run_background_ffmpeg(&mut cmd, &ffmpeg, destination)
}

fn sanitize_icon_id(input: &str) -> String {
    let sanitized: String = input
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect();

    if sanitized.is_empty() {
        "profile".to_string()
    } else {
        sanitized
    }
}

fn run_native_crop(
    source_path: &str,
    destination: &Path,
    crop: &CropData,
) -> Result<String, String> {
    let mut img = image::open(source_path).map_err(|e| format!("Failed to open image: {e}"))?;

    let rotation = crop.rotation.rem_euclid(360);
    img = match rotation {
        90 => img.rotate90(),
        180 => img.rotate180(),
        270 => img.rotate270(),
        _ => img,
    };

    if crop.flip_h {
        img = img.fliph();
    }

    if crop.flip_v {
        img = img.flipv();
    }

    let img_width = img.width() as i64;
    let img_height = img.height() as i64;
    if img_width <= 0 || img_height <= 0 {
        return Err("Invalid image dimensions".to_string());
    }

    let x = crop.x.round().max(0.0) as i64;
    let y = crop.y.round().max(0.0) as i64;
    let w = crop.width.round().max(1.0) as i64;
    let h = crop.height.round().max(1.0) as i64;

    let x = x.min(img_width - 1);
    let y = y.min(img_height - 1);
    let max_w = img_width - x;
    let max_h = img_height - y;
    let crop_w = w.min(max_w).max(1);
    let crop_h = h.min(max_h).max(1);

    let cropped = img.crop_imm(x as u32, y as u32, crop_w as u32, crop_h as u32);

    let ext = destination
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext == "jpg" || ext == "jpeg" {
        let rgb: DynamicImage = if cropped.color().has_alpha() {
            DynamicImage::ImageRgb8(cropped.to_rgb8())
        } else {
            cropped
        };

        let mut output_file = fs::File::create(destination)
            .map_err(|e| format!("Failed to create output file: {e}"))?;
        let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output_file, 95);
        encoder
            .encode_image(&rgb)
            .map_err(|e| format!("Failed to write JPEG: {e}"))?;
    } else {
        cropped
            .save(destination)
            .map_err(|e| format!("Failed to save image: {e}"))?;
    }

    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn crop_and_save_image(
    app: tauri::AppHandle,
    source_path: String,
    crop: CropData,
) -> Result<String, String> {
    let backgrounds_dir = backgrounds_dir(&app)?;

    let ext = Path::new(&source_path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let destination = if ext == "gif" {
        new_background_path(&backgrounds_dir, "gif")
    } else if is_video_extension(&ext) {
        new_background_path(&backgrounds_dir, "mp4")
    } else {
        new_background_path(&backgrounds_dir, "jpg")
    };

    let source_path_for_worker = source_path.clone();
    let app_for_worker = app.clone();
    let saved = tokio::task::spawn_blocking(move || {
        let source_ext = Path::new(&source_path_for_worker)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        let destination_ext = destination
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        let can_direct_copy = is_no_transform(&crop) && source_ext == destination_ext;

        if can_direct_copy {
            fs::copy(&source_path_for_worker, &destination).map_err(|e| e.to_string())?;
            return Ok::<String, String>(destination.to_string_lossy().to_string());
        }

        if source_ext == "gif" {
            return run_ffmpeg_transform(
                &app_for_worker,
                &source_path_for_worker,
                &destination,
                &crop,
                true,
            );
        }

        if is_video_extension(&source_ext) {
            return run_ffmpeg_transform(
                &app_for_worker,
                &source_path_for_worker,
                &destination,
                &crop,
                false,
            );
        }

        run_native_crop(&source_path_for_worker, &destination, &crop)
    })
    .await
    .map_err(|e| e.to_string())?;

    if let Ok(saved) = &saved {
        remove_old_backgrounds(&backgrounds_dir, Path::new(saved));
    }
    saved
}

#[tauri::command]
pub async fn crop_and_save_profile_icon(
    app: tauri::AppHandle,
    source_path: String,
    icon_id: String,
    crop: CropData,
) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {e}"))?;

    let icons_dir = app_data_dir.join("profile_icons");
    fs::create_dir_all(&icons_dir)
        .map_err(|e| format!("Failed to create profile icons directory: {e}"))?;

    let ext = Path::new(&source_path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    let safe_icon_id = sanitize_icon_id(&icon_id);
    let destination = if ext == "gif" {
        icons_dir.join(format!("{safe_icon_id}.gif"))
    } else {
        icons_dir.join(format!("{safe_icon_id}.png"))
    };

    let source_path_for_worker = source_path.clone();
    tokio::task::spawn_blocking(move || {
        let source_ext = Path::new(&source_path_for_worker)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        let destination_ext = destination
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        let can_direct_copy = is_no_transform(&crop) && source_ext == destination_ext;

        if can_direct_copy {
            fs::copy(&source_path_for_worker, &destination).map_err(|e| e.to_string())?;
            return Ok::<String, String>(destination.to_string_lossy().to_string());
        }

        run_native_crop(&source_path_for_worker, &destination, &crop)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn delete_profile_icon_file(app: tauri::AppHandle, icon_path: String) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {e}"))?;
    let icons_dir = app_data_dir.join("profile_icons");

    let requested_path = PathBuf::from(icon_path);
    if !requested_path.exists() {
        return Ok(());
    }

    let canonical_icons_dir = fs::canonicalize(&icons_dir).unwrap_or(icons_dir);
    let canonical_requested_path = fs::canonicalize(&requested_path)
        .map_err(|e| format!("Failed to resolve icon path: {e}"))?;

    if !canonical_requested_path.starts_with(&canonical_icons_dir) {
        return Err("Refusing to delete icon outside profile_icons directory.".to_string());
    }

    fs::remove_file(&canonical_requested_path)
        .map_err(|e| format!("Failed to delete profile icon file: {e}"))?;

    Ok(())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn reveal_in_file_manager(file_path: String) -> Result<(), String> {
    let clean = file_path.trim().trim_matches('"');
    let raw_path = PathBuf::from(clean);
    if !raw_path.exists() {
        return Err(format!("Target file or directory does not exist on disk: {clean}"));
    }

    let path = fs::canonicalize(&raw_path).unwrap_or(raw_path.clone());
    // strip Windows extended-length path prefix "\\?\" as explorer.exe does not recognize it
    let lossy = path.to_string_lossy();
    let path_string = match lossy.strip_prefix(r"\\?\UNC\") {
        Some(rest) => format!(r"\\{rest}"),
        None => lossy.trim_start_matches(r"\\?\").to_string(),
    }
    .replace('/', "\\");

    let is_dir = raw_path.is_dir() || path.is_dir();

    // raw_arg: arg() would quote "/select,...", which explorer can't parse
    use std::os::windows::process::CommandExt;
    let mut cmd = Command::new("explorer");
    if is_dir {
        cmd.raw_arg(format!("\"{path_string}\""));
    } else {
        cmd.raw_arg(format!("/select,\"{path_string}\""));
    }

    cmd.spawn()
        .map_err(|e| format!("Failed to open Explorer: {e}"))?;

    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn reveal_in_file_manager(file_path: String) -> Result<(), String> {
    let raw = PathBuf::from(file_path.trim());
    let target = if raw.is_dir() {
        raw
    } else {
        raw.parent()
            .map(|p| p.to_path_buf())
            .unwrap_or(raw)
    };

    let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    Command::new(opener)
        .arg(target)
        .spawn()
        .map_err(|e| format!("Failed to open file manager: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn touch(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, b"x").unwrap();
    }

    #[test]
    fn moves_each_owned_folder_whole() {
        let tmp = tempfile::tempdir().unwrap();
        let old = tmp.path().join("old");
        let new = tmp.path().join("new");
        touch(&old.join("episodes_storage/ep1/manifest.json"));
        touch(&old.join("episodes_storage/no_manifest/scenes/a.jpg"));
        touch(&old.join("scene_packs/p1/clip.mp4"));

        move_storage(&old, &new).unwrap();

        assert!(new.join("episodes_storage/ep1/manifest.json").is_file());
        assert!(new.join("episodes_storage/no_manifest/scenes/a.jpg").is_file());
        assert!(new.join("scene_packs/p1/clip.mp4").is_file());
        assert!(!old.join("episodes_storage").exists());
        assert!(!old.join("scene_packs").exists());
    }

    #[test]
    fn staged_move_preserves_source_until_final_cleanup() {
        let tmp = tempfile::tempdir().unwrap();
        let old = tmp.path().join("old");
        let new = tmp.path().join("new");
        touch(&old.join("episodes_storage/ep1/manifest.json"));

        move_storage_with_progress(&old, &new, None).unwrap();
        assert!(old.join("episodes_storage/ep1/manifest.json").is_file());
        assert!(new.join("episodes_storage/ep1/manifest.json").is_file());

        assert!(finalize_storage_move_sync(&old, &new).is_empty());
        assert!(!old.join("episodes_storage").exists());
    }

    #[test]
    fn staged_activation_keeps_a_restorable_destination_backup() {
        let tmp = tempfile::tempdir().unwrap();
        let staged = tmp.path().join("staged");
        let dest = tmp.path().join("dest");
        let backup = tmp.path().join("backup");
        touch(&staged.join("episodes_storage/ep1/new.txt"));
        touch(&dest.join("episodes_storage/ep1/old.txt"));

        replace_staged_entry(&staged, &dest, &backup).unwrap();
        assert!(dest.join("episodes_storage/ep1/new.txt").is_file());
        assert!(backup.join("episodes_storage/ep1/old.txt").is_file());

        fs::remove_dir_all(&dest).unwrap();
        fs::rename(&backup, &dest).unwrap();
        assert!(dest.join("episodes_storage/ep1/old.txt").is_file());
    }

    #[test]
    fn merges_into_an_existing_folder_without_nesting() {
        let tmp = tempfile::tempdir().unwrap();
        let old = tmp.path().join("old");
        let new = tmp.path().join("new");
        touch(&old.join("episodes_storage/ep1/manifest.json"));
        touch(&old.join("episodes_storage/ep1/clips/a.mp4"));
        // the same episode already at the new root makes rename fail, so this takes the copy path
        touch(&new.join("episodes_storage/ep1/older.txt"));
        touch(&new.join("episodes_storage/ep2/manifest.json"));

        move_storage(&old, &new).unwrap();

        assert!(new.join("episodes_storage/ep1/manifest.json").is_file());
        assert!(new.join("episodes_storage/ep1/clips/a.mp4").is_file());
        assert!(new.join("episodes_storage/ep1/older.txt").is_file());
        assert!(new.join("episodes_storage/ep2/manifest.json").is_file());
        assert!(!new.join("episodes_storage/ep1/ep1").exists());
        assert!(!old.join("episodes_storage").exists());
    }

    #[test]
    fn refuses_a_root_inside_a_folder_being_moved() {
        let tmp = tempfile::tempdir().unwrap();
        let old = tmp.path().join("old");
        touch(&old.join("episodes_storage/ep1/manifest.json"));

        let err = move_storage(&old, &old.join("episodes_storage/inner")).unwrap_err();
        assert!(err.contains("episodes_storage"));
        assert!(old.join("episodes_storage/ep1/manifest.json").is_file());
    }

    #[test]
    fn refuses_an_old_root_inside_a_new_owned_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let old = tmp.path().join("new/episodes_storage/old");
        let new = tmp.path().join("new");
        touch(&old.join("manifest.json"));

        let err = move_storage(&old, &new).unwrap_err();
        assert!(err.contains("overlap"));
        assert!(old.join("manifest.json").is_file());
    }

    #[test]
    fn rebases_webp_sync_metadata_with_the_episode() {
        let tmp = tempfile::tempdir().unwrap();
        let old = tmp.path().join("old");
        let new = tmp.path().join("new");
        let sync = new.join("episodes_storage/ep1/sync_preview.json");
        fs::create_dir_all(sync.parent().unwrap()).unwrap();
        fs::write(
            &sync,
            serde_json::to_vec_pretty(&serde_json::json!({
                "previews": [{
                    "scene_index": 0,
                    "preview_webp_path": old.join("episodes_storage/ep1/scenes/scene_hash.webp"),
                    "preview_poster_path": old.join("episodes_storage/ep1/scenes/scene_hash.jpg")
                }]
            }))
            .unwrap(),
        )
        .unwrap();

        assert_eq!(rebase_storage_manifests_sync(&new).unwrap(), 1);
        let repaired: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&sync).unwrap()).unwrap();
        assert_eq!(
            repaired["previews"][0]["preview_webp_path"],
            new.join("episodes_storage/ep1/scenes/scene_hash.webp")
                .to_string_lossy()
                .to_string()
        );
    }

    #[test]
    fn rebases_manifest_paths_after_a_move_without_moving_external_sources() {
        let tmp = tempfile::tempdir().unwrap();
        let old = tmp.path().join("old");
        let new = tmp.path().join("new");
        let external = tmp.path().join("source.mkv");
        let manifest = new.join("episodes_storage/ep1/manifest.json");
        fs::create_dir_all(manifest.parent().unwrap()).unwrap();
        fs::write(
            &manifest,
            serde_json::to_vec_pretty(&serde_json::json!({
                "source": {
                    "videoPath": external,
                    "outputDir": old.join("episodes_storage/ep1")
                },
                "initialClips": [{
                    "path": external,
                    "original_path": external,
                    "clip_path": old.join("episodes_storage/ep1/scenes/scene_0000.mp4"),
                    "thumbnail": old.join("episodes_storage/ep1/scenes/scene_0000.webp")
                }],
                "backendPayload": {
                    "cache": {"secs_path": old.join("episodes_storage/ep1/cache/secs.npy")}
                }
            }))
            .unwrap(),
        )
        .unwrap();

        assert_eq!(rebase_storage_manifests_sync(&new).unwrap(), 1);
        assert_eq!(rebase_storage_manifests_sync(&new).unwrap(), 0);

        let repaired: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&manifest).unwrap()).unwrap();
        assert_eq!(repaired["source"]["videoPath"], external.to_string_lossy().to_string());
        assert_eq!(repaired["initialClips"][0]["path"], external.to_string_lossy().to_string());
        assert_eq!(
            repaired["initialClips"][0]["clip_path"],
            new.join("episodes_storage/ep1/scenes/scene_0000.mp4").to_string_lossy().to_string()
        );
        assert_eq!(
            repaired["initialClips"][0]["thumbnail"],
            new.join("episodes_storage/ep1/scenes/scene_0000.webp").to_string_lossy().to_string()
        );
        assert_eq!(
            repaired["backendPayload"]["cache"]["secs_path"],
            new.join("episodes_storage/ep1/cache/secs.npy").to_string_lossy().to_string()
        );
    }

    #[test]
    fn storage_move_rebases_scene_scout_source_paths_only_inside_the_library() {
        let tmp = tempfile::tempdir().unwrap();
        let old = tmp.path().join("old");
        let new = tmp.path().join("new");
        let db = old.join("amverge-scene-scout/library.scoutdb");
        fs::create_dir_all(db.parent().unwrap()).unwrap();
        let conn = rusqlite::Connection::open(&db).unwrap();
        conn.execute_batch(
            "CREATE TABLE processed_videos (id INTEGER PRIMARY KEY, filepath TEXT UNIQUE);
             CREATE TABLE image_embeddings (id INTEGER PRIMARY KEY, filepath TEXT);
             CREATE TABLE index_queue (id INTEGER PRIMARY KEY, path TEXT);",
        )
        .unwrap();
        let owned = old.join("episodes_storage/ep1/scene.mp4");
        let external = tmp.path().join("external.mp4");
        conn.execute(
            "INSERT INTO processed_videos (id, filepath) VALUES (1, ?1), (2, ?2)",
            rusqlite::params![owned.to_string_lossy().to_string(), external.to_string_lossy().to_string()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO image_embeddings (id, filepath) VALUES (1, ?1)",
            [owned.to_string_lossy().to_string()],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO index_queue (id, path) VALUES (1, ?1)",
            [external.to_string_lossy().to_string()],
        )
        .unwrap();
        drop(conn);

        move_storage(&old, &new).unwrap();

        let moved = new.join("amverge-scene-scout/library.scoutdb");
        let conn = rusqlite::Connection::open(moved).unwrap();
        let owned_now: String = conn
            .query_row("SELECT filepath FROM processed_videos WHERE id = 1", [], |row| row.get(0))
            .unwrap();
        let external_now: String = conn
            .query_row("SELECT filepath FROM processed_videos WHERE id = 2", [], |row| row.get(0))
            .unwrap();
        let image_now: String = conn
            .query_row("SELECT filepath FROM image_embeddings WHERE id = 1", [], |row| row.get(0))
            .unwrap();
        let queue_now: String = conn
            .query_row("SELECT path FROM index_queue WHERE id = 1", [], |row| row.get(0))
            .unwrap();
        assert_eq!(owned_now, new.join("episodes_storage/ep1/scene.mp4").to_string_lossy());
        assert_eq!(image_now, new.join("episodes_storage/ep1/scene.mp4").to_string_lossy());
        assert_eq!(external_now, external.to_string_lossy());
        assert_eq!(queue_now, external.to_string_lossy());
    }

    #[test]
    fn moving_to_same_path_with_trailing_slash_or_case_keeps_files_intact() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("StorageRoot");
        let ep_file = root.join("episodes_storage/ep1/manifest.json");
        fs::create_dir_all(ep_file.parent().unwrap()).unwrap();
        fs::write(&ep_file, b"{\"important\":true}").unwrap();

        let variant = PathBuf::from(format!("{}/", root.to_string_lossy()));
        move_storage(&root, &variant).unwrap();
        assert_eq!(fs::read(&ep_file).unwrap(), b"{\"important\":true}");

        let mut leftovers = Vec::new();
        move_entry_tracked(&ep_file, &ep_file, &mut leftovers, None, "manifest.json").unwrap();
        assert_eq!(fs::read(&ep_file).unwrap(), b"{\"important\":true}");
    }

    #[test]
    fn moves_hf_snapshot_symlinks_when_copy_fallback_moves_blobs_first() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src_siglip");
        let dst = tmp.path().join("dst_siglip");
        let blob = src.join("blobs/11a61a2068800d5f4f35cb041c1fea25");
        let snap_dir = src.join("snapshots/cc24074f717b6129");
        fs::create_dir_all(blob.parent().unwrap()).unwrap();
        fs::create_dir_all(&snap_dir).unwrap();
        fs::write(&blob, b"safetensors-weights").unwrap();

        let snap_link = snap_dir.join("model.safetensors");
        let rel_target = PathBuf::from("..").join("..").join("blobs").join("11a61a2068800d5f4f35cb041c1fea25");
        #[cfg(windows)]
        let linked = std::os::windows::fs::symlink_file(&rel_target, &snap_link).is_ok();
        #[cfg(unix)]
        let linked = std::os::unix::fs::symlink(&rel_target, &snap_link).is_ok();

        if !linked {
            // if Windows blocks symlink creation in test runner without dev mode, test recreate_or_materialize_symlink directly
            let dst_blob = dst.join("blobs/11a61a2068800d5f4f35cb041c1fea25");
            let dst_snap = dst.join("snapshots/cc24074f717b6129/model.safetensors");
            fs::create_dir_all(dst_blob.parent().unwrap()).unwrap();
            fs::create_dir_all(dst_snap.parent().unwrap()).unwrap();
            fs::rename(&blob, &dst_blob).unwrap();
            let dummy_meta = fs::metadata(&dst_blob).unwrap();
            recreate_or_materialize_symlink(&snap_link, &dst_snap, &rel_target, &dummy_meta).unwrap();
            assert_eq!(fs::read(&dst_snap).unwrap(), b"safetensors-weights");
            return;
        }

        // pre-create dst so top-level fs::rename(src, dst) fails and takes the recursive copy+delete path
        fs::create_dir_all(dst.join("snapshots/cc24074f717b6129")).unwrap();
        fs::write(dst.join("snapshots/cc24074f717b6129/keep.txt"), b"1").unwrap();

        let mut leftovers = Vec::new();
        move_entry_tracked(&src, &dst, &mut leftovers, None, "hf-cache/siglip2").unwrap();

        let moved_snap = dst.join("snapshots/cc24074f717b6129/model.safetensors");
        assert!(moved_snap.exists());
        assert_eq!(fs::read(&moved_snap).unwrap(), b"safetensors-weights");
        assert!(!src.exists());
    }
}
