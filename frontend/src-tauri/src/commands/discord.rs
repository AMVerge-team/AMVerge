//! Discord Rich Presence.
//!
//! The presence used to be a Python helper spawned as a child process; it was
//! left as a no-op through the backend → CLI migration. It now talks to Discord
//! straight from Rust over the local IPC pipe (see [`crate::utils::discord_ipc`]),
//! so there is no sidecar to ship, nothing to install, and dev builds behave the
//! same as packaged ones.
//!
//! A single worker thread owns the connection. The UI only ever pushes intent
//! into a channel, so an unreachable Discord — the common case, it simply is not
//! running — can never block an `invoke`. The worker:
//!
//! * reconnects with exponential backoff while the presence is enabled, so
//!   starting Discord after AMVerge just works;
//! * honours Discord's cap of one `SET_ACTIVITY` per 15 s. Over the cap Discord
//!   drops updates **silently**, so the worker keeps the latest intent and
//!   replays it when the window opens — flipping through five pages shows the
//!   fifth, not the first;
//! * re-sends the current activity every minute, which is how a pipe that died
//!   with the Discord client gets noticed while the user is idle;
//! * clears the presence on the way out, so no ghost "playing AMVerge" survives.

use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::utils::discord_ipc::DiscordIpc;

/// AMVerge's Discord application id. Public by design — it is what identifies
/// the app on a profile; only a client *secret* would be sensitive.
const APP_ID: &str = "1497922104065134823";

const DEFAULT_LARGE_IMAGE: &str = "amverge_logo";
const DEFAULT_LARGE_TEXT: &str = "AMVerge";
const DISCORD_URL: &str = "https://discord.gg/asJkqwqb";
const WEBSITE_URL: &str = "https://amverge.app/";

/// Discord's own cap: one activity per 15 s, extra ones are dropped in silence.
const THROTTLE: Duration = Duration::from_secs(15);
/// Re-publish the current activity this often; a dead pipe surfaces here.
const HEARTBEAT: Duration = Duration::from_secs(60);
const RECONNECT_MIN: Duration = Duration::from_secs(2);
const RECONNECT_MAX: Duration = Duration::from_secs(60);
/// How often the worker wakes up when no command is waiting.
const TICK: Duration = Duration::from_millis(500);

/// Discord rejects a line shorter than 2 characters and truncates past 128.
const TEXT_MIN: usize = 2;
const TEXT_MAX: usize = 128;

const STATUS_EVENT: &str = "discord_rpc_status";

/// What the UI asks to be shown. Unknown fields are ignored, so the payload can
/// grow on the frontend without breaking older builds.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
pub struct PresenceUpdate {
    #[serde(default)]
    pub details: Option<String>,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub large_image: Option<String>,
    #[serde(default)]
    pub large_text: Option<String>,
    #[serde(default)]
    pub small_image: Option<String>,
    #[serde(default)]
    pub small_text: Option<String>,
    #[serde(default = "yes")]
    pub buttons: bool,
    #[serde(default = "yes")]
    pub show_elapsed: bool,
}

fn yes() -> bool {
    true
}

/// Everything the settings screen needs to explain what Discord is doing.
#[derive(Debug, Clone, Default, Serialize)]
pub struct DiscordRpcStatus {
    /// The presence is switched on (independent of whether Discord answered).
    pub enabled: bool,
    pub connected: bool,
    /// Display name of the signed-in Discord account, once connected.
    pub user: Option<String>,
    /// Why the last attempt failed — `None` while things are fine.
    pub error: Option<String>,
    /// The exact activity that would be published right now. The settings
    /// preview renders this instead of rebuilding it, so the two cannot drift.
    pub activity: Option<Value>,
}

enum Cmd {
    Enable,
    Disable,
    Set(Box<PresenceUpdate>),
    Shutdown,
}

/// Handle onto the worker thread. Started lazily by [`start_discord_rpc`].
#[derive(Default)]
pub struct DiscordRPCState {
    tx: Mutex<Option<Sender<Cmd>>>,
    status: Arc<Mutex<DiscordRpcStatus>>,
}

impl DiscordRPCState {
    fn send(&self, cmd: Cmd) {
        let guard = self.tx.lock().ok();
        if let Some(tx) = guard.as_ref().and_then(|g| g.as_ref()) {
            let _ = tx.send(cmd);
        }
    }
}

/* =========================
       TAURI COMMANDS
   ========================= */

