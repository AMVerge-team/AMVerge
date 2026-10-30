//! Scene Scout: thin wrappers over `amverge scout ...`; the CLI owns the model and databases, this side passes `--root` and parses `--json`

mod cli;
mod types;
mod worker;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, State};

use crate::utils::logging::{console_log, emit_console_log, sanitize_for_console};
use crate::utils::paths::file_name_only;
use crate::utils::process::{bind_to_app_lifetime, kill_process_tree_async};
use cli::{forward_stderr, read_json_lines, scout_json, scout_root, spawn_scout, TempFile};
use worker::{emit_loading_model, ensure_worker};

pub use types::*;
pub use worker::SceneScoutWorkerState;

/// what an aborted scout run returns; the frontend treats it as a stop, not a failure
pub const SCOUT_CANCELED: &str = "Canceled.";

/// the foreground scout run (add episode, generate thumbnails) the progress window's abort stops
#[derive(Default, Clone)]
pub struct ActiveScoutIndex {
    pub pid: Arc<Mutex<Option<u32>>>,
    /// set by abort, so a killed run reports `SCOUT_CANCELED` instead of failing or retrying on the cli
    pub canceled: Arc<AtomicBool>,
}

impl ActiveScoutIndex {
    fn start(&self, pid: u32) {
        self.canceled.store(false, Ordering::SeqCst);
        if let Ok(mut lock) = self.pid.lock() {
            *lock = Some(pid);
        }
    }

    /// forgets `pid` once its run is over (a later run may already own the slot)
    fn finish(&self, pid: u32) {
        if let Ok(mut lock) = self.pid.lock() {
            if *lock == Some(pid) {
                *lock = None;
            }
        }
    }

    fn was_canceled(&self) -> bool {
        self.canceled.load(Ordering::SeqCst)
    }
}

/// stats for one database by path; databases saved outside the managed folder never appear in the root listing
#[tauri::command]
pub async fn scout_database_info(
    app: AppHandle,
    path: String,
    custom_path: Option<String>,
) -> Result<ScoutDatabase, String> {
    let root = scout_root(&app, custom_path.as_deref())?;
    let envelope: DatabaseEnvelope = scout_json(&app, &["info", &path, "--root", &root]).await?;
    Ok(envelope.database)
}

#[tauri::command]
pub async fn scout_open_database(
    app: AppHandle,
    path: String,
    custom_path: Option<String>,
) -> Result<ScoutDatabase, String> {
    let root = scout_root(&app, custom_path.as_deref())?;
    let envelope: DatabaseEnvelope = scout_json(&app, &["open", &path, "--root", &root]).await?;
    Ok(envelope.database)
}

#[tauri::command]
pub async fn scout_list_databases(app: AppHandle, custom_path: Option<String>) -> Result<Vec<ScoutDatabase>, String> {
    let root = scout_root(&app, custom_path.as_deref())?;
    let envelope: DatabasesEnvelope = scout_json(&app, &["databases", "--root", &root]).await?;
    Ok(envelope.databases)
}

#[tauri::command]
pub async fn scout_create_database(
    app: AppHandle,
    name: String,
    custom_path: Option<String>,
) -> Result<ScoutDatabase, String> {
    let root = scout_root(&app, custom_path.as_deref())?;
    let envelope: DatabaseEnvelope = scout_json(&app, &["create", &name, "--root", &root]).await?;
    Ok(envelope.database)
}

#[tauri::command]
pub async fn scout_delete_database(app: AppHandle, name: String, custom_path: Option<String>) -> Result<bool, String> {
    let root = scout_root(&app, custom_path.as_deref())?;
    let envelope: DeletedEnvelope = scout_json(&app, &["delete", &name, "--root", &root]).await?;
    Ok(envelope.deleted)
}

#[tauri::command]
pub async fn scout_list_videos(
    app: AppHandle,
    database: String,
    custom_path: Option<String>,
) -> Result<Vec<ScoutVideo>, String> {
    let root = scout_root(&app, custom_path.as_deref())?;
    let envelope: VideosEnvelope = scout_json(&app, &["videos", &database, "--root", &root]).await?;
    Ok(envelope.videos)
}

#[tauri::command]
pub async fn scout_delete_video(
    app: AppHandle,
    database: String,
    video_id: i64,
    custom_path: Option<String>,
) -> Result<bool, String> {
    let root = scout_root(&app, custom_path.as_deref())?;
    let video_id = video_id.to_string();
    let envelope: DeletedEnvelope =
        scout_json(&app, &["delete-video", &database, "--id", &video_id, "--root", &root]).await?;
    Ok(envelope.deleted)
}

#[tauri::command]
pub async fn scout_status(app: AppHandle, custom_path: Option<String>) -> Result<ScoutStatus, String> {
    let root = scout_root(&app, custom_path.as_deref())?;
    scout_json(&app, &["status", "--root", &root]).await
}

