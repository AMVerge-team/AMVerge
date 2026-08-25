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

/// Public, unauthenticated endpoints: the app's name and the art assets keyed by
/// the very names the activity references. The settings preview uses them so it
/// shows the picture Discord will actually draw, not a local stand-in.
const API: &str = "https://discord.com/api";
const CDN: &str = "https://cdn.discordapp.com";

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
    /// Resolved once per run — the art does not change under the user's feet.
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

/* =========================
       TAURI COMMANDS
   ========================= */

/// Start the worker on first use and hand back a way to talk to it. The worker
/// runs even when the presence is switched off: it still tracks what *would* be
/// published, which is what the settings preview renders.
fn ensure_worker(app: &AppHandle, state: &DiscordRPCState, cmd: Cmd) -> Result<(), String> {
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
        let _ = tx.send(cmd);
    }
    Ok(())
}

/// Turn the presence on, spawning the worker on first use.
#[tauri::command]
pub async fn start_discord_rpc(app: AppHandle, state: State<'_, DiscordRPCState>) -> Result<(), String> {
    ensure_worker(&app, &state, Cmd::Enable)
}

/// Push the activity the user should be seen doing. Cheap and non-blocking:
/// the worker owns the timing.
#[tauri::command]
pub async fn update_discord_rpc(
    app: AppHandle,
    state: State<'_, DiscordRPCState>,
    data: Value,
) -> Result<(), String> {
    let update: PresenceUpdate = serde_json::from_value(data).map_err(|e| e.to_string())?;
    // Accepted even with the presence off — the preview has to keep up with the
    // app either way, and the worker only connects once enabled.
    ensure_worker(&app, &state, Cmd::Set(Box::new(update)))
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

/// Name and art of the Discord application, as Discord itself reports them.
#[derive(Debug, Clone, Default, Serialize)]
pub struct DiscordAppInfo {
    pub name: String,
    /// Asset key (`amverge_logo`, `edit_icon_new`, …) → CDN url.
    pub assets: std::collections::HashMap<String, String>,
    /// The application icon, used when an activity names no asset.
    pub icon: Option<String>,
}

/// Resolve the app's name and art once per run. Offline is not a failure: the
/// preview falls back to the bundled logo, which is what Discord would show
/// anyway if an asset were missing.
#[tauri::command]
pub async fn discord_rpc_app_info(
    state: State<'_, DiscordRPCState>,
) -> Result<DiscordAppInfo, String> {
    if let Some(cached) = state.app_info.lock().ok().and_then(|c| c.clone()) {
        return Ok(cached);
    }

    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let rpc: Value = http
        .get(format!("{API}/v10/applications/{APP_ID}/rpc"))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let mut info = DiscordAppInfo {
        name: rpc
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(DEFAULT_LARGE_TEXT)
            .to_string(),
        assets: std::collections::HashMap::new(),
        icon: rpc
            .get("icon")
            .and_then(Value::as_str)
            .map(|hash| format!("{CDN}/app-icons/{APP_ID}/{hash}.png?size=160")),
    };

    // Art assets are a separate, also public, listing. Missing them is survivable
    // — the icon covers the large image and the small badge simply drops.
    if let Ok(resp) = http
        .get(format!("{API}/v9/oauth2/applications/{APP_ID}/assets"))
        .send()
        .await
    {
        if let Ok(assets) = resp.json::<Value>().await {
            for asset in assets.as_array().unwrap_or(&Vec::new()) {
                let (Some(name), Some(id)) = (
                    asset.get("name").and_then(Value::as_str),
                    asset.get("id").and_then(Value::as_str),
                ) else {
                    continue;
                };
                info.assets.insert(
                    name.to_string(),
                    format!("{CDN}/app-assets/{APP_ID}/{id}.png?size=160"),
                );
            }
        }
    }

    if let Ok(mut cache) = state.app_info.lock() {
        *cache = Some(info.clone());
    }
    Ok(info)
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
    // `Some(label)` once Discord said READY; `None` while unconnected.
    let mut signed_in: Option<Option<String>> = None;
    let mut last_error: Option<String> = None;
    // The activity moved, so the settings preview needs a fresh snapshot even
    // when the connection itself did not budge.
    let mut dirty = true;

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
                        dirty = true;
                    }
                }
                Cmd::Disable => {
                    enabled = false;
                    if let Some(mut c) = client.take() {
                        c.close();
                    }
                    signed_in = None;
                    last_error = None;
                    last_sent = None;
                    pending = false;
                    dirty = true;
                }
                Cmd::Set(update) => {
                    // Identical payloads arrive on every store change; sending
                    // them would burn the 15 s window for nothing.
                    if desired.as_ref() != Some(&update) {
                        desired = Some(*update);
                        pending = true;
                        dirty = true;
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
            break;
        }

        let now = Instant::now();

        // --- connect ---------------------------------------------------------
        if enabled && client.is_none() && retry_at.is_some_and(|at| now >= at) {
            match DiscordIpc::connect(APP_ID) {
                Ok(c) => {
                    retry_delay = RECONNECT_MIN;
                    retry_at = None;
                    signed_in = Some(c.user.as_ref().and_then(|u| u.label()));
                    last_error = None;
                    client = Some(c);
                    // First presence right away — waiting for the next page
                    // change would leave the profile blank for minutes.
                    pending = true;
                    last_sent = None;
                    dirty = true;
                }
                Err(e) => {
                    retry_at = Some(now + retry_delay);
                    retry_delay = (retry_delay * 2).min(RECONNECT_MAX);
                    signed_in = None;
                    if last_error.as_deref() != Some(e.as_str()) {
                        last_error = Some(e);
                        dirty = true;
                    }
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
                        signed_in = None;
                        last_error = Some(e);
                        last_sent = None;
                        retry_at = Some(Instant::now() + retry_delay);
                        retry_delay = (retry_delay * 2).min(RECONNECT_MAX);
                        dirty = true;
                    }
                }
            }
        }

        if dirty {
            dirty = false;
            let _ = app.emit(
                STATUS_EVENT,
                store_status(
                    &status,
                    DiscordRpcStatus {
                        enabled,
                        connected: signed_in.is_some(),
                        user: signed_in.clone().flatten(),
                        error: last_error.clone(),
                        activity: desired.as_ref().map(|u| build_activity(u, started_at)),
                    },
                ),
            );
        }
    }

    // Leaving the worker means the app is closing: say so once, so a settings
    // screen still mounted does not keep claiming a live connection.
    let _ = app.emit(STATUS_EVENT, store_status(&status, DiscordRpcStatus::default()));
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

/// Keep the snapshot the `discord_rpc_status` command reads in sync with the one
/// going out on the event, so a screen that mounts late sees the same thing.
fn store_status(
    status: &Arc<Mutex<DiscordRpcStatus>>,
    next: DiscordRpcStatus,
) -> DiscordRpcStatus {
    if let Ok(mut current) = status.lock() {
        *current = next.clone();
    }
    next
}
