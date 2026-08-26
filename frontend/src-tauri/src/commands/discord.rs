//! Discord Rich Presence, spoken straight from Rust over the local IPC pipe
//! (see [`crate::utils::discord_ipc`]) — no sidecar to ship, and dev builds
//! behave like packaged ones.
//!
//! This file is the seam with Tauri: managed state and the four commands. The
//! parts worth changing on their own live beside it:
//!
//! * `activity.rs` — what the UI asks for, and the JSON Discord receives
//! * `worker.rs` — the thread that owns the connection, and every timing
//! * `app_info.rs` — the app's name and art, from Discord's public endpoints

use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

mod activity;
mod app_info;
mod worker;

pub use activity::PresenceUpdate;
pub use app_info::DiscordAppInfo;

use worker::Cmd;

/// Everything the settings screen needs to explain what Discord is doing.
#[derive(Debug, Clone, Default, Serialize)]
pub struct DiscordRpcStatus {
    pub enabled: bool,
    pub connected: bool,
    /// Display name, for the settings screen.
    pub user: Option<String>,
    /// The @handle, for anything the user hands to someone else.
    pub user_handle: Option<String>,
    pub error: Option<String>,
    /// The exact activity that would be published right now. The preview renders
    /// this instead of rebuilding it, so the two cannot drift.
    pub activity: Option<Value>,
}

#[derive(Default)]
pub struct DiscordRPCState {
    tx: Mutex<Option<Sender<Cmd>>>,
    status: Arc<Mutex<DiscordRpcStatus>>,
    /// Resolved once per run.
    app_info: Mutex<Option<DiscordAppInfo>>,
}

impl DiscordRPCState {
    fn send(&self, cmd: Cmd) {
        let guard = self.tx.lock().ok();
        if let Some(tx) = guard.as_ref().and_then(|g| g.as_ref()) {
            let _ = tx.send(cmd);
        }
    }
}

/// The worker runs even when the presence is switched off: it still tracks what
/// *would* be published, which is what the settings preview renders.
fn ensure_worker(app: &AppHandle, state: &DiscordRPCState, cmd: Cmd) -> Result<(), String> {
    let mut guard = state.tx.lock().map_err(|e| e.to_string())?;
    if guard.is_none() {
        let (tx, rx) = std::sync::mpsc::channel();
        let status = state.status.clone();
        let app_for_worker = app.clone();
        std::thread::Builder::new()
            .name("discord-rpc".into())
            .spawn(move || worker::run(app_for_worker, rx, status))
            .map_err(|e| e.to_string())?;
        *guard = Some(tx);
    }
    if let Some(tx) = guard.as_ref() {
        let _ = tx.send(cmd);
    }
    Ok(())
}

#[tauri::command]
pub async fn start_discord_rpc(
    app: AppHandle,
    state: State<'_, DiscordRPCState>,
) -> Result<(), String> {
    ensure_worker(&app, &state, Cmd::Enable)
}

/// Cheap and non-blocking: the worker owns the timing.
#[tauri::command]
pub async fn update_discord_rpc(
    app: AppHandle,
    state: State<'_, DiscordRPCState>,
    data: Value,
) -> Result<(), String> {
    let update: PresenceUpdate = serde_json::from_value(data).map_err(|e| e.to_string())?;
    // Accepted even with the presence off: the preview keeps up either way.
    ensure_worker(&app, &state, Cmd::Set(Box::new(update)))
}

/// The worker stays alive, so flipping the setting back on costs nothing.
#[tauri::command]
pub async fn stop_discord_rpc(state: State<'_, DiscordRPCState>) -> Result<(), String> {
    state.send(Cmd::Disable);
    Ok(())
}

/// The same payload arrives unprompted on the `discord_rpc_status` event.
#[tauri::command]
pub async fn discord_rpc_status(
    state: State<'_, DiscordRPCState>,
) -> Result<DiscordRpcStatus, String> {
    state
        .status
        .lock()
        .map(|s| s.clone())
        .map_err(|e| e.to_string())
}

/// Cached for the run: the art does not change under the user's feet.
#[tauri::command]
pub async fn discord_rpc_app_info(
    state: State<'_, DiscordRPCState>,
) -> Result<DiscordAppInfo, String> {
    if let Some(cached) = state.app_info.lock().ok().and_then(|c| c.clone()) {
        return Ok(cached);
    }
    let info = app_info::fetch().await?;
    if let Ok(mut cache) = state.app_info.lock() {
        *cache = Some(info.clone());
    }
    Ok(info)
}

/// Best-effort and time-boxed: a dead Discord must not hold the window open.
pub fn shutdown(app: &AppHandle) {
    let state = app.state::<DiscordRPCState>();
    state.send(Cmd::Shutdown);
    // The worker needs a moment to clear the presence over the pipe.
    std::thread::sleep(Duration::from_millis(150));
}
