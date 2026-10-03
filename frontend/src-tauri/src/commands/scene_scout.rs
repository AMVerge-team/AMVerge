//! Scene Scout: natural-language scene search over indexed video.
//!
//! Every command here is a thin wrapper over `amverge scout ...`. The Rust side
//! owns exactly two things and delegates the rest:
//!
//! 1. **Where databases live.** `--root` is always passed, resolved from the
//!    storage location the user picked in Settings, so the CLI never guesses.
//! 2. **Turning stdout into typed values.** The CLI speaks JSON on `--json`.
//!
//! Nothing here knows about SigLIP, SQLite or embeddings. That is all CLI-side,
//! which is what lets Scene Scout keep working as a standalone tool.

use std::process::Stdio;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use crate::utils::logging::{console_log, emit_console_log, sanitize_for_console};
use crate::utils::paths::{file_name_only, resolve_scene_scout_storage_dir};
use crate::utils::sidecar::amverge_ai_command;
use crate::utils::sidecar::amverge_exe_name;

// ---------------------------------------------------------------------------
// Wire types. camelCase out, matching the CLI's JSON and the TS types in
// `frontend/src/features/sceneScout/types.ts`.
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScoutDatabase {
    pub name: String,
    pub path: String,
    pub video_count: u64,
    pub scene_count: u64,
    pub size_bytes: u64,
    pub model_version: String,
    #[serde(default)]
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScoutVideo {
    pub id: i64,
    pub filepath: String,
    pub name: String,
    pub scene_count: u64,
    pub status: String,
    #[serde(default)]
    pub modified_at: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScoutHit {
    pub video_path: String,
    pub scene_index: i64,
    pub start_ms: i64,
    pub end_ms: i64,
    pub start_sec: f64,
    pub end_sec: f64,
    pub score: f64,
    pub database: String,
    #[serde(default)]
    pub thumbnail_b64: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScoutStatus {
    pub model_available: bool,
    pub model_version: String,
    #[serde(default)]
    pub device: Option<String>,
    pub root: String,
    pub database_count: u64,
}

/// Progress line from `scout add`, forwarded to the webview as `scout_progress`.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScoutIndexProgress {
    pub stage: String,
    pub done: u64,
    pub total: u64,
    #[serde(default)]
    pub video: Option<String>,
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

/// The storage root, created on demand.
///
/// `custom_path` is the user's Settings storage location. Creating it here
/// rather than lazily in the CLI means the folder exists the moment the page
/// opens, so a relocation has something to move even before the first database.
fn scout_root(app: &AppHandle, custom_path: Option<&str>) -> Result<String, String> {
    let dir = resolve_scene_scout_storage_dir(app, custom_path)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create Scene Scout folder: {e}"))?;
    Ok(dir.to_string_lossy().to_string())
}

/// Forward a child's stderr to the console, keeping the interesting lines.
///
/// Everything a python dependency writes is ours to look at later, but
/// `PROGRESS|` lines are detector churn with no debug value (the rate that the
/// backend command found years ago swamps the console), so they are dropped
/// like the episode path does. The surviving lines are both streamed live and
/// accumulated so an error can dump the exact stderr that caused it.
fn forward_stderr(
    app: &AppHandle,
    stderr: tokio::process::ChildStderr,
) -> (tokio::task::JoinHandle<()>, Arc<Mutex<String>>) {
    let app = app.clone();
    let accum = Arc::new(Mutex::new(String::new()));
    let task_accum = Arc::clone(&accum);
    let handle = tokio::task::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let sanitized = sanitize_for_console(&line);
            if sanitized.trim().is_empty()
                || sanitized.starts_with("PROGRESS|")
                || sanitized.contains("Loading weights:")
                || sanitized.contains("Loading checkpoint shards:")
                || sanitized.contains("Fetching ")
            {
                continue;
            }
            if let Ok(mut acc) = task_accum.lock() {
                acc.push_str(&line);
                acc.push('\n');
            }
            emit_console_log(&app, "python", "log", &sanitized);
        }
    });
    (handle, accum)
}