/// fills in missing thumbnails and redoes low-resolution ones
#[tauri::command]
pub async fn scout_generate_thumbnails(
    app: AppHandle,
    active_index: State<'_, ActiveScoutIndex>,
    database: String,
    custom_path: Option<String>,
    report_progress: Option<bool>,
) -> Result<ScoutGenerateThumbnailsResult, String> {
    let report_progress = report_progress.unwrap_or(false);
    let root = scout_root(&app, custom_path.as_deref())?;
    let (mut child, child_pid) =
        spawn_scout(&app, "generate-thumbnails", &["generate-thumbnails", "--db", &database, "--root", &root])?;
    if report_progress {
        active_index.start(child_pid);
    }

    let stderr = child.stderr.take().ok_or("Scene Scout produced no stderr stream.")?;
    let (stderr_task, _) = forward_stderr(&app, stderr);
    let stdout = child.stdout.take().ok_or("Scene Scout produced no output stream.")?;

    let run = read_json_lines(stdout, |value| {
        if !report_progress {
            return;
        }
        if let Ok(progress) = serde_json::from_value::<ScoutIndexProgress>(value) {
            let _ = app.emit("scout_progress", progress);
        }
    })
    .await;

    let status = child.wait().await.map_err(|e| format!("Thumbnail generation failed to finish: {e}"))?;
    let _ = stderr_task.await;

    // a stop is a pause: finished episodes are saved, and the next run skips them
    if report_progress {
        active_index.finish(child_pid);
        if active_index.was_canceled() {
            console_log("SCOUT|abort", "generate-thumbnails paused");
            return Err(SCOUT_CANCELED.to_string());
        }
    }

    if let Some(message) = run.error {
        return Err(message);
    }
    match run.done.and_then(|done| serde_json::from_value(done).ok()) {
        Some(result) if status.success() => Ok(result),
        _ => Err(format!("Thumbnail generation stopped ({status}). Check the console for details.")),
    }
}

#[tauri::command]
pub async fn scout_search(
    app: AppHandle,
    args: ScoutSearchArgs,
    custom_path: Option<String>,
    worker_state: State<'_, SceneScoutWorkerState>,
) -> Result<Vec<ScoutHit>, String> {
    let root = scout_root(&app, custom_path.as_deref())?;

    if args.keep_model_in_memory.unwrap_or(true) {
        let mut worker_guard = worker_state.inner.lock().await;
        let gpu_standby = args.gpu_standby.unwrap_or(true);
        if let Some(session) = ensure_worker(&app, &mut worker_guard, &root, gpu_standby, true).await {
            let req = serde_json::json!({
                "action": "search",
                "query": args.query,
                "databases": args.databases,
                "videos": args.videos,
                "top_k": args.top_k.unwrap_or(24),
                "threshold": args.threshold.unwrap_or(-1.0),
                "include_thumbnails": args.include_thumbnails.unwrap_or(true),
                "flow_from": args.flow_from.as_ref().map(|f| serde_json::json!({
                    "path": f.path,
                    "start_ms": f.start_ms,
                    "end_ms": f.end_ms,
                })),
            });

            let app_clone = app.clone();
            let reply = session
                .send_request_streaming(req, move |val| {
                    if let Ok(progress) = serde_json::from_value::<ScoutIndexProgress>(val) {
                        let _ = app_clone.emit("scout_progress", progress);
                    }
                })
                .await;
            match reply {
                Ok(resp) => {
                    if let Some(err) = resp.get("error").and_then(|v| v.as_str()) {
                        return Err(err.to_string());
                    }
                    let results = resp.get("results").ok_or("Missing results in daemon response")?;
                    return serde_json::from_value(results.clone())
                        .map_err(|e| format!("Failed to parse daemon search results: {e}"));
                }
                Err(e) => {
                    console_log("SCOUT|daemon", &format!("daemon request failed: {e}, falling back to CLI"));
                    if let Some(mut old) = worker_guard.take() {
                        let _ = old.child.kill().await;
                    }
                }
            }
        }
    }

    emit_loading_model(&app);

    let mut argv: Vec<String> = vec!["search".into()];
    // a flow search may have no text; the clip's last frame stands in for it
    if !args.query.trim().is_empty() {
        argv.push(args.query.clone());
    }
    argv.extend([
        "--root".into(),
        root,
        "--top-k".into(),
        args.top_k.unwrap_or(24).to_string(),
        "--threshold".into(),
        args.threshold.unwrap_or(-1.0).to_string(),
    ]);
    if let Some(flow) = &args.flow_from {
        argv.extend(["--flow-from".into(), flow.path.clone()]);
        if let Some(ms) = flow.start_ms {
            argv.extend(["--flow-start-ms".into(), ms.to_string()]);
        }
        if let Some(ms) = flow.end_ms {
            argv.extend(["--flow-end-ms".into(), ms.to_string()]);
        }
    }
    for name in &args.databases {
        argv.extend(["--db".into(), name.clone()]);
    }
    for video in &args.videos {
        argv.extend(["--video".into(), video.clone()]);
    }
    if args.include_thumbnails == Some(false) {
        argv.push("--no-thumbnails".into());
    }

    let borrowed: Vec<&str> = argv.iter().map(String::as_str).collect();
    let envelope: ResultsEnvelope = scout_json(&app, &borrowed).await?;
    match envelope.error {
        Some(error) => Err(error),
        None => Ok(envelope.results),
    }
}

