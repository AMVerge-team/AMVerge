//! running one-shot `amverge scout ... --json` commands and reading what they print

use std::process::Stdio;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, BufReader};

use crate::utils::logging::{console_log, emit_console_log, sanitize_for_console};
use crate::utils::paths::resolve_scene_scout_storage_dir;
use crate::utils::process::bind_to_app_lifetime;
use crate::utils::sidecar::{amverge_ai_command, amverge_exe_name};

/// tail of a child's stderr kept for error reporting; older lines are already in the console
const STDERR_TAIL_BYTES: usize = 64 * 1024;

/// the storage root from settings, created up front so a storage move has a folder to carry
pub(super) fn scout_root(app: &AppHandle, custom_path: Option<&str>) -> Result<String, String> {
    let dir = resolve_scene_scout_storage_dir(app, custom_path)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create Scene Scout folder: {e}"))?;
    Ok(dir.to_string_lossy().to_string())
}

/// streams a child's stderr to the console (minus progress churn) and keeps its tail for errors
pub(super) fn forward_stderr(
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
                // the daemon lives all session, so the buffer must not grow with it
                if acc.len() > STDERR_TAIL_BYTES {
                    let mut cut = acc.len() - STDERR_TAIL_BYTES;
                    while !acc.is_char_boundary(cut) {
                        cut += 1;
                    }
                    acc.drain(..cut);
                }
            }
            emit_console_log(&app, "python", "log", &sanitized);
        }
    });
    (handle, accum)
}

/// `amverge scout <args> --json` from the AI env, plus its args for the log
pub(super) fn scout_command(app: &AppHandle, args: &[&str]) -> Result<(std::process::Command, String), String> {
    let mut cmd = amverge_ai_command(app)?;
    cmd.arg("scout").args(args).arg("--json").stderr(Stdio::piped());
    let argv: Vec<&str> = std::iter::once("scout").chain(args.iter().copied()).chain(["--json"]).collect();
    Ok((cmd, argv.join(",")))
}

pub(super) fn scout_spawn_log(verb: &str, argv: &str) {
    console_log(
        "SCOUT|spawn",
        &format!(
            "verb={verb} mode={} exe={} ai=true args=[{argv}]",
            if cfg!(debug_assertions) { "dev" } else { "prod" },
            amverge_exe_name()
        ),
    );
}

/// spawns a scout command with piped stdout, bound to the app's lifetime
pub(super) fn spawn_scout(
    app: &AppHandle,
    verb: &str,
    args: &[&str],
) -> Result<(tokio::process::Child, u32), String> {
    let (cmd, argv) = scout_command(app, args)?;
    scout_spawn_log(verb, &argv);
    let child = tokio::process::Command::from(cmd)
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run the AMVerge CLI: {e}"))?;
    let pid = child.id().unwrap_or_default();
    bind_to_app_lifetime(pid);
    Ok((child, pid))
}

/// runs a scout command that prints a single json document and parses it
pub(super) async fn scout_json<T: for<'de> Deserialize<'de>>(app: &AppHandle, args: &[&str]) -> Result<T, String> {
    let verb = args.first().copied().unwrap_or("scout");
    let (mut child, _) = spawn_scout(app, verb, args)?;
    let stderr = child.stderr.take().ok_or("Scene Scout produced no stderr stream.")?;
    let (stderr_task, stderr_accum) = forward_stderr(app, stderr);

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("Failed to run the AMVerge CLI: {e}"))?;
    let _ = stderr_task.await;

    // a dependency warning can land on stdout ahead of the document, so take the last line
    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or_default();

    if line.trim().is_empty() {
        // the ui gets the cli's own last error line, never the [diag] chatter above it
        let last = stderr_accum
            .lock()
            .ok()
            .and_then(|s| s.lines().rev().find(|l| !l.trim().is_empty()).map(|l| l.trim().to_string()))
            .unwrap_or_default();
        return Err(if last.is_empty() || last.starts_with("[diag]") {
            format!("Scene Scout {verb} failed. Check the console for details.")
        } else {
            last
        });
    }

    serde_json::from_str::<T>(line).map_err(|e| format!("Could not read Scene Scout output: {e}"))
}

/// what a streaming `--json` run printed: its final `{"done": true}` document and any `{"error"}` line
#[derive(Default)]
pub(super) struct JsonRun {
    pub done: Option<serde_json::Value>,
    pub error: Option<String>,
}

/// reads a streaming run's stdout to the end, handing every other json line to `on_progress`
pub(super) async fn read_json_lines(
    stdout: tokio::process::ChildStdout,
    mut on_progress: impl FnMut(serde_json::Value),
) -> JsonRun {
    let mut run = JsonRun::default();
    let mut reader = BufReader::new(stdout).lines();
    while let Ok(Some(line)) = reader.next_line().await {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line.trim()) else {
            continue;
        };
        if let Some(message) = value.get("error").and_then(|v| v.as_str()) {
            run.error = Some(message.to_string());
        } else if value.get("done").and_then(|v| v.as_bool()) == Some(true) {
            run.done = Some(value);
        } else {
            on_progress(value);
        }
    }
    run
}

/// a json file in the temp folder for a cli argument, deleted when dropped
pub(super) struct TempFile(std::path::PathBuf);

impl TempFile {
    pub fn write_json(prefix: &str, value: &impl Serialize) -> Result<Self, String> {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default();
        let path = std::env::temp_dir().join(format!("{prefix}_{}_{stamp}.json", std::process::id()));
        let body = serde_json::to_vec(value).map_err(|e| format!("Could not write {prefix}: {e}"))?;
        std::fs::write(&path, body).map_err(|e| format!("Could not write {prefix}: {e}"))?;
        Ok(Self(path))
    }

    pub fn path_str(&self) -> &str {
        self.0.to_str().unwrap_or_default()
    }
}

impl Drop for TempFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}