/// The app always runs the AI variant, whichever way the subcommand needs it.
fn scout_pair(app: &AppHandle, args: &[&str]) -> Result<(std::process::Command, String), String> {
    let mut cmd = amverge_ai_command(app)?;
    cmd.arg("scout");
    for arg in args {
        cmd.arg(arg);
    }
    cmd.arg("--json").stderr(Stdio::piped());
    let argv: Vec<String> = std::iter::once("scout".to_string())
        .chain(args.iter().map(|s| s.to_string()))
        .chain(std::iter::once("--json".to_string()))
        .collect();
    Ok((cmd, argv.join(",")))
}

/// Descriptive one-liner for one subcommand, short enough to scan.
fn scout_spawn_log(verb: &str, argv: &str) {
    console_log(
        "SCOUT|spawn",
        &format!(
            "verb={verb} mode={} exe={} ai=true args=[{argv}]",
            if cfg!(debug_assertions) { "dev" } else { "prod" },
            amverge_exe_name()
        ),
    );
}

/// Run a scout subcommand and parse its single JSON document.
///
/// Uses `amverge_ai_command`: Scene Scout needs the model, which in a release
/// build lives in the app-managed AI venv rather than the plain sidecar.
async fn scout_json<T: for<'de> Deserialize<'de>>(
    app: &AppHandle,
    args: &[&str],
) -> Result<T, String> {
    let verb = args.first().copied().unwrap_or("scout");
    let (cmd, argv) = scout_pair(app, args)?;
    scout_spawn_log(verb, &argv);

    let mut child = tokio::process::Command::from(cmd)
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run the AMVerge CLI: {e}"))?;

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Scene Scout produced no stderr stream.".to_string())?;
    let (stderr_task, stderr_accum) = forward_stderr(app, stderr);

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("Failed to run the AMVerge CLI: {e}"))?;

    let _ = stderr_task.await;

    let stdout = String::from_utf8_lossy(&output.stdout);
    // the CLI prints one compact document on --json, but a warning from a
    // dependency can still land on stdout ahead of it, so take the last
    // non-empty line rather than the whole buffer
    let line = stdout
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .unwrap_or_default();

    if line.trim().is_empty() {
        let stderr = stderr_accum
            .lock()
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
        return Err(if stderr.is_empty() {
            "Scene Scout returned no output.".to_string()
        } else {
            stderr
        });
    }

    serde_json::from_str::<T>(line)
        .map_err(|e| format!("Could not read Scene Scout output: {e}"))
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct DatabasesEnvelope {
    databases: Vec<ScoutDatabase>,
}

/// Stats for one database by path, for databases the user saved outside the
/// managed folder. Those never appear in the root listing, so the app keeps
/// their paths itself and asks about each one.
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
    let envelope: DatabaseEnvelope =
        scout_json(&app, &["open", &path, "--root", &root]).await?;
    Ok(envelope.database)
}

#[tauri::command]
pub async fn scout_list_databases(
    app: AppHandle,
    custom_path: Option<String>,
) -> Result<Vec<ScoutDatabase>, String> {
    let root = scout_root(&app, custom_path.as_deref())?;
    let envelope: DatabasesEnvelope = scout_json(&app, &["databases", "--root", &root]).await?;
    Ok(envelope.databases)
}

#[derive(Deserialize)]
struct DatabaseEnvelope {
    database: ScoutDatabase,
}

#[tauri::command]
pub async fn scout_create_database(
    app: AppHandle,
    name: String,
    custom_path: Option<String>,
) -> Result<ScoutDatabase, String> {
    let root = scout_root(&app, custom_path.as_deref())?;
    let envelope: DatabaseEnvelope =
        scout_json(&app, &["create", &name, "--root", &root]).await?;
    Ok(envelope.database)
}

#[derive(Deserialize)]
struct DeletedEnvelope {
    deleted: bool,
}

#[tauri::command]
pub async fn scout_delete_database(
    app: AppHandle,
    name: String,
    custom_path: Option<String>,
) -> Result<bool, String> {
    let root = scout_root(&app, custom_path.as_deref())?;
    let envelope: DeletedEnvelope = scout_json(&app, &["delete", &name, "--root", &root]).await?;
    Ok(envelope.deleted)
}