#[tauri::command]
pub async fn scout_unload_model(
    _app: AppHandle,
    _custom_path: Option<String>,
    worker_state: State<'_, SceneScoutWorkerState>,
) -> Result<bool, String> {
    let Some(mut session) = worker_state.inner.lock().await.take() else {
        return Ok(false);
    };
    console_log("SCOUT|daemon", "unloading model and terminating daemon");
    session.shutdown().await;
    Ok(true)
}

/// indexes a video, streaming progress to the webview as `scout_progress`
#[tauri::command]
pub async fn scout_add_video(
    app: AppHandle,
    database: String,
    video_path: String,
    detector: Option<String>,
    custom_path: Option<String>,
    keep_model_in_memory: Option<bool>,
    gpu_standby: Option<bool>,
    // an episode already cut on home: its [start_ms, end_ms] ranges, so the cli skips detection
    scenes: Option<Vec<[u64; 2]>>,
    active_index: State<'_, ActiveScoutIndex>,
    worker_state: State<'_, SceneScoutWorkerState>,
) -> Result<u64, String> {
    let root = scout_root(&app, custom_path.as_deref())?;
    let method = detector.unwrap_or_else(|| "keyframe_detection".to_string());
    let video_name = file_name_only(&video_path);
    let db_name = file_name_only(&database);
    let scenes = scenes.filter(|s| !s.is_empty());

    console_log(
        "SCOUT|start",
        &match &scenes {
            Some(s) => format!("verb=add video={video_name} db={db_name} precut={} scenes", s.len()),
            None => format!("verb=add video={video_name} db={db_name} detector={method}"),
        },
    );

    let emit_progress = |value: serde_json::Value| {
        if let Ok(mut progress) = serde_json::from_value::<ScoutIndexProgress>(value) {
            progress.video = Some(video_path.clone());
            let _ = app.emit("scout_progress", progress);
        }
    };

    if keep_model_in_memory.unwrap_or(true) {
        let mut worker_guard = worker_state.inner.lock().await;
        let gpu_standby = gpu_standby.unwrap_or(true);
        if let Some(session) = ensure_worker(&app, &mut worker_guard, &root, gpu_standby, false).await {
            let child_pid = session.child.id().unwrap_or_default();
            console_log("SCOUT|pid", &format!("pid={child_pid}"));
            active_index.start(child_pid);

            let req = serde_json::json!({
                "action": "add",
                "video": video_path,
                "database": database,
                "detector": method,
                "scenes": scenes,
            });
            let res = session.send_request_streaming(req, emit_progress).await;
            active_index.finish(child_pid);

            match res {
                Ok(resp) => {
                    if let Some(err) = resp.get("error").and_then(|v| v.as_str()) {
                        console_log("ERROR|scout_add_video", &format!("video={video_name} db={db_name} error={err}"));
                        return Err(err.to_string());
                    }
                    let scenes = resp.get("scenes").and_then(|v| v.as_u64()).unwrap_or(0);
                    console_log("SCOUT|end", &format!("verb=add video={video_name} scenes={scenes}"));
                    return Ok(scenes);
                }
                Err(e) => {
                    if let Some(mut old) = worker_guard.take() {
                        let _ = old.child.kill().await;
                    }
                    // an abort kills the daemon too; that is a stop, not a reason to index again on the cli
                    if active_index.was_canceled() {
                        console_log("SCOUT|abort", &format!("add canceled video={video_name}"));
                        return Err(SCOUT_CANCELED.to_string());
                    }
                    console_log("SCOUT|daemon", &format!("daemon indexing failed: {e}, falling back to CLI"));
                }
            }
        }
    }

    // the cli takes pre-cut ranges as a file, deleted when this returns
    let scenes_file = scenes.as_ref().map(|ranges| TempFile::write_json("scout_scenes", ranges)).transpose()?;
    let mut args = vec![
        "add",
        video_path.as_str(),
        "--db",
        database.as_str(),
        "--root",
        root.as_str(),
        "--detector",
        method.as_str(),
    ];
    if let Some(file) = &scenes_file {
        args.extend(["--scenes-json", file.path_str()]);
    }
    let (mut child, child_pid) = spawn_scout(&app, "add", &args)?;
    console_log("SCOUT|pid", &format!("pid={child_pid}"));
    active_index.start(child_pid);

    let stderr = child.stderr.take().ok_or("Indexing produced no stderr stream.")?;
    let (stderr_task, stderr_accum) = forward_stderr(&app, stderr);
    let stdout = child.stdout.take().ok_or("Indexing produced no output stream.")?;

    let run = read_json_lines(stdout, emit_progress).await;
    let scenes = run.done.as_ref().and_then(|v| v.get("scenes")).and_then(|v| v.as_u64()).unwrap_or(0);

    let status = child.wait().await.map_err(|e| format!("Indexing failed to finish: {e}"))?;
    let _ = stderr_task.await;
    active_index.finish(child_pid);

    if active_index.was_canceled() {
        console_log("SCOUT|abort", &format!("add canceled video={video_name}"));
        return Err(SCOUT_CANCELED.to_string());
    }
    if let Some(message) = run.error {
        console_log("ERROR|scout_add_video", &format!("video={video_name} db={db_name} error={message}"));
        return Err(message);
    }
    if !status.success() {
        let dump = stderr_accum.lock().map(|s| s.clone()).unwrap_or_default();
        console_log("ERROR|scout_add_video", &format!("video={video_name} exit={status}"));
        console_log("ERROR|scout_add_video", "backend_stderr_dump_begin");
        for line in dump.lines() {
            let sanitized = sanitize_for_console(line);
            if !sanitized.trim().is_empty() {
                emit_console_log(&app, "python", "log", &sanitized);
            }
        }
        console_log("ERROR|scout_add_video", "backend_stderr_dump_end");
        return Err(format!("Indexing {video_name} failed. Check the console for details."));
    }

    console_log("SCOUT|end", &format!("verb=add video={video_name} status={status} scenes={scenes}"));
    Ok(scenes)
}

