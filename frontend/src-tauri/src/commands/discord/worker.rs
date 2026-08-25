//! The thread that owns the connection.
//!
//! Everything with a clock in it lives here: the reconnect backoff, Discord's
//! one-activity-per-15s cap, and the poll that notices a client going away. The
//! UI never waits on any of it — it pushes a [`Cmd`] and returns.

use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter};

use crate::utils::discord_ipc::{DiscordIpc, CLOSED};

use super::activity::{build_activity, PresenceUpdate, APP_ID};
use super::DiscordRpcStatus;

/// Discord's own cap: one activity per 15 s, extra ones are dropped in silence.
const THROTTLE: Duration = Duration::from_secs(15);
/// Re-publish this often, so a presence Discord dropped on its own comes back
/// without waiting for the user to navigate. A dead pipe is caught by `poll`.
const HEARTBEAT: Duration = Duration::from_secs(60);
const RECONNECT_MIN: Duration = Duration::from_secs(2);
const RECONNECT_MAX: Duration = Duration::from_secs(60);
const TICK: Duration = Duration::from_millis(500);

pub(super) const STATUS_EVENT: &str = "discord_rpc_status";

pub(super) enum Cmd {
    Enable,
    Disable,
    Set(Box<PresenceUpdate>),
    Shutdown,
}

pub(super) fn run(app: AppHandle, rx: Receiver<Cmd>, status: Arc<Mutex<DiscordRpcStatus>>) {
    // Counted from app start, like a game session: from the last page change it
    // would reset every few seconds.
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
        // Drain after the first: a burst of updates collapses into the last.
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

        // --- notice a pipe that died -----------------------------------------
        if client.as_mut().is_some_and(|c| !c.poll()) {
            client = None;
            signed_in = None;
            last_error = Some(CLOSED.to_string());
            last_sent = None;
            retry_at = Some(now + retry_delay);
            retry_delay = (retry_delay * 2).min(RECONNECT_MAX);
            dirty = true;
        }

        // --- connect ---------------------------------------------------------
        if enabled && client.is_none() && retry_at.is_some_and(|at| now >= at) {
            match DiscordIpc::connect(APP_ID) {
                Ok(c) => {
                    retry_delay = RECONNECT_MIN;
                    retry_at = None;
                    signed_in = Some(c.user.as_ref().and_then(|u| u.label()));
                    last_error = None;
                    client = Some(c);
                    // First presence right away: waiting for the next page change
                    // would leave the profile blank for minutes.
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
                        // Let the backoff bring the presence back.
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

    // The app is closing: say so once, so a settings screen still mounted does
    // not keep claiming a live connection.
    let _ = app.emit(STATUS_EVENT, store_status(&status, DiscordRpcStatus::default()));
}

/// Keeps what the command reads in sync with what goes out on the event.
fn store_status(status: &Arc<Mutex<DiscordRpcStatus>>, next: DiscordRpcStatus) -> DiscordRpcStatus {
    if let Ok(mut current) = status.lock() {
        *current = next.clone();
    }
    next
}
