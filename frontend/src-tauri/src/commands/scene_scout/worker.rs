//! the long-lived `amverge scout daemon`, which keeps SigLIP 2 loaded between searches

use std::process::Stdio;
use std::sync::Arc;

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use super::cli::forward_stderr;
use super::types::ScoutIndexProgress;
use crate::utils::logging::console_log;
use crate::utils::process::bind_to_app_lifetime;
use crate::utils::sidecar::amverge_ai_command;

pub struct SceneScoutWorkerSession {
    pub child: tokio::process::Child,
    pub stdin: tokio::process::ChildStdin,
    pub stdout_lines: tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,
    pub root: String,
    pub req_id: u64,
}

impl SceneScoutWorkerSession {
    async fn write_line(&mut self, req: &serde_json::Value) -> Result<(), String> {
        let mut line = serde_json::to_string(req).map_err(|e| e.to_string())?;
        line.push('\n');
        self.stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| format!("Failed to write to daemon stdin: {e}"))?;
        self.stdin.flush().await.map_err(|e| format!("Failed to flush daemon stdin: {e}"))
    }

    /// sends one request and waits for its reply, passing its progress lines to `on_progress`
    pub async fn send_request_streaming<F>(
        &mut self,
        mut req: serde_json::Value,
        mut on_progress: F,
    ) -> Result<serde_json::Value, String>
    where
        F: FnMut(serde_json::Value),
    {
        self.req_id += 1;
        let id = self.req_id;
        req["id"] = serde_json::json!(id);
        self.write_line(&req).await?;

        while let Some(line) = self
            .stdout_lines
            .next_line()
            .await
            .map_err(|e| format!("Failed to read line from daemon: {e}"))?
        {
            let Ok(resp) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
            if resp.get("id").and_then(|v| v.as_u64()) != Some(id) {
                continue;
            }
            if resp.get("status").and_then(|v| v.as_str()) == Some("progress") {
                on_progress(resp);
                continue;
            }
            return Ok(resp);
        }
        Err("Daemon connection closed unexpectedly".to_string())
    }

    pub async fn shutdown(&mut self) {
        let _ = self.write_line(&serde_json::json!({"action": "shutdown"})).await;
        let _ = self.child.kill().await;
    }
}

#[derive(Default)]
pub struct SceneScoutWorkerState {
    pub inner: Arc<tokio::sync::Mutex<Option<SceneScoutWorkerSession>>>,
}

fn spawn_scout_worker(app: &AppHandle, root: &str, gpu_standby: bool) -> Result<SceneScoutWorkerSession, String> {
    console_log("SCOUT|daemon", &format!("spawning daemon root={root} standby={gpu_standby}"));

    let mut cmd = amverge_ai_command(app)?;
    cmd.args(["scout", "daemon", "--root", root]);
    if !gpu_standby {
        cmd.args(["--idle-seconds", "0"]);
    }
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = tokio::process::Command::from(cmd)
        .spawn()
        .map_err(|e| format!("Failed to spawn scout daemon: {e}"))?;
    if let Some(pid) = child.id() {
        bind_to_app_lifetime(pid);
    }

    let stdin = child.stdin.take().ok_or("Failed to open daemon stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to open daemon stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open daemon stderr")?;
    forward_stderr(app, stderr);

    Ok(SceneScoutWorkerSession {
        child,
        stdin,
        stdout_lines: BufReader::new(stdout).lines(),
        root: root.to_string(),
        req_id: 0,
    })
}

/// tells the webview the model is about to load, which opens its loading card
pub(super) fn emit_loading_model(app: &AppHandle) {
    let _ = app.emit(
        "scout_progress",
        ScoutIndexProgress { stage: "loading_model".into(), done: 0, total: 1, video: None },
    );
}

/// the running daemon for `root`, spawning (or respawning for a new root) as needed; None falls back to the cli
pub(super) async fn ensure_worker<'a>(
    app: &AppHandle,
    guard: &'a mut Option<SceneScoutWorkerSession>,
    root: &str,
    gpu_standby: bool,
    announce_loading: bool,
) -> Option<&'a mut SceneScoutWorkerSession> {
    if guard.as_ref().map_or(true, |session| session.root != root) {
        if announce_loading {
            emit_loading_model(app);
        }
        if let Some(mut old) = guard.take() {
            old.shutdown().await;
        }
        match spawn_scout_worker(app, root, gpu_standby) {
            Ok(session) => *guard = Some(session),
            Err(e) => console_log("SCOUT|daemon", &format!("failed to spawn daemon: {e}, falling back to CLI")),
        }
    }
    guard.as_mut()
}
