//! AI model weight management (depth + interpolation).
//!
//! Thin bridge over the CLI's `amverge models --json` command. The CLI is the
//! single source of truth for the registries and the download/delete logic; this
//! module only spawns it, parses its JSON stdout, and surfaces errors.

use std::io::{BufRead, Read};
use std::process::Stdio;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::utils::logging::console_log;
use crate::utils::sidecar::{amverge_ai_command, amverge_exe_name};

/// One model row from the CLI.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub key: String,
    pub name: String,
    pub method: String,
    #[serde(default)]
    pub file: String,
    #[serde(default)]
    pub size_bytes: u64,
    pub downloaded: bool,
    /// Short human name for the variant, e.g. "Small".
    #[serde(default)]
    pub label: String,
    /// One line on the trade-off this variant makes.
    #[serde(default)]
    pub summary: String,
}

/// The `amverge models --json` listing payload (only depth + interpolation).
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelsListPayload {
    #[serde(default)]
    pub depth: Vec<ModelInfo>,
    #[serde(default)]
    pub interpolation: Vec<ModelInfo>,
}

/// Result of a download/delete action.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelsActionResult {
    pub ok: bool,
    pub action: String,
    pub key: String,
    pub message: String,
}

/// The CLI wraps a single action's result in `{"result": {...}}`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelsActionResultEnvelope {
    result: ModelsActionResult,
}

/// Run `amverge models <args>`, streaming stderr to the console, and return the
/// stdout (the JSON payload) together with the collected stderr lines.
fn run_models(app: &AppHandle, args: &[&str]) -> Result<(String, Vec<String>), String> {
    let mut cmd = amverge_ai_command(app)?;
    cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start amverge models: {e}"))?;

    let stdout_arc = Arc::new(Mutex::new(String::new()));
    let stderr_arc = Arc::new(Mutex::new(Vec::new()));

    let stdout_thread = child.stdout.take().map(|out| {
        let arc = stdout_arc.clone();
        std::thread::spawn(move || {
            let mut s = String::new();
            let _ = std::io::BufReader::new(out).read_to_string(&mut s);
            if let Ok(mut g) = arc.lock() {
                *g = s;
            }
        })
    });

    let stderr_thread = child.stderr.take().map(|err| {
        let arc = stderr_arc.clone();
        std::thread::spawn(move || {
            let mut lines = Vec::new();
            for line in std::io::BufReader::new(err).lines().map_while(Result::ok) {
                let t = line.trim().to_string();
                if !t.is_empty() {
                    console_log("MODELS", &t);
                    lines.push(t);
                }
            }
            if let Ok(mut g) = arc.lock() {
                *g = lines;
            }
        })
    });

    let status = child
        .wait()
        .map_err(|e| format!("Failed waiting for amverge models: {e}"))?;
    if let Some(h) = stdout_thread {
        let _ = h.join();
    }
    if let Some(h) = stderr_thread {
        let _ = h.join();
    }

    let stdout = stdout_arc.lock().map(|g| g.clone()).unwrap_or_default();
    let stderr_lines = stderr_arc.lock().map(|g| g.clone()).unwrap_or_default();

    if !status.success() && stdout.trim().is_empty() {
        return Err(format!(
            "amverge {} failed ({}): {}",
            amverge_exe_name(),
            status,
            stderr_lines.join("\n")
        ));
    }

    Ok((stdout, stderr_lines))
}

