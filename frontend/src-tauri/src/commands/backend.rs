//! shared configuration for calls to the AMVerge backend.
//!
//! the webview's CSP allows `connect-src ipc: http://ipc.localhost` only, so
//! nothing in JS can reach the API directly. every request goes out from here

use std::time::Duration;

const BUILD_API_BASE_URL: Option<&str> = option_env!("AMVERGE_API_BASE_URL");

/// runtime environment first, build-time value as the fallback. matches the
/// convention `bug_report.rs` established for endpoint configuration
pub fn read_config_var(runtime_key: &str, build_fallback: Option<&str>) -> Option<String> {
    std::env::var(runtime_key)
        .ok()
        .and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
        .or_else(|| {
            build_fallback.and_then(|value| {
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            })
        })
}

/// base URL of the AMVerge API, without a trailing slash
pub fn api_base_url() -> Result<String, String> {
    let base = read_config_var("AMVERGE_API_BASE_URL", BUILD_API_BASE_URL)
        .ok_or_else(|| "AMVerge API endpoint is not configured on this build.".to_string())?;

    Ok(base.trim_end_matches('/').to_string())
}

pub fn api_url(path: &str) -> Result<String, String> {
    let base = api_base_url()?;
    Ok(format!("{base}{path}"))
}

pub fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("Failed to initialize HTTP client: {e}"))
}