#[derive(Deserialize)]
struct VideosEnvelope {
    videos: Vec<ScoutVideo>,
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
pub async fn scout_status(
    app: AppHandle,
    custom_path: Option<String>,
) -> Result<ScoutStatus, String> {
    let root = scout_root(&app, custom_path.as_deref())?;
    scout_json(&app, &["status", "--root", &root]).await
}

#[derive(Deserialize)]
struct ResultsEnvelope {
    results: Vec<ScoutHit>,
    #[serde(default)]
    error: Option<String>,
}

pub struct SceneScoutWorkerSession {
    pub child: tokio::process::Child,
    pub stdin: tokio::process::ChildStdin,
    pub stdout_lines: tokio::io::Lines<tokio::io::BufReader<tokio::process::ChildStdout>>,
    pub root: String,
    pub req_id: u64,
}

impl SceneScoutWorkerSession {
    pub async fn send_request(
        &mut self,
        mut req: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        self.req_id += 1;
        let id = self.req_id;
        req["id"] = serde_json::json!(id);

        let line = serde_json::to_string(&req).map_err(|e| e.to_string())?;
        self.stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| format!("Failed to write to daemon stdin: {e}"))?;
        self.stdin
            .write_all(b"\n")
            .await
            .map_err(|e| format!("Failed to write newline to daemon stdin: {e}"))?;
        self.stdin
            .flush()
            .await
            .map_err(|e| format!("Failed to flush daemon stdin: {e}"))?;

        while let Some(line) = self
            .stdout_lines
            .next_line()
            .await
            .map_err(|e| format!("Failed to read line from daemon: {e}"))?
        {
            if let Ok(resp) = serde_json::from_str::<serde_json::Value>(&line) {
                if resp.get("id").and_then(|v| v.as_u64()) == Some(id) {
                    return Ok(resp);
                }
            }
        }
        Err("Daemon connection closed unexpectedly".to_string())
    }

    pub async fn shutdown(&mut self) {
        let req = serde_json::json!({"action": "shutdown"});
        let line = serde_json::to_string(&req).unwrap_or_default();
        let _ = self.stdin.write_all(line.as_bytes()).await;
        let _ = self.stdin.write_all(b"\n").await;
        let _ = self.stdin.flush().await;
        let _ = self.child.kill().await;
    }
}

#[derive(Default)]
pub struct SceneScoutWorkerState {
    pub inner: Arc<tokio::sync::Mutex<Option<SceneScoutWorkerSession>>>,
}

#[derive(Default, Clone)]
pub struct ActiveScoutIndex(pub Arc<Mutex<Option<u32>>>);

fn spawn_scout_worker(
    app: &AppHandle,
    root: &str,
    gpu_standby: bool,
) -> Result<SceneScoutWorkerSession, String> {
    console_log(
        "SCOUT|daemon",
        &format!("spawning daemon root={root} standby={gpu_standby}"),
    );

    let mut std_cmd = amverge_ai_command(app)?;
    std_cmd.arg("scout");
    std_cmd.arg("daemon");
    std_cmd.arg("--root");
    std_cmd.arg(root);
    if !gpu_standby {
        std_cmd.arg("--idle-seconds");
        std_cmd.arg("0");
    }
    std_cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut tokio_cmd = tokio::process::Command::from(std_cmd);
    let mut child = tokio_cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn scout daemon: {e}"))?;

    let stdin = child.stdin.take().ok_or("Failed to open daemon stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to open daemon stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open daemon stderr")?;

    forward_stderr(app, stderr);

    let stdout_lines = BufReader::new(stdout).lines();

    Ok(SceneScoutWorkerSession {
        child,
        stdin,
        stdout_lines,
        root: root.to_string(),
        req_id: 0,
    })
}

/// Search options, mirroring the app's search settings dropdown.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoutSearchArgs {
    pub query: String,
    #[serde(default)]
    pub databases: Vec<String>,
    #[serde(default)]
    pub videos: Vec<String>,
    #[serde(default)]
    pub top_k: Option<u32>,
    #[serde(default)]
    pub threshold: Option<f64>,
    #[serde(default)]
    pub include_thumbnails: Option<bool>,
    #[serde(default)]
    pub keep_model_in_memory: Option<bool>,
    #[serde(default)]
    pub gpu_standby: Option<bool>,
}

