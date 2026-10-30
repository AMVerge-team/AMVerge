//! keeps the AI env's amverge on the newest patch of the bundled major.minor; a new minor may change the contract and waits for an app update

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::commands::scene_scout::SceneScoutWorkerState;
use crate::state::ActiveInstall;
use crate::utils::logging::console_log;
use crate::utils::sidecar::{ai_env_python, ai_env_ready, bundled_cli_version, uv_cache_dir};

use super::install::run_uv_step;
use super::packs::{NELUX_PIN_GPU_DECODE, PACKS, TORCH_PIN_GPU_DECODE};
use super::status::{installed_distributions, uv_command};

const PYPI_JSON: &str = "https://pypi.org/pypi/amverge/json";

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CliUpdateResult {
    /// "updated", "upToDate", "skipped" or "failed"
    pub status: String,
    pub installed: Option<String>,
    pub latest: Option<String>,
    pub message: Option<String>,
}

impl CliUpdateResult {
    fn new(status: &str, installed: Option<String>, latest: Option<String>, message: Option<String>) -> Self {
        Self { status: status.to_string(), installed, latest, message }
    }
}

/// `x.y.z` only; pre-releases and anything unusual are never auto-installed
fn parse_version(version: &str) -> Option<(u64, u64, u64)> {
    let mut parts = version.trim().split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((major, minor, patch))
}

/// the range new pack installs accept: the bundled release up to, not including, the next minor
pub(crate) fn compatible_spec(bundled: &str) -> String {
    match parse_version(bundled) {
        Some((major, minor, _)) => format!(">={bundled},<{major}.{}", minor + 1),
        None => format!("=={bundled}"),
    }
}

/// newest non-yanked release in `series` (major, minor) from pypi's `releases` map
fn newest_in_series(releases: &serde_json::Map<String, serde_json::Value>, series: (u64, u64)) -> Option<String> {
    releases
        .iter()
        .filter_map(|(version, files)| {
            let parsed = parse_version(version)?;
            if (parsed.0, parsed.1) != series {
                return None;
            }
            // a release with no files, or only yanked ones, cannot be installed
            let usable = files.as_array().is_some_and(|list| {
                list.iter().any(|f| !f.get("yanked").and_then(|y| y.as_bool()).unwrap_or(false))
            });
            usable.then(|| (parsed, version.clone()))
        })
        .max_by_key(|(parsed, _)| *parsed)
        .map(|(_, version)| version)
}

async fn fetch_releases() -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("http client: {e}"))?;
    let body: serde_json::Value = client
        .get(PYPI_JSON)
        .send()
        .await
        .map_err(|e| format!("pypi request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("pypi request failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("pypi response unreadable: {e}"))?;
    body.get("releases")
        .and_then(|r| r.as_object())
        .cloned()
        .ok_or_else(|| "pypi response has no releases".to_string())
}