/// Pulls the JSON payload out of the CLI's stdout.
///
/// The whole of stdout used to be handed to the parser, which meant a single
/// stray line broke it. The download path imports torch and the depth stack,
/// and libraries in that tree print notices on import, so a download could
/// finish on disk while the app reported a parse failure and left the row
/// reading "not downloaded" — the next click then appeared to be the one that
/// worked. Scanning back from the end finds the payload whatever precedes it.
fn parse_models_json<T: serde::de::DeserializeOwned>(stdout: &str) -> Result<T, String> {
    if let Ok(parsed) = serde_json::from_str::<T>(stdout.trim()) {
        return Ok(parsed);
    }

    for line in stdout.lines().rev() {
        let trimmed = line.trim();
        if !trimmed.starts_with('{') {
            continue;
        }
        if let Ok(parsed) = serde_json::from_str::<T>(trimmed) {
            return Ok(parsed);
        }
    }

    Err(format!(
        "amverge models returned no readable JSON. Output was: {}",
        stdout.trim().chars().take(300).collect::<String>()
    ))
}

/// List all depth + interpolation models with their download status and size.
#[tauri::command]
pub async fn list_models(app: AppHandle) -> Result<ModelsListPayload, String> {
    let app_for_task = app.clone();
    tokio::task::spawn_blocking(move || -> Result<ModelsListPayload, String> {
        let (stdout, _stderr) = run_models(&app_for_task, &["models", "--json"])?;
        parse_models_json::<ModelsListPayload>(&stdout)
    })
    .await
    .map_err(|e| format!("list_models task panicked: {e}"))?
}

/// Download one model weight by key.
#[tauri::command]
pub async fn download_model(app: AppHandle, key: String) -> Result<ModelsActionResult, String> {
    let app_for_task = app.clone();
    tokio::task::spawn_blocking(move || -> Result<ModelsActionResult, String> {
        let (stdout, _stderr) =
            run_models(&app_for_task, &["models", "--json", "--download", &key])?;
        let envelope: ModelsActionResultEnvelope = parse_models_json(&stdout)?;
        Ok(envelope.result)
    })
    .await
    .map_err(|e| format!("download_model task panicked: {e}"))?
}

/// Delete one model weight by key.
#[tauri::command]
pub async fn delete_model(app: AppHandle, key: String) -> Result<ModelsActionResult, String> {
    let app_for_task = app.clone();
    tokio::task::spawn_blocking(move || -> Result<ModelsActionResult, String> {
        let (stdout, _stderr) =
            run_models(&app_for_task, &["models", "--json", "--delete", &key])?;
        let envelope: ModelsActionResultEnvelope = parse_models_json(&stdout)?;
        Ok(envelope.result)
    })
    .await
    .map_err(|e| format!("delete_model task panicked: {e}"))?
}

#[cfg(test)]
mod models_json_tests {
    use super::*;

    #[test]
    fn reads_clean_json() {
        let payload: ModelsListPayload =
            parse_models_json(r#"{"depth":[],"interpolation":[]}"#).unwrap();
        assert!(payload.depth.is_empty());
    }

    #[test]
    fn reads_json_after_library_noise() {
        // The shape that broke downloads: the ML stack prints on import, so the
        // payload is the last line rather than the whole of stdout.
        let stdout = concat!(
            "xFormers not available\n",
            "UserWarning: torch was compiled without flash attention\n",
            r#"{"result":{"ok":true,"action":"download","key":"vits","message":"Downloaded: vits"}}"#,
            "\n",
        );

        let envelope: ModelsActionResultEnvelope = parse_models_json(stdout).unwrap();
        assert!(envelope.result.ok);
        assert_eq!(envelope.result.key, "vits");
    }

    #[test]
    fn reads_json_followed_by_trailing_noise() {
        let stdout = concat!(
            r#"{"result":{"ok":true,"action":"delete","key":"vitb","message":"Deleted: vitb"}}"#,
            "\nSome trailing chatter\n",
        );

        let envelope: ModelsActionResultEnvelope = parse_models_json(stdout).unwrap();
        assert_eq!(envelope.result.action, "delete");
    }

    #[test]
    fn error_quotes_the_output_when_nothing_parses() {
        let result = parse_models_json::<ModelsListPayload>("Traceback (most recent call last):");
        let message = result.err().expect("must fail");
        assert!(message.contains("Traceback"), "error should quote the output: {message}");
    }
}
