//! The activity payload: what the UI asks for, and the JSON Discord receives.

use serde::Deserialize;
use serde_json::{json, Value};

/// Public by design: it identifies the app on a profile. Only a client
/// *secret* would be sensitive.
pub(super) const APP_ID: &str = "1497922104065134823";

pub(super) const DEFAULT_LARGE_IMAGE: &str = "amverge_logo";
pub(super) const DEFAULT_LARGE_TEXT: &str = "AMVerge";

/// Where a presence can send someone. The per-field urls (`details_url`,
/// `assets.large_url`, `assets.small_url`) turn parts of the card into links:
/// the art to the server, the first line to the site. `state_url` exists too,
/// but a second clickable line is clutter.
///
/// The activity-level `url` is an older field, meaningful only for type 1
/// (Streaming), which the RPC path rejects outright. Do not reach for it.
const DISCORD_URL: &str = "https://discord.gg/bmXjTgsAaN";
const WEBSITE_URL: &str = "https://amverge.app/";

/// Discord rejects a line shorter than 2 characters and truncates past 128.
const TEXT_MIN: usize = 2;
const TEXT_MAX: usize = 128;

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
    pub links: bool,
    #[serde(default = "yes")]
    pub show_elapsed: bool,
}

fn yes() -> bool {
    true
}

/// Discord wants 2..=128 characters. Truncation is on a char boundary: a cut
/// multi-byte character would make the whole frame invalid UTF-8.
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

/// Kept in one place so the preview and what friends see cannot diverge.
pub(super) fn build_activity(update: &PresenceUpdate, started_at: u64) -> Value {
    let mut assets = json!({
        "large_image": update.large_image.as_deref().unwrap_or(DEFAULT_LARGE_IMAGE),
        "large_text": update.large_text.as_deref().unwrap_or(DEFAULT_LARGE_TEXT),
    });
    if update.links {
        // Art sends to the server, text sends to the site.
        assets["large_url"] = json!(DISCORD_URL);
        assets["small_url"] = json!(DISCORD_URL);
    }
    // A small icon without its tooltip renders as a bare dot: pair or omit.
    if let (Some(image), Some(text)) = (
        update.small_image.as_deref().filter(|s| !s.is_empty()),
        clamp_text(update.small_text.as_ref()),
    ) {
        assets["small_image"] = json!(image);
        assets["small_text"] = json!(text);
    }

    let mut activity = json!({ "assets": assets });
    // A url without its line would have nothing to hang on, so each is attached
    // only alongside the text it makes clickable.
    if let Some(details) = clamp_text(update.details.as_ref()) {
        activity["details"] = json!(details);
        if update.links {
            activity["details_url"] = json!(WEBSITE_URL);
        }
    }
    if let Some(state) = clamp_text(update.state.as_ref()) {
        // No url here on purpose: the first line already carries the link, and
        // two clickable lines side by side read as clutter.
        activity["state"] = json!(state);
    }
    if update.show_elapsed {
        // Seconds since the epoch, not milliseconds.
        activity["timestamps"] = json!({ "start": started_at });
    }
    activity
}
