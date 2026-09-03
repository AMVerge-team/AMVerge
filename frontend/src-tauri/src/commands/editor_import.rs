use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, State};
#[cfg(target_os = "windows")]
use tauri::Emitter;

#[cfg(target_os = "windows")]
use crate::payloads::ProgressPayload;
use crate::state::EditorImportAbortState;
#[cfg(target_os = "windows")]
use crate::utils::logging::console_log;
use crate::utils::process::apply_no_window;

mod after_effects;
mod capcut;
pub mod davinci_resolve;
mod premier_pro;

#[cfg(target_os = "windows")]
mod errors;
#[cfg(target_os = "windows")]
mod executables;
mod process;
mod scripts;
#[cfg(target_os = "windows")]
mod staging;

#[cfg(target_os = "windows")]
pub(crate) use errors::*;
#[cfg(target_os = "windows")]
pub(crate) use executables::*;
pub(crate) use process::*;
pub(crate) use scripts::*;
#[cfg(target_os = "windows")]
pub(crate) use staging::*;

#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EditorTarget {
    #[serde(rename = "premier_pro", alias = "premiere_pro")]
    PremierPro,
    AfterEffects,
    DavinciResolve,
    #[serde(rename = "capcut")]
    CapCut,
}

fn normalize_editor_media_paths(media_paths: Vec<String>) -> Result<Vec<String>, String> {
    if media_paths.is_empty() {
        return Err("No exported media was provided for editor import.".to_string());
    }

    let normalized: Vec<String> = media_paths
        .into_iter()
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect();

    if normalized.is_empty() {
        return Err("No valid exported media paths were provided.".to_string());
    }

    let missing: Vec<String> = normalized
        .iter()
        .filter(|p| !Path::new(p).exists())
        .take(5)
        .cloned()
        .collect();
    if !missing.is_empty() {
        return Err(format!(
            "Some exported files are missing on disk: {}",
            missing.join(", ")
        ));
    }

    Ok(normalized)
}
#[tauri::command]
pub async fn import_media_to_editor(
    app: AppHandle,
    abort_state: State<'_, EditorImportAbortState>,
    editor_target: EditorTarget,
    media_paths: Vec<String>,
) -> Result<String, String> {
    abort_state.abort_requested.store(false, Ordering::SeqCst);
    let normalized = normalize_editor_media_paths(media_paths)?;

    match editor_target {
        EditorTarget::AfterEffects => {
            after_effects::import_into_after_effects(
                &app,
                &normalized,
                &abort_state.abort_requested,
            )
            .await
        }
        EditorTarget::PremierPro => {
            premier_pro::import_into_premier_pro(&app, &normalized, &abort_state.abort_requested)
                .await
        }
        EditorTarget::DavinciResolve => {
            davinci_resolve::import_into_davinci_resolve(
                &app,
                &normalized,
                &abort_state.abort_requested,
            )
            .await
        }
        EditorTarget::CapCut => {
            capcut::import_into_capcut(&app, &normalized, &abort_state.abort_requested).await
        }
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn abort_editor_import(
    abort_state: State<'_, EditorImportAbortState>,
) -> Result<String, String> {
    abort_state.abort_requested.store(true, Ordering::SeqCst);
    Ok("Auto-import cancellation requested.".to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn abort_editor_import(
    _abort_state: State<'_, EditorImportAbortState>,
) -> Result<String, String> {
    Ok("Auto-import cancellation requested.".to_string())
}

#[cfg(target_os = "windows")]
async fn sleep_with_cancel(abort_requested: &AtomicBool, duration: Duration) -> Result<(), String> {
    let mut slept = Duration::ZERO;
    let tick = Duration::from_millis(100);
    while slept < duration {
        if is_import_cancel_requested(abort_requested) {
            return Err(import_canceled_error());
        }
        let wait = (duration - slept).min(tick);
        tokio::time::sleep(wait).await;
        slept += wait;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
async fn run_windows_import_with_retries(
    app: Option<&AppHandle>,
    abort_requested: &AtomicBool,
    log_scope: &str,
    editor_name: &str,
    max_attempts: u32,
    launched_this_call: bool,
    process_name: Option<&str>,
    closed_early_error: &str,
    timeout_error: &str,
    mut run_once: impl FnMut() -> Result<String, String>,
) -> Result<String, String> {
    let mut last_err: Option<String> = None;

    for attempt in 0..max_attempts {
        if is_import_cancel_requested(abort_requested) {
            return Err(import_canceled_error());
        }

        emit_import_progress(
            app,
            99,
            &format!(
                "Waiting for {editor_name} to become ready (attempt {}/{max_attempts})",
                attempt + 1
            ),
        );

        if attempt > 0 {
            let delay_secs = if launched_this_call && attempt < 4 {
                3
            } else {
                2
            };
            sleep_with_cancel(abort_requested, Duration::from_secs(delay_secs)).await?;
        }

        if launched_this_call {
            if let Some(image_name) = process_name {
                if !is_windows_process_running(image_name) {
                    return Err(closed_early_error.to_string());
                }
            }
        }

        match run_once() {
            Ok(msg) => {
                emit_import_progress(app, 100, &msg);
                return Ok(msg);
            }
            Err(err) => {
                if is_import_cancel_requested(abort_requested) {
                    return Err(import_canceled_error());
                }
                let summarized = summarize_windows_import_error(&err);
                if max_attempts > 1 {
                    console_log(
                        log_scope,
                        &format!("attempt {}/{}: {}", attempt + 1, max_attempts, summarized),
                    );
                }
                if !should_retry_windows_import_error(&err, attempt, launched_this_call) {
                    return Err(summarized);
                }
                emit_import_progress(
                    app,
                    99,
                    &format!(
                        "{} (attempt {}/{max_attempts})",
                        import_hint_for_error(editor_name, &err),
                        attempt + 1
                    ),
                );
                last_err = Some(summarized);
            }
        }
    }

    Err(last_err.unwrap_or_else(|| timeout_error.to_string()))
}

#[cfg(target_os = "windows")]
fn emit_import_progress(app: Option<&AppHandle>, percent: u8, message: &str) {
    let Some(app) = app else {
        return;
    };

    let clean = message.replace('\n', " ").replace('\r', " ");
    let _ = app.emit(
        "scene_progress",
        ProgressPayload {
            percent: percent.min(100),
            message: clean,
        },
    );
}
