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

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};

use crate::utils::paths::resolve_scene_scout_storage_dir;
use crate::utils::sidecar::amverge_ai_command;

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

/// Run a scout subcommand and parse its single JSON document.
///
/// Uses `amverge_ai_command`: Scene Scout needs the model, which in a release
/// build lives in the app-managed AI venv rather than the plain sidecar.
async fn scout_json<T: for<'de> Deserialize<'de>>(
    app: &AppHandle,
    args: &[&str],
) -> Result<T, String> {
    let mut cmd = amverge_ai_command(app)?;
    cmd.arg("scout");
    for arg in args {
        cmd.arg(arg);
    }
    cmd.arg("--json");

    let output = tokio::process::Command::from(cmd)
        .output()
        .await
        .map_err(|e| format!("Failed to run the AMVerge CLI: {e}"))?;

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
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(if stderr.trim().is_empty() {
            "Scene Scout returned no output.".to_string()
        } else {
            stderr.trim().to_string()
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

/// Search options, mirroring the app's search settings dropdown.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoutSearchArgs {
    pub query: String,
    #[serde(default)]
    pub databases: Vec<String>,
    #[serde(default)]
    pub top_k: Option<u32>,
    #[serde(default)]
    pub threshold: Option<f64>,
    #[serde(default)]
    pub include_thumbnails: Option<bool>,
}

#[tauri::command]
pub async fn scout_search(
    app: AppHandle,
    args: ScoutSearchArgs,
    custom_path: Option<String>,
) -> Result<Vec<ScoutHit>, String> {
    let root = scout_root(&app, custom_path.as_deref())?;

    // owned strings first: the arg slice borrows them, so they have to outlive it
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

    // no --db means "every database", which is what the app's search-all state
    // sends; naming them explicitly is how a narrowed selection travels
    for name in &args.databases {
        argv.push("--db".into());
        argv.push(name.clone());
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
    // the user's Settings scene-detection choice, passed straight through so
    // Scene Scout finds the same cuts an import of this episode would
    detector: Option<String>,
    custom_path: Option<String>,
) -> Result<u64, String> {
    let root = scout_root(&app, custom_path.as_deref())?;

    let mut cmd = amverge_ai_command(&app)?;
    cmd.arg("scout")
        .arg("add")
        .arg(&video_path)
        .arg("--db")
        .arg(&database)
        .arg("--root")
        .arg(&root)
        .arg("--detector")
        .arg(detector.as_deref().unwrap_or("keyframe_detection"))
        .arg("--json");

    let mut child = tokio::process::Command::from(cmd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start indexing: {e}"))?;

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

    if let Some(message) = failure {
        return Err(message);
    }
    if !status.success() {
        return Err("Indexing failed. Check the console for details.".to_string());
    }

    Ok(scenes)
}