/// Turn the presence on, spawning the worker on first use.
#[tauri::command]
pub async fn start_discord_rpc(app: AppHandle, state: State<'_, DiscordRPCState>) -> Result<(), String> {
    let mut guard = state.tx.lock().map_err(|e| e.to_string())?;
    if guard.is_none() {
        let (tx, rx) = std::sync::mpsc::channel();
        let status = state.status.clone();
        let app_for_worker = app.clone();
        std::thread::Builder::new()
            .name("discord-rpc".into())
            .spawn(move || worker(app_for_worker, rx, status))
            .map_err(|e| e.to_string())?;
        *guard = Some(tx);
    }
    if let Some(tx) = guard.as_ref() {
        let _ = tx.send(Cmd::Enable);
    }
    Ok(())
}

/// Push the activity the user should be seen doing. Cheap and non-blocking:
/// the worker owns the timing.
#[tauri::command]
pub async fn update_discord_rpc(
    state: State<'_, DiscordRPCState>,
    data: Value,
) -> Result<(), String> {
    let update: PresenceUpdate = serde_json::from_value(data).map_err(|e| e.to_string())?;
    state.send(Cmd::Set(Box::new(update)));
    Ok(())
}

/// Turn the presence off and drop it from the profile. The worker stays alive so
/// flipping the setting back on costs nothing.
#[tauri::command]
pub async fn stop_discord_rpc(state: State<'_, DiscordRPCState>) -> Result<(), String> {
    state.send(Cmd::Disable);
    Ok(())
}

/// Current connection state, for the settings screen. The same payload arrives
/// unprompted on the `discord_rpc_status` event whenever it changes.
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

/// Clear the presence during app shutdown. Best-effort and time-boxed: a dead
/// Discord must not hold the window open.
pub fn shutdown(app: &AppHandle) {
    let state = app.state::<DiscordRPCState>();
    state.send(Cmd::Shutdown);
    // The worker needs a moment to clear the presence over the pipe.
    std::thread::sleep(Duration::from_millis(150));
}

/* =========================
          WORKER
   ========================= */

fn worker(app: AppHandle, rx: Receiver<Cmd>, status: Arc<Mutex<DiscordRpcStatus>>) {
    // "Elapsed" counts from app start, like a game session — not from the last
    // page change, which would reset the timer every few seconds.
    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let mut enabled = false;
    let mut client: Option<DiscordIpc> = None;
    let mut desired: Option<PresenceUpdate> = None;
    let mut pending = false;
    let mut last_sent: Option<Instant> = None;
    let mut retry_at: Option<Instant> = None;
    let mut retry_delay = RECONNECT_MIN;

    loop {
        // Block until something happens, then drain: a burst of updates should
        // collapse into the last one rather than costing a tick each.
        let first = match rx.recv_timeout(TICK) {
            Ok(cmd) => Some(cmd),
            Err(RecvTimeoutError::Timeout) => None,
            // The state was dropped — the app is gone.
            Err(RecvTimeoutError::Disconnected) => break,
        };
        let mut stopping = false;
        for cmd in first.into_iter().chain(rx.try_iter()) {
            match cmd {
                Cmd::Enable => {
                    if !enabled {
                        enabled = true;
                        retry_at = Some(Instant::now());
                        retry_delay = RECONNECT_MIN;
                    }
                }
                Cmd::Disable => {
                    enabled = false;
                    if let Some(mut c) = client.take() {
                        c.close();
                    }
                    last_sent = None;
                    pending = false;
                    // The settings screen reads its status from here; leaving it
                    // on "connected" after the switch went off would be a lie.
                    publish(
                        &app,
                        &status,
                        snapshot(false, None, None, &desired, started_at),
                    );
                }
                Cmd::Set(update) => {
                    // Identical payloads arrive on every store change; sending
                    // them would burn the 15 s window for nothing.
                    if desired.as_ref() != Some(&update) {
                        desired = Some(*update);
                        pending = true;
                    }
                }
                Cmd::Shutdown => {
                    stopping = true;
                }
            }
        }
        if stopping {
            if let Some(mut c) = client.take() {
                c.close();
            }
            publish(&app, &status, snapshot(false, None, None, &desired, started_at));
            break;
        }

        let now = Instant::now();

        // --- connect ---------------------------------------------------------
        if enabled && client.is_none() && retry_at.is_some_and(|at| now >= at) {
            match DiscordIpc::connect(APP_ID) {
                Ok(c) => {
                    retry_delay = RECONNECT_MIN;
                    retry_at = None;
                    client = Some(c);
                    // First presence right away — waiting for the next page
                    // change would leave the profile blank for minutes.
                    pending = true;
                    last_sent = None;
                    let user = client.as_ref().and_then(|c| c.user.as_ref()).and_then(|u| u.label());
                    publish(&app, &status, snapshot(true, Some(user), None, &desired, started_at));
                }
                Err(e) => {
                    retry_at = Some(now + retry_delay);
                    retry_delay = (retry_delay * 2).min(RECONNECT_MAX);
                    publish(&app, &status, snapshot(true, None, Some(e), &desired, started_at));
                }
            }
        }

        // --- publish ---------------------------------------------------------
        if let Some(c) = client.as_mut() {
            let due = last_sent.is_none_or(|at| now.duration_since(at) >= THROTTLE);
            let stale = last_sent.is_some_and(|at| now.duration_since(at) >= HEARTBEAT);
            if (pending && due) || stale {
                let activity = desired.as_ref().map(|u| build_activity(u, started_at));
                match c.set_activity(activity) {
                    Ok(()) => {
                        pending = false;
                        last_sent = Some(Instant::now());
                    }
                    Err(e) => {
                        // The pipe is gone (Discord quit, or it hung up). Drop it
                        // and let the backoff bring the presence back.
                        client = None;
                        last_sent = None;
                        retry_at = Some(Instant::now() + retry_delay);
                        retry_delay = (retry_delay * 2).min(RECONNECT_MAX);
                        publish(&app, &status, snapshot(enabled, None, Some(e), &desired, started_at));
                    }
                }
            }
        }
    }
}