#[tauri::command]
pub async fn scout_search(
    app: AppHandle,
    args: ScoutSearchArgs,
    custom_path: Option<String>,
    worker_state: State<'_, SceneScoutWorkerState>,
) -> Result<Vec<ScoutHit>, String> {
    let root = scout_root(&app, custom_path.as_deref())?;
    let keep_in_memory = args.keep_model_in_memory.unwrap_or(true);

    if keep_in_memory {
        let mut worker_guard = worker_state.inner.lock().await;

        let needs_spawn = match &*worker_guard {
            Some(session) => session.root != root,
            None => true,
        };

        if needs_spawn {
            if let Some(mut old) = worker_guard.take() {
                old.shutdown().await;
            }
            match spawn_scout_worker(&app, &root, args.gpu_standby.unwrap_or(true)) {
                Ok(session) => {
                    *worker_guard = Some(session);
                }
                Err(e) => {
                    console_log(
                        "SCOUT|daemon",
                        &format!("failed to spawn daemon: {e}, falling back to CLI"),
                    );
                }
            }
        }

        if let Some(session) = worker_guard.as_mut() {
            let req = serde_json::json!({
                "action": "search",
                "query": args.query,
                "databases": args.databases,
                "videos": args.videos,
                "top_k": args.top_k.unwrap_or(24),
                "threshold": args.threshold.unwrap_or(-1.0),
                "include_thumbnails": args.include_thumbnails.unwrap_or(true),
            });

            match session.send_request(req).await {
                Ok(resp) => {
                    if let Some(err) = resp.get("error").and_then(|v| v.as_str()) {
                        return Err(err.to_string());
                    }
                    if let Some(results) = resp.get("results") {
                        let hits: Vec<ScoutHit> = serde_json::from_value(results.clone())
                            .map_err(|e| format!("Failed to parse daemon search results: {e}"))?;
                        return Ok(hits);
                    }
                    return Err("Missing results in daemon response".to_string());
                }
                Err(e) => {
                    console_log(
                        "SCOUT|daemon",
                        &format!("daemon request failed: {e}, falling back to CLI"),
                    );
                    if let Some(mut old) = worker_guard.take() {
                        let _ = old.child.kill().await;
                    }
                }
            }
        }
    }

    let top_k = args.top_k.unwrap_or(24).to_string();
    let threshold = args.threshold.unwrap_or(-1.0).to_string();

    let mut argv: Vec<String> = vec![
        "search".into(),
        args.query.clone(),
        "--root".into(),
        root,
        "--top-k".into(),
        top_k,
        "--threshold".into(),
        threshold,
    ];

    for name in &args.databases {
        argv.push("--db".into());
        argv.push(name.clone());
    }

    for video in &args.videos {
        argv.push("--video".into());
        argv.push(video.clone());
    }

    if args.include_thumbnails == Some(false) {
        argv.push("--no-thumbnails".into());
    }

    let borrowed: Vec<&str> = argv.iter().map(String::as_str).collect();
    let envelope: ResultsEnvelope = scout_json(&app, &borrowed).await?;

    if let Some(error) = envelope.error {
        return Err(error);
    }
    Ok(envelope.results)
}