#[tauri::command]
pub async fn abort_scout_index(active_index: State<'_, ActiveScoutIndex>) -> Result<(), String> {
    let Some(pid) = active_index.pid.lock().map_err(|e| e.to_string())?.take() else {
        console_log("SCOUT|abort", "no active scout indexing process to kill");
        return Ok(());
    };
    active_index.canceled.store(true, Ordering::SeqCst);

    // killed without the daemon lock, which a daemon add holds until the daemon dies
    console_log("SCOUT|abort", &format!("killing indexing process tree pid={pid}"));
    let result = kill_process_tree_async(pid).await?;
    if result.status.success() {
        console_log("SCOUT|abort", &format!("killed scout indexing pid={pid} ok"));
    } else {
        let stderr = String::from_utf8_lossy(&result.stderr).trim().to_string();
        console_log("SCOUT|abort", &format!("kill scout indexing pid={pid} failed: {stderr}"));
    }
    Ok(())
}

/// one 240p jpeg frame of a video as a data url, for hits whose database has no stored thumbnail
#[tauri::command]
pub async fn extract_scout_thumbnail_memory(
    app: AppHandle,
    video_path: String,
    timestamp_sec: f64,
) -> Result<Option<String>, String> {
    let input_path = std::path::PathBuf::from(&video_path);
    if !input_path.is_file() {
        return Ok(None);
    }

    let ffmpeg = crate::utils::ffmpeg::resolve_bundled_tool(&app, "ffmpeg")?;
    let seek_time = timestamp_sec.max(0.0);

    tokio::task::spawn_blocking(move || -> Result<Option<String>, String> {
        use base64::Engine;
        let mut cmd = std::process::Command::new(&ffmpeg);
        crate::utils::process::apply_no_window(&mut cmd);
        #[cfg(not(windows))]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }

        cmd.args(["-y", "-ss", &format!("{seek_time:.3}"), "-i"]);
        cmd.arg(&input_path);
        cmd.args([
            "-frames:v",
            "1",
            "-an",
            "-vf",
            "scale=-2:240:flags=fast_bilinear",
            "-f",
            "image2",
            "-c:v",
            "mjpeg",
            "-q:v",
            "5",
            "pipe:1",
        ]);
        cmd.stdin(std::process::Stdio::null());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::null());

        // spawned rather than .output() so it can be bound like every other ffmpeg
        let child = cmd.spawn().map_err(|e| e.to_string())?;
        bind_to_app_lifetime(child.id());
        let output = child.wait_with_output().map_err(|e| e.to_string())?;
        if output.status.success() && !output.stdout.is_empty() {
            let encoded = base64::engine::general_purpose::STANDARD.encode(&output.stdout);
            Ok(Some(format!("data:image/jpeg;base64,{encoded}")))
        } else {
            Ok(None)
        }
    })
    .await
    .map_err(|e| format!("Thumbnail extraction task panicked: {e}"))?
}