/* =========================
         ACTIVITY
   ========================= */

/// A usable activity line, or `None`: Discord wants 2..=128 characters and
/// refuses an empty string. Truncation is on a char boundary — a cut multi-byte
/// character would make the whole frame invalid UTF-8.
fn clamp_text(value: Option<&String>) -> Option<String> {
    let text = value?.trim();
    if text.chars().count() < TEXT_MIN {
        return None;
    }
    if text.chars().count() <= TEXT_MAX {
        return Some(text.to_string());
    }
    Some(text.chars().take(TEXT_MAX).collect())
}

/// Turn the UI's intent into the payload Discord expects. Kept in one place so
/// the settings preview and what friends actually see cannot diverge.
fn build_activity(update: &PresenceUpdate, started_at: u64) -> Value {
    let mut assets = json!({
        "large_image": update.large_image.as_deref().unwrap_or(DEFAULT_LARGE_IMAGE),
        "large_text": update.large_text.as_deref().unwrap_or(DEFAULT_LARGE_TEXT),
    });
    // A small icon without its tooltip renders as a bare dot — pair or omit.
    if let (Some(image), Some(text)) = (
        update.small_image.as_deref().filter(|s| !s.is_empty()),
        clamp_text(update.small_text.as_ref()),
    ) {
        assets["small_image"] = json!(image);
        assets["small_text"] = json!(text);
    }

    let mut activity = json!({ "assets": assets });
    if let Some(details) = clamp_text(update.details.as_ref()) {
        activity["details"] = json!(details);
    }
    if let Some(state) = clamp_text(update.state.as_ref()) {
        activity["state"] = json!(state);
    }
    if update.show_elapsed {
        // Seconds since the epoch, not milliseconds.
        activity["timestamps"] = json!({ "start": started_at });
    }
    if update.buttons {
        activity["buttons"] = json!([
            { "label": "Discord Server", "url": DISCORD_URL },
            { "label": "Website", "url": WEBSITE_URL },
        ]);
    }
    activity
}

fn snapshot(
    enabled: bool,
    user: Option<Option<String>>,
    error: Option<String>,
    desired: &Option<PresenceUpdate>,
    started_at: u64,
) -> DiscordRpcStatus {
    DiscordRpcStatus {
        enabled,
        connected: user.is_some() && error.is_none(),
        user: user.flatten(),
        error,
        activity: desired.as_ref().map(|u| build_activity(u, started_at)),
    }
}

/// Store the status and tell the UI, but only when something actually changed —
/// a failed reconnect fires every couple of seconds and must stay silent.
fn publish(app: &AppHandle, status: &Arc<Mutex<DiscordRpcStatus>>, next: DiscordRpcStatus) {
    if let Ok(mut current) = status.lock() {
        let changed = current.enabled != next.enabled
            || current.connected != next.connected
            || current.user != next.user
            || current.error != next.error;
        *current = next.clone();
        if !changed {
            return;
        }
    }
    let _ = app.emit(STATUS_EVENT, next);
}