#[tauri::command]
pub async fn scout_unload_model(
    _app: AppHandle,
    _custom_path: Option<String>,
    worker_state: State<'_, SceneScoutWorkerState>,
) -> Result<bool, String> {
    let mut worker_guard = worker_state.inner.lock().await;
    if let Some(mut session) = worker_guard.take() {
        console_log("SCOUT|daemon", "unloading model and terminating daemon");
        session.shutdown().await;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Index a video, streaming progress to the webview as `scout_progress`.
///
/// `scout add --json` emits newline-delimited progress objects and then a final
/// `{"done":true}`, so this reads line by line rather than waiting for the
/// process to exit: indexing an episode takes minutes and a progress bar that
/// only fills at the end is not a progress bar.
#[tauri::command]
pub async fn scout_add_video(
    app: AppHandle,
    database: String,
    video_path: String,
    detector: Option<String>,
    custom_path: Option<String>,
    active_index: State<'_, ActiveScoutIndex>,
) -> Result<u64, String> {
    let root = scout_root(&app, custom_path.as_deref())?;

    let method = detector.unwrap_or_else(|| "keyframe_detection".to_string());
    let video_name = file_name_only(&video_path);
    let db_name = file_name_only(&database);

    console_log(
        "SCOUT|start",
        &format!("verb=add video={video_name} db={db_name} detector={method}"),
    );

    let (cmd, argv) = scout_pair(
        &app,
        &[
            "add",
            video_path.as_str(),
            "--db",
            database.as_str(),
            "--root",
            root.as_str(),
            "--detector",
            method.as_str(),
        ],
    )?;
    scout_spawn_log("add", &argv);

    let mut child = tokio::process::Command::from(cmd)
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start indexing: {e}"))?;

    let child_pid = child.id().unwrap_or_default();
    console_log("SCOUT|pid", &format!("pid={child_pid}"));
    if let Ok(mut lock) = active_index.0.lock() {
        *lock = Some(child_pid);
    }

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Indexing produced no stderr stream.".to_string())?;
    let (stderr_task, stderr_accum) = forward_stderr(&app, stderr);

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Indexing produced no output stream.".to_string())?;

    let mut reader = BufReader::new(stdout).lines();
    let mut scenes: u64 = 0;
    let mut failure: Option<String> = None;

    while let Ok(Some(line)) = reader.next_line().await {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) else {
            continue;
        };

        if let Some(message) = value.get("error").and_then(|v| v.as_str()) {
            failure = Some(message.to_string());
            continue;
        }

        if value.get("done").and_then(|v| v.as_bool()) == Some(true) {
            scenes = value.get("scenes").and_then(|v| v.as_u64()).unwrap_or(0);
            continue;
        }

        if let Ok(mut progress) = serde_json::from_value::<ScoutIndexProgress>(value) {
            progress.video = Some(video_path.clone());
            let _ = app.emit("scout_progress", progress);
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Indexing failed to finish: {e}"))?;
    let _ = stderr_task.await;

    if let Ok(mut lock) = active_index.0.lock() {
        *lock = None;
    }

    if let Some(message) = failure {
        console_log(
            "ERROR|scout_add_video",
            &format!("video={video_name} db={db_name} error={message}"),
        );
        return Err(message);
    }
    if !status.success() {
        let dump = stderr_accum
            .lock()
            .map(|s| s.clone())
            .unwrap_or_default();
        console_log(
            "ERROR|scout_add_video",
            &format!("video={video_name} exit={status}"),
        );
        console_log("ERROR|scout_add_video", "backend_stderr_dump_begin");
        for l in dump.lines() {
            let sanitized = sanitize_for_console(l);
            if !sanitized.trim().is_empty() {
                emit_console_log(&app, "python", "log", &sanitized);
            }
        }
        console_log("ERROR|scout_add_video", "backend_stderr_dump_end");
        return Err(if dump.trim().is_empty() {
            "Indexing failed. Check the console for details.".to_string()
        } else {
            dump.trim().to_string()
        });
    }

    console_log(
        "SCOUT|end",
        &format!("verb=add video={video_name} status={status} scenes={scenes}"),
    );

    Ok(scenes)
}

#[tauri::command]
pub async fn abort_scout_index(active_index: State<'_, ActiveScoutIndex>) -> Result<(), String> {
    let pid = active_index.0.lock().map_err(|e| e.to_string())?.take();
    let Some(pid) = pid else {
        console_log("SCOUT|abort", "no active scout indexing process to kill");
        return Ok(());
    };

    console_log("SCOUT|abort", &format!("killing indexing process tree pid={pid}"));

    #[cfg(windows)]
    let result = tokio::task::spawn_blocking(move || {
        let mut cmd = std::process::Command::new("taskkill");
        crate::utils::process::apply_no_window(&mut cmd);
        cmd.args(["/F", "/T", "/PID", &pid.to_string()])
            .output()
            .map_err(|e| format!("Failed to run taskkill: {e}"))
    })
    .await
    .map_err(|e| format!("taskkill task panicked: {e}"))??;

    #[cfg(not(windows))]
    let result = tokio::task::spawn_blocking(move || {
        std::process::Command::new("kill")
            .args(["-9", &format!("-{pid}")])
            .output()
            .map_err(|e| format!("Failed to run kill: {e}"))
    })
    .await
    .map_err(|e| format!("kill task panicked: {e}"))??;

    if result.status.success() {
        console_log("SCOUT|abort", &format!("killed scout indexing pid={pid} ok"));
    } else {
        let stderr = String::from_utf8_lossy(&result.stderr).trim().to_string();
        console_log("SCOUT|abort", &format!("kill scout indexing pid={pid} failed: {stderr}"));
    }

    Ok(())
}
