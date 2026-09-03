//! the application's name and art, as Discord itself reports them.
//!
//! both endpoints are public and unauthenticated. the settings preview uses
//! them so it draws the picture Discord will actually draw, not a local
//! stand-in

use std::collections::HashMap;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

use super::activity::{APP_ID, DEFAULT_LARGE_TEXT};

const API: &str = "https://discord.com/api";
const CDN: &str = "https://cdn.discordapp.com";
const TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Debug, Clone, Default, Serialize)]
pub struct DiscordAppInfo {
    pub name: String,
    /// asset key (`amverge_logo`, `edit_icon_new`, …) → CDN url
    pub assets: HashMap<String, String>,
    /// the application icon, used when an activity names no asset
    pub icon: Option<String>,
}

/// offline is not a failure: the preview falls back to the bundled logo
pub(super) async fn fetch() -> Result<DiscordAppInfo, String> {
    let http = reqwest::Client::builder()
        .timeout(TIMEOUT)
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
        assets: HashMap::new(),
        icon: rpc
            .get("icon")
            .and_then(Value::as_str)
            .map(|hash| format!("{CDN}/app-icons/{APP_ID}/{hash}.png?size=160")),
    };

    // a separate, also public listing. missing it is survivable: the icon covers
    // the large image and the small badge simply drops
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

    Ok(info)
}
