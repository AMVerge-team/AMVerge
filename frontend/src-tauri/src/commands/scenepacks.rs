use std::io::{BufRead, BufReader, Read};
use std::process::Stdio;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::payloads::ProgressPayload;
use crate::utils::logging::{console_log, sanitize_for_console};
use crate::utils::paths::{resolve_scenepacks_storage_dir, sanitize_episode_cache_id};
use crate::utils::sidecar::amverge_command;

/// one clip to materialize into a Scenepack's own storage. either an
/// already-cut clip file to copy in (video mode) or a `[start_sec, end_sec]`
/// range to cut from a source episode (webp mode): mirrors `ClipSpec` in
/// `export.rs`: snake_case fields, sent as-is from the frontend into the CLI's
/// `--inputs-json`
#[derive(Deserialize, Serialize)]
pub(crate) struct MaterializeClipSpec {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) source_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) start_sec: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) end_sec: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) existing_clip_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) existing_thumbnail_path: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MaterializedClip {
    pub index: usize,
    pub clip_path: Option<String>,
    pub thumbnail_path: Option<String>,
    pub clip_mode: Option<String>,
    pub error: Option<String>,
}

impl MaterializedClip {
    fn from_json(item: &Value) -> Self {
        let text = |key: &str| item.get(key).and_then(|v| v.as_str()).map(String::from);
        Self {
            index: item.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize,
            clip_path: text("clip_path"),
            thumbnail_path: text("thumbnail_path"),
            clip_mode: text("clip_mode"),
            error: text("error"),
        }
    }
}

/// called from the CLI reader thread as each item finishes (`MATERIALIZED|<json>`)
pub(crate) type OnMaterialized = Box<dyn Fn(MaterializedClip) + Send + 'static>;

/// cut/copy a batch of clips into `<scene_packs>/<scenepack_id>/`, each as a
/// standalone .mp4 + poster .jpg. this is what makes a Scenepack independent
/// of episode storage, deleting the source episode can never touch these
/// copies, and lets every Scenepack clip load like a normal pre-cut video
/// clip instead of needing a per-episode WebP cache lookup
#[tauri::command]
pub async fn materialize_scenepack_clips(
    app: AppHandle,
    clips: Vec<MaterializeClipSpec>,
    scenepack_id: String,
    custom_path: Option<String>,
) -> Result<Vec<MaterializedClip>, String> {
    if clips.is_empty() {
        return Ok(Vec::new());
    }

    let id = sanitize_episode_cache_id(&scenepack_id)?;
    let out_dir = resolve_scenepacks_storage_dir(&app, custom_path.as_deref())?.join(id);
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    console_log(
        "SCENEPACK|materialize_start",
        &format!("scenepack={scenepack_id} clips={}", clips.len()),
    );
    run_materialize_clips(&app, &clips, &out_dir, "reencode", true, None, None).await
}

