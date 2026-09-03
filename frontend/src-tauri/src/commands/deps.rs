//! optional AI dependency management.
//!
//! the shipped sidecar carries everything that runs on ffmpeg/opencv. the heavy
//! AI packages (torch and friends) are installed on demand into an app-managed
//! venv at `<app data>/pyenv`, provisioned by the bundled `uv` binary. each
//! feature maps to a "pack"; installing a pack installs torch once plus that
//! pack's extra, pinned to the CLI version baked into the sidecar

use std::process::Command;

use tauri::{AppHandle, State};

use crate::state::ActiveInstall;
use crate::utils::logging::console_log;
use crate::utils::process::apply_no_window;
use crate::utils::sidecar::{ai_env_dir, ai_env_python, ai_env_ready, uv_cache_dir, uv_python_dir};

mod install;
mod packs;
mod progress;
mod status;

pub(crate) use install::*;
pub(crate) use packs::*;
pub(crate) use status::*;

/// what is installed right now: drives the lock badges and the Dependencies tab
#[tauri::command]
pub async fn ai_env_status(app: AppHandle) -> Result<AiEnvStatus, String> {
    tokio::task::spawn_blocking(move || compute_status(&app))
        .await
        .map_err(|e| format!("status task panicked: {e}"))?
}

/// install one pack (and torch, the first time). `gpu` picks the CUDA wheel
#[tauri::command]
pub async fn install_ai_pack(
    app: AppHandle,
    install_state: State<'_, ActiveInstall>,
    pack: String,
    gpu: bool,
) -> Result<AiEnvStatus, String> {
    let target = pack_by_id(&pack)?;

    if cfg!(debug_assertions) {
        return Err(
            "Dev builds run against the AMVerge-CLI checkout's venv - install the extras there \
             with `pip install -e .[all]` instead."
                .to_string(),
        );
    }

    let state = install_state.inner().clone();
    state.begin()?;

    let app_for_task = app.clone();
    let state_for_task = state.clone();
    let outcome = tokio::task::spawn_blocking(move || {
        let result = install_ai_pack_inner(&app_for_task, &state_for_task, target, gpu);
        state_for_task.finish();
        result
    })
    .await
    .map_err(|e| {
        state.finish();
        format!("install task panicked: {e}")
    })?;

    outcome?;
    ai_env_status(app).await
}

/// stop an in-flight install. the venv is left in place; a half-installed pack
/// simply reports as not installed and can be retried
#[tauri::command]
pub async fn abort_ai_install(install_state: State<'_, ActiveInstall>) -> Result<(), String> {
    install_state.cancel();

    let pid = install_state.pid.lock().map_err(|e| e.to_string())?.take();
    let Some(pid) = pid else {
        console_log("DEPS|abort", "no active install");
        return Ok(());
    };

    console_log("DEPS|abort", &format!("killing uv pid={pid}"));

    #[cfg(windows)]
    {
        let mut cmd = Command::new("taskkill");
        apply_no_window(&mut cmd);
        let _ = cmd.args(["/F", "/T", "/PID", &pid.to_string()]).output();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill")
            .args(["-9", &format!("-{pid}")])
            .output();
    }

    Ok(())
}

/// remove one pack's distinguishing packages. torch stays because other packs
/// share it; use `remove_ai_env` to reclaim that space
#[tauri::command]
pub async fn uninstall_ai_pack(app: AppHandle, pack: String) -> Result<AiEnvStatus, String> {
    let target = pack_by_id(&pack)?;
    if !ai_env_ready(&app) {
        // returning the status here looked like success and left the button
        // unchanged, with no clue that nothing had happened
        return Err("There is no AI environment to remove from.".to_string());
    }

    let app_for_task = app.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let python = ai_env_python(&app_for_task)?;
        let mut cmd = uv_command(&app_for_task)?;
        cmd.arg("pip").arg("uninstall").arg("--python").arg(&python);
        for dist in target.requires.iter().filter(|d| **d != "torch") {
            cmd.arg(dist);
        }
        let output = cmd
            .output()
            .map_err(|e| format!("Failed to run uv pip uninstall: {e}"))?;
        if !output.status.success() {
            return Err(format!(
                "Uninstall failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        console_log("DEPS|uninstall", &format!("pack={}", target.id));
        Ok(())
    })
    .await
    .map_err(|e| format!("uninstall task panicked: {e}"))??;

    ai_env_status(app).await
}

/// delete the whole AI environment (venv + managed interpreters + wheel cache)
#[tauri::command]
pub async fn remove_ai_env(app: AppHandle) -> Result<AiEnvStatus, String> {
    let app_for_task = app.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        for dir in [
            ai_env_dir(&app_for_task)?,
            uv_python_dir(&app_for_task)?,
            uv_cache_dir(&app_for_task)?,
        ] {
            if dir.exists() {
                std::fs::remove_dir_all(&dir)
                    .map_err(|e| format!("Failed to remove {}: {e}", dir.display()))?;
            }
        }
        console_log("DEPS|remove", "ai env removed");
        Ok(())
    })
    .await
    .map_err(|e| format!("remove task panicked: {e}"))??;

    ai_env_status(app).await
}