/// checks pypi and, when a newer compatible patch exists, upgrades the AI env's cli in place
#[tauri::command]
pub async fn update_ai_cli(
    app: AppHandle,
    install_state: State<'_, ActiveInstall>,
    worker_state: State<'_, SceneScoutWorkerState>,
) -> Result<CliUpdateResult, String> {
    if cfg!(debug_assertions) {
        return Ok(CliUpdateResult::new("skipped", None, None, Some("dev builds run the CLI checkout".into())));
    }
    if !ai_env_ready(&app) {
        return Ok(CliUpdateResult::new("skipped", None, None, Some("no AI environment".into())));
    }
    let Some(bundled) = bundled_cli_version(&app) else {
        return Ok(CliUpdateResult::new("skipped", None, None, Some("bundled CLI version unknown".into())));
    };
    let Some((major, minor, _)) = parse_version(&bundled) else {
        return Ok(CliUpdateResult::new("skipped", None, None, Some(format!("unrecognised bundled version {bundled}"))));
    };

    let python = ai_env_python(&app)?;
    let app_for_read = app.clone();
    let python_for_read = python.clone();
    let installed_dists = tokio::task::spawn_blocking(move || installed_distributions(&app_for_read, &python_for_read))
        .await
        .map_err(|e| format!("status task panicked: {e}"))??;
    let installed = installed_dists.get("amverge").cloned();

    let releases = match fetch_releases().await {
        Ok(r) => r,
        // offline or pypi down: nothing to do, try again next launch
        Err(e) => return Ok(CliUpdateResult::new("skipped", installed, None, Some(e))),
    };
    let Some(latest) = newest_in_series(&releases, (major, minor)) else {
        return Ok(CliUpdateResult::new("upToDate", installed, None, Some(format!("no {major}.{minor}.x release on PyPI"))));
    };

    let installed_parsed = installed.as_deref().and_then(parse_version);
    if installed_parsed.is_some_and(|v| Some(v) >= parse_version(&latest)) {
        return Ok(CliUpdateResult::new("upToDate", installed, Some(latest), None));
    }

    // shares the pack install slot, so it never fights an install over the same venv
    let state = install_state.inner().clone();
    if state.begin().is_err() {
        return Ok(CliUpdateResult::new("skipped", installed, Some(latest), Some("a dependency install is running".into())));
    }

    // windows cannot replace amverge.exe while the scout daemon runs from it; it respawns on the next search
    {
        let mut guard = worker_state.inner.lock().await;
        if let Some(mut session) = guard.take() {
            console_log("DEPS|cli-update", "stopping the scene scout daemon for the update");
            session.shutdown().await;
        }
    }

    console_log(
        "DEPS|cli-update",
        &format!("updating amverge {} -> {latest}", installed.as_deref().unwrap_or("none")),
    );

    // keep every pack (and gpu decode) already in the env in the same resolution
    let mut extras: Vec<&str> = PACKS
        .iter()
        .filter(|p| p.requires.iter().all(|dist| installed_dists.contains_key(&dist.to_lowercase())))
        .map(|p| p.extra)
        .collect();
    let has_nelux = installed_dists.contains_key("nelux");
    if has_nelux {
        extras.push("nelux");
    }
    let spec = if extras.is_empty() {
        format!("amverge=={latest}")
    } else {
        format!("amverge[{}]=={latest}", extras.join(","))
    };

    let app_for_task = app.clone();
    let state_for_task = state.clone();
    let python_for_task = python.clone();
    let outcome = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let mut cmd = uv_command(&app_for_task)?;
        cmd.arg("pip").arg("install").arg("--python").arg(&python_for_task).arg(&spec);
        // also repairs an env that took a Nelux built for a newer torch
        if has_nelux {
            cmd.arg(TORCH_PIN_GPU_DECODE).arg(NELUX_PIN_GPU_DECODE);
        }
        let result = run_uv_step(&app_for_task, &state_for_task, "cli", cmd, "CLI update");
        // same as pack installs: the wheel cache is a second copy of every download
        if let Ok(cache) = uv_cache_dir(&app_for_task) {
            let _ = std::fs::remove_dir_all(cache);
        }
        result
    })
    .await
    .map_err(|e| format!("update task panicked: {e}"));
    state.finish();

    if let Err(e) = outcome.and_then(|r| r) {
        console_log("DEPS|cli-update", &format!("failed, keeping {}: {e}", installed.as_deref().unwrap_or("none")));
        return Ok(CliUpdateResult::new("failed", installed, Some(latest), Some(e)));
    }

    let after = installed_distributions(&app, &python)
        .ok()
        .and_then(|d| d.get("amverge").cloned());
    console_log("DEPS|cli-update", &format!("now on amverge {}", after.as_deref().unwrap_or("unknown")));
    Ok(CliUpdateResult::new("updated", installed, after.or(Some(latest)), None))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn releases(json: &str) -> serde_json::Map<String, serde_json::Value> {
        serde_json::from_str::<serde_json::Value>(json).unwrap().as_object().unwrap().clone()
    }

    #[test]
    fn picks_newest_patch_in_series_only() {
        let r = releases(r#"{
            "0.8.0": [{"yanked": false}], "0.8.2": [{"yanked": false}], "0.8.10": [{"yanked": false}],
            "0.9.0": [{"yanked": false}], "0.8.11rc1": [{"yanked": false}]
        }"#);
        assert_eq!(newest_in_series(&r, (0, 8)).as_deref(), Some("0.8.10"));
    }

    #[test]
    fn skips_yanked_and_empty_releases() {
        let r = releases(r#"{"0.8.1": [{"yanked": false}], "0.8.2": [{"yanked": true}], "0.8.3": []}"#);
        assert_eq!(newest_in_series(&r, (0, 8)).as_deref(), Some("0.8.1"));
    }

    #[test]
    fn compatible_spec_stops_before_next_minor() {
        assert_eq!(compatible_spec("0.8.0"), ">=0.8.0,<0.9");
        assert_eq!(compatible_spec("1.2.3"), ">=1.2.3,<1.3");
        assert_eq!(compatible_spec("0.8.0rc1"), "==0.8.0rc1");
    }
}