/// runs `amverge materialize-clips` for `clips` into `out_dir`. `cut_mode` is the
/// CLI's `--cut-mode` (reencode/auto/copy); `emit_progress` forwards its PROGRESS
/// lines as `scene_progress`; `pids` tracks the child so it is killed on app close;
/// `on_item` sees each item as soon as it finishes
pub(crate) async fn run_materialize_clips(
    app: &AppHandle,
    clips: &[MaterializeClipSpec],
    out_dir: &std::path::Path,
    cut_mode: &str,
    emit_progress: bool,
    pids: Option<Arc<Mutex<Vec<u32>>>>,
    on_item: Option<OnMaterialized>,
) -> Result<Vec<MaterializedClip>, String> {
    // a per-call name, not a per-process one: two adds started close together
    // shared a single path, so the second wrote its list over the first before
    // that CLI had read it, and the first pack received the wrong clip
    let inputs_path = std::env::temp_dir().join(format!(
        "amverge_materialize_{}_{}.json",
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    std::fs::write(
        &inputs_path,
        serde_json::to_string(&clips).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("Failed to write materialize input list: {e}"))?;
    let inputs_path_str = inputs_path.to_string_lossy().to_string();
    let out_dir_str = out_dir.to_string_lossy().to_string();

    let mut cmd = amverge_command(app)?;
    cmd.arg("materialize-clips")
        .arg("--inputs-json")
        .arg(&inputs_path_str)
        .arg("--output-dir")
        .arg(&out_dir_str);
    // only passed when needed, so Scenepacks keep the exact call older CLIs accept
    if cut_mode != "reencode" {
        cmd.arg("--cut-mode").arg(cut_mode);
    }
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn amverge materialize-clips: {e}"))?;
    let child_pid = child.id();
    crate::utils::process::bind_to_app_lifetime(child_pid);
    if let Some(pids) = &pids {
        if let Ok(mut l) = pids.lock() {
            l.push(child_pid);
        }
    }

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let app_for_err = app.clone();
    let stderr_accum = Arc::new(Mutex::new(String::new()));
    let stderr_accum_thread = Arc::clone(&stderr_accum);
    let stderr_handle = tokio::task::spawn_blocking(move || {
        for line in BufReader::new(stderr).lines().flatten() {
            if let Ok(mut acc) = stderr_accum_thread.lock() {
                acc.push_str(&line);
                acc.push('\n');
            }
            if let Some(json) = line.strip_prefix("MATERIALIZED|") {
                if let (Some(cb), Ok(item)) = (&on_item, serde_json::from_str::<Value>(json)) {
                    cb(MaterializedClip::from_json(&item));
                }
            } else if let Some(rest) = line.strip_prefix("PROGRESS|") {
                if !emit_progress {
                    continue;
                }
                let mut parts = rest.splitn(2, '|');
                let pct = parts.next().unwrap_or("");
                let msg = parts.next().unwrap_or("").to_string();
                if let Ok(p) = pct.parse::<u8>() {
                    let _ = app_for_err.emit(
                        "scene_progress",
                        ProgressPayload { percent: p, message: msg },
                    );
                }
            } else if !line.trim().is_empty() {
                console_log("SCENEPACK|cli", &sanitize_for_console(&line));
            }
        }
    });

    let stdout_string = tokio::task::spawn_blocking(move || {
        let mut buf = String::new();
        BufReader::new(stdout).read_to_string(&mut buf).map(|_| buf)
    })
    .await
    .map_err(|e| format!("stdout thread panicked: {e}"))?
    .map_err(|e| format!("Failed reading stdout: {e}"))?;

    let _ = stderr_handle.await;
    let status = tokio::task::spawn_blocking(move || child.wait())
        .await
        .map_err(|e| format!("wait thread panicked: {e}"))?
        .map_err(|e| format!("Failed waiting for amverge materialize-clips: {e}"))?;

    if let Some(pids) = &pids {
        if let Ok(mut l) = pids.lock() {
            l.retain(|p| *p != child_pid);
        }
    }
    let _ = std::fs::remove_file(&inputs_path);

    if let Ok(payload) = serde_json::from_str::<Value>(stdout_string.trim()) {
        if let Some(err) = payload.get("error").and_then(|e| e.as_object()) {
            let msg = err
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("materialize failed");
            console_log("ERROR|materialize_scenepack_clips", &sanitize_for_console(msg));
            return Err(msg.to_string());
        }
        if let Some(items) = payload.get("items").and_then(|i| i.as_array()) {
            let results: Vec<MaterializedClip> = items.iter().map(MaterializedClip::from_json).collect();
            if status.success() {
                console_log(
                    "SCENEPACK|materialize_end",
                    &format!("ok items={}", results.len()),
                );
                return Ok(results);
            }
        }
    }

    let err = stderr_accum
        .lock()
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    console_log("ERROR|materialize_scenepack_clips", &format!("exit={status}"));
    Err(if err.is_empty() {
        format!("Materialize failed ({status})")
    } else {
        err
    })
}

/// remove specific materialized clip files (mp4+jpg pairs) from a Scenepack's
/// storage, called when a clip is removed from the pack. only deletes files
/// that actually live inside that pack's own folder, regardless of what path
/// the caller passes in
#[tauri::command]
pub async fn delete_scenepack_clip_files(
    app: AppHandle,
    scenepack_id: String,
    clip_paths: Vec<String>,
    custom_path: Option<String>,
) -> Result<(), String> {
    let id = sanitize_episode_cache_id(&scenepack_id)?;
    let pack_dir = resolve_scenepacks_storage_dir(&app, custom_path.as_deref())?.join(id);

    for clip_path in clip_paths {
        let path = std::path::PathBuf::from(&clip_path);
        if path.parent() != Some(pack_dir.as_path()) {
            continue;
        }
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(path.with_extension("jpg"));
    }

    Ok(())
}

/// copies a chosen image into the scenepack's own storage folder and returns
/// the stored path.
///
/// the picked file could be anywhere, a download, a temp folder, a removable
/// drive, and the panel keeps only a path, so pointing at the original would
/// leave a broken thumbnail the moment that file moved. animated formats are
/// copied byte for byte rather than re-encoded, so a GIF still animates
#[tauri::command]
pub async fn save_scenepack_thumbnail(
    app: AppHandle,
    scenepack_id: String,
    source_path: String,
    custom_path: Option<String>,
) -> Result<String, String> {
    let source = std::path::Path::new(&source_path);
    if !source.exists() {
        return Err("That image no longer exists.".to_string());
    }

    let extension = source
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .unwrap_or_else(|| "png".to_string());

    if !matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif") {
        return Err("Thumbnail must be a PNG, JPEG, WebP, or GIF image.".to_string());
    }

    let id = sanitize_episode_cache_id(&scenepack_id)?;
    let pack_dir = resolve_scenepacks_storage_dir(&app, custom_path.as_deref())?.join(id);
    std::fs::create_dir_all(&pack_dir)
        .map_err(|e| format!("Failed to create scenepack folder: {e}"))?;

    // a changing filename per save, so the webview's image cache cannot keep
    // showing the previous thumbnail after it is replaced
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let destination = pack_dir.join(format!("cover_{stamp}.{extension}"));

    std::fs::copy(source, &destination).map_err(|e| format!("Failed to save thumbnail: {e}"))?;

    // drop any previous cover, so replacing one repeatedly does not accumulate
    if let Ok(entries) = std::fs::read_dir(&pack_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path == destination {
                continue;
            }
            let is_cover = path
                .file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("cover_"));
            if is_cover {
                let _ = std::fs::remove_file(path);
            }
        }
    }

    Ok(destination.to_string_lossy().to_string())
}

/// remove a whole Scenepack's storage folder, called when the pack itself is
/// deleted
#[tauri::command]
pub async fn delete_scenepack_storage(
    app: AppHandle,
    scenepack_id: String,
    custom_path: Option<String>,
) -> Result<(), String> {
    let id = sanitize_episode_cache_id(&scenepack_id)?;
    let pack_dir = resolve_scenepacks_storage_dir(&app, custom_path.as_deref())?.join(id);
    if pack_dir.exists() {
        std::fs::remove_dir_all(&pack_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// remove ALL Scenepacks' storage, the "Clear Scenepack Storage" settings
/// button, and what runs if the user opts to delete their Scenepacks when
/// disabling the feature. unlike `clear_episode_panel_cache`, this wipes
/// `scene_packs/` outright rather than filtering child-by-child: that folder
/// is created and populated by AMVerge alone, never a user-chosen location
/// that might hold unrelated files, so there's nothing else in there to
/// preserve
#[tauri::command]
pub async fn clear_scenepacks_storage(
    app: AppHandle,
    custom_path: Option<String>,
) -> Result<(), String> {
    let dir = resolve_scenepacks_storage_dir(&app, custom_path.as_deref())?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}
