use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use tauri::AppHandle;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BugReportRequest {
    pub bug_type: String,
    pub issue_text: String,
    pub pc_specs: Option<String>,
    pub contact: Option<String>,
    pub video_reference: Option<String>,
    pub screenshot_names: Vec<String>,
    pub console_logs: Option<String>,
    pub console_log_count: Option<usize>,
    pub redaction_applied: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BugReportResponse {
    pub ok: bool,
    pub message: String,
    pub report_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DashboardBugReportPayload {
    bug_type: String,
    issue_text: String,
    pc_specs: Option<String>,
    contact: Option<String>,
    video_reference: Option<String>,
    video_url: Option<String>,
    screenshot_names: Vec<String>,
    console_logs: Option<String>,
    console_log_count: Option<usize>,
    redaction_applied: bool,
    app_version: String,
    app_identifier: String,
    os: String,
    arch: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DashboardSubmitResponse {
    message: Option<String>,
    report_id: Option<String>,
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value.and_then(|v| {
        let t = v.trim();
        if t.is_empty() {
            None
        } else {
            Some(t.to_string())
        }
    })
}

#[tauri::command]
pub async fn submit_bug_report(
    app: AppHandle,
    request: BugReportRequest,
) -> Result<BugReportResponse, String> {
    let endpoint = std::env::var("AMVERGE_BUG_REPORT_API_URL")
        .map_err(|_| "Bug report endpoint is not configured on this build.".to_string())?;

    let api_key = std::env::var("AMVERGE_BUG_REPORT_API_KEY")
        .map_err(|_| "Bug report API key is not configured on this build.".to_string())?;

    let bug_type = request.bug_type.trim().to_string();
    let issue_text = request.issue_text.trim().to_string();
    if issue_text.is_empty() {
        return Ok(BugReportResponse {
            ok: false,
            message: "Issue description is required.".to_string(),
            report_id: None,
        });
    }

    let video_reference = normalize_optional_string(request.video_reference);
    let console_logs = normalize_optional_string(request.console_logs);
    if console_logs.is_none() {
        return Ok(BugReportResponse {
            ok: false,
            message: "Console logs are required for bug reports.".to_string(),
            report_id: None,
        });
    }

    let payload = DashboardBugReportPayload {
        bug_type,
        issue_text,
        pc_specs: normalize_optional_string(request.pc_specs),
        contact: normalize_optional_string(request.contact),
        video_reference: video_reference.clone(),
        video_url: video_reference,
        screenshot_names: request.screenshot_names,
        console_logs,
        console_log_count: request.console_log_count,
        redaction_applied: request.redaction_applied.unwrap_or(false),
        app_version: app.package_info().version.to_string(),
        app_identifier: app.package_info().name.clone(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("Failed to initialize HTTP client: {e}"))?;

    let raw_body = serde_json::to_string(&payload)
        .map_err(|e| format!("Failed to serialize bug report payload: {e}"))?;

    let mut request_builder = client
        .post(endpoint)
        .header("content-type", "application/json")
        .header("x-amverge-api-key", api_key)
        .body(raw_body.clone());

    let key_id = std::env::var("AMVERGE_BUG_REPORT_KEY_ID").ok();
    let signing_secret = std::env::var("AMVERGE_BUG_REPORT_SIGNING_SECRET").ok();

    if let (Some(key_id), Some(signing_secret)) = (key_id, signing_secret) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| format!("System clock is invalid: {e}"))?
            .as_secs();
        let signed_payload = format!("{timestamp}.{raw_body}");

        let mut mac = HmacSha256::new_from_slice(signing_secret.as_bytes())
            .map_err(|e| format!("Invalid signing secret: {e}"))?;
        mac.update(signed_payload.as_bytes());
        let signature = hex::encode(mac.finalize().into_bytes());

        request_builder = request_builder
            .header("x-amverge-key-id", key_id)
            .header("x-amverge-timestamp", timestamp.to_string())
            .header("x-amverge-signature", signature);
    }

    let response = request_builder
        .send()
        .await
        .map_err(|e| format!("Failed to submit bug report: {e}"))?;

    let status = response.status();
    let parsed = response.json::<DashboardSubmitResponse>().await.ok();

    if !status.is_success() {
        let message = parsed
            .as_ref()
            .and_then(|b| b.message.clone())
            .unwrap_or_else(|| format!("Bug report endpoint returned HTTP {}.", status.as_u16()));

        return Ok(BugReportResponse {
            ok: false,
            message,
            report_id: None,
        });
    }

    let message = parsed
        .as_ref()
        .and_then(|b| b.message.clone())
        .unwrap_or_else(|| "Bug report submitted successfully.".to_string());

    let report_id = parsed.and_then(|b| b.report_id);

    Ok(BugReportResponse {
        ok: true,
        message,
        report_id,
    })
}