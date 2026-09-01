//! Community events: browsing is public, hosting needs a Discord session.
//!
//! Every call goes out from Rust. The session token is read from the credential
//! store here and attached as a bearer header, so it never crosses into the
//! webview.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::auth::{discard_rejected_session, session_token};
use super::backend::{api_base_url, api_url, http_client};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventsResponse {
    pub ok: bool,
    pub message: Option<String>,
    pub events: Vec<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventMutationResponse {
    pub ok: bool,
    pub message: Option<String>,
    pub event: Option<Value>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventSubmission {
    pub title: String,
    pub description: String,
    pub discord_invite_url: String,
    pub prize_pool: Option<String>,
    /// "contest" or "hour"; the server rejects anything else back to "contest".
    pub event_type: Option<String>,
    /// 1-24, only meaningful for an hour contest. The server validates the range.
    pub duration_hours: Option<u32>,
    pub starts_at: String,
    pub ends_at: String,
    pub thumbnail: Option<EventThumbnailPayload>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventThumbnailPayload {
    pub mime_type: String,
    pub data_base64: String,
}

#[derive(Debug, Deserialize)]
struct ApiEventsBody {
    events: Option<Vec<Value>>,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiEventBody {
    event: Option<Value>,
    message: Option<String>,
}

/// The API returns thumbnail links relative to its own host. `img-src` is
/// unconstrained in the webview, so an absolute URL loads directly — but only
/// once we know which host to point it at, which is config the frontend does
/// not have.
fn absolutize_thumbnails(base: &str, events: &mut [Value]) {
    for event in events.iter_mut() {
        let Some(object) = event.as_object_mut() else {
            continue;
        };

        let relative = match object.get("thumbnailUrl").and_then(|v| v.as_str()) {
            Some(url) if url.starts_with('/') => url.to_string(),
            _ => continue,
        };

        object.insert(
            "thumbnailUrl".to_string(),
            Value::String(format!("{base}{relative}")),
        );
    }
}

fn require_session() -> Result<String, String> {
    session_token().ok_or_else(|| "Sign in with Discord to continue.".to_string())
}

async fn read_events(url: String, token: Option<String>) -> Result<EventsResponse, String> {
    let client = http_client()?;
    let mut request = client.get(url);

    if let Some(token) = token {
        request = request.bearer_auth(token);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Could not reach AMVerge: {e}"))?;

    let status = response.status();
    let parsed = response.json::<ApiEventsBody>().await.ok();

    if !status.is_success() {
        return Ok(EventsResponse {
            ok: false,
            message: Some(
                parsed
                    .and_then(|body| body.message)
                    .unwrap_or_else(|| format!("Events request failed with HTTP {}.", status.as_u16())),
            ),
            events: Vec::new(),
        });
    }

    let mut events = parsed.and_then(|body| body.events).unwrap_or_default();
    absolutize_thumbnails(&api_base_url()?, &mut events);

    Ok(EventsResponse {
        ok: true,
        message: None,
        events,
    })
}

/// `scope` is "active" or "past"; anything else is rejected by the API.
#[tauri::command]
pub async fn fetch_events(scope: Option<String>) -> Result<EventsResponse, String> {
    let scope = match scope.as_deref() {
        Some("past") => "past",
        _ => "active",
    };

    read_events(api_url(&format!("/api/events?scope={scope}"))?, None).await
}

/// The signed-in host's own events, including ones still awaiting review.
#[tauri::command]
pub async fn fetch_my_events() -> Result<EventsResponse, String> {
    let token = require_session()?;
    read_events(api_url("/api/events/mine")?, Some(token)).await
}

async fn send_submission(
    url: String,
    method: reqwest::Method,
    submission: EventSubmission,
) -> Result<EventMutationResponse, String> {
    let token = require_session()?;
    let client = http_client()?;

    let response = client
        .request(method, url)
        .bearer_auth(token)
        .json(&submission)
        .send()
        .await
        .map_err(|e| format!("Could not reach AMVerge: {e}"))?;

    let status = response.status();
    let parsed = response.json::<ApiEventBody>().await.ok();

    if !status.is_success() {
        // A refused token would fail every subsequent request too, so drop it
        // and let the user sign in again rather than leaving them stuck.
        if status == reqwest::StatusCode::UNAUTHORIZED {
            discard_rejected_session();
            return Ok(EventMutationResponse {
                ok: false,
                message: Some("Your sign-in has expired. Sign in with Discord again.".to_string()),
                event: None,
            });
        }

        return Ok(EventMutationResponse {
            ok: false,
            message: Some(
                parsed
                    .and_then(|body| body.message)
                    .unwrap_or_else(|| format!("Request failed with HTTP {}.", status.as_u16())),
            ),
            event: None,
        });
    }

    Ok(EventMutationResponse {
        ok: true,
        message: None,
        event: parsed.and_then(|body| body.event),
    })
}

#[tauri::command]
pub async fn submit_event_request(
    submission: EventSubmission,
) -> Result<EventMutationResponse, String> {
    send_submission(api_url("/api/events")?, reqwest::Method::POST, submission).await
}

async fn post_or_delete(url: String, method: reqwest::Method) -> Result<EventMutationResponse, String> {
    let token = require_session()?;
    let client = http_client()?;

    let response = client
        .request(method, url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("Could not reach AMVerge: {e}"))?;

    let status = response.status();
    let parsed = response.json::<ApiEventBody>().await.ok();

    if !status.is_success() {
        // A refused token would fail every subsequent request too, so drop it
        // and let the user sign in again rather than leaving them stuck.
        if status == reqwest::StatusCode::UNAUTHORIZED {
            discard_rejected_session();
            return Ok(EventMutationResponse {
                ok: false,
                message: Some("Your sign-in has expired. Sign in with Discord again.".to_string()),
                event: None,
            });
        }

        return Ok(EventMutationResponse {
            ok: false,
            message: Some(
                parsed
                    .and_then(|body| body.message)
                    .unwrap_or_else(|| format!("Request failed with HTTP {}.", status.as_u16())),
            ),
            event: None,
        });
    }

    Ok(EventMutationResponse {
        ok: true,
        message: None,
        event: None,
    })
}

/// Removes one of the host's own events. The server refuses a live approved one.
#[tauri::command]
pub async fn delete_event_request(event_id: String) -> Result<EventMutationResponse, String> {
    post_or_delete(
        api_url(&format!("/api/events/{event_id}"))?,
        reqwest::Method::DELETE,
    )
    .await
}

/// Marks a denial as seen so its notice is shown once, not on every launch.
#[tauri::command]
pub async fn acknowledge_event_denial(event_id: String) -> Result<EventMutationResponse, String> {
    post_or_delete(
        api_url(&format!("/api/events/{event_id}/denial-seen"))?,
        reqwest::Method::POST,
    )
    .await
}

#[tauri::command]
pub async fn acknowledge_event_approval(event_id: String) -> Result<EventMutationResponse, String> {
    post_or_delete(
        api_url(&format!("/api/events/{event_id}/approval-seen"))?,
        reqwest::Method::POST,
    )
    .await
}

#[tauri::command]
pub async fn update_event_request(
    event_id: String,
    submission: EventSubmission,
) -> Result<EventMutationResponse, String> {
    send_submission(
        api_url(&format!("/api/events/{event_id}"))?,
        reqwest::Method::PATCH,
        submission,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrites_only_relative_thumbnail_urls() {
        let mut events = vec![
            serde_json::json!({ "thumbnailUrl": "/api/events/1/thumbnail" }),
            serde_json::json!({ "thumbnailUrl": Value::Null }),
            serde_json::json!({ "thumbnailUrl": "https://cdn.example/x.png" }),
        ];

        absolutize_thumbnails("https://api.amverge.app", &mut events);

        assert_eq!(
            events[0]["thumbnailUrl"],
            "https://api.amverge.app/api/events/1/thumbnail"
        );
        assert_eq!(events[1]["thumbnailUrl"], Value::Null);
        assert_eq!(events[2]["thumbnailUrl"], "https://cdn.example/x.png");
    }
}
