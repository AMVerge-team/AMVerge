//! Discord Rich Presence over the local IPC pipe, no sidecar; this file holds state and commands, with activity.rs, worker.rs and app_info.rs beside it

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

/// everything the settings screen needs to explain what Discord is doing
#[derive(Debug, Clone, Default, Serialize)]
pub struct DiscordRpcStatus {
    pub enabled: bool,
    pub connected: bool,
    /// display name, for the settings screen
    pub user: Option<String>,
    /// the @handle, for anything the user hands to someone else
    pub user_handle: Option<String>,
    pub error: Option<String>,
    /// the exact activity that would be published, rendered by the preview so they can't drift
    pub activity: Option<Value>,
}

#[derive(Default)]
pub struct DiscordRPCState {
    tx: Mutex<Option<Sender<Cmd>>>,
    status: Arc<Mutex<DiscordRpcStatus>>,
    /// resolved once per run
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

/// runs even while presence is off, tracking what would be published for the preview
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

/// cheap and non-blocking: the worker owns the timing
#[tauri::command]
pub async fn update_discord_rpc(
    app: AppHandle,
    state: State<'_, DiscordRPCState>,
    data: Value,
) -> Result<(), String> {
    let update: PresenceUpdate = serde_json::from_value(data).map_err(|e| e.to_string())?;
    // accepted even with the presence off: the preview keeps up either way
    ensure_worker(&app, &state, Cmd::Set(Box::new(update)))
}

/// the worker stays alive, so flipping the setting back on costs nothing
#[tauri::command]
pub async fn stop_discord_rpc(state: State<'_, DiscordRPCState>) -> Result<(), String> {
    state.send(Cmd::Disable);
    Ok(())
}

/// the same payload arrives unprompted on the `discord_rpc_status` event
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

/// cached for the run: the art does not change under the user's feet
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

/// best-effort and time-boxed: a dead Discord must not hold the window open
pub fn shutdown(app: &AppHandle) {
    let state = app.state::<DiscordRPCState>();
    state.send(Cmd::Shutdown);
    // the worker needs a moment to clear the presence over the pipe
    std::thread::sleep(Duration::from_millis(150));
}
