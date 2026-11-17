//! optional AI dependencies: torch packs installed on demand into an app-managed uv venv, pinned to the sidecar's CLI version

use std::path::PathBuf;
use tauri::{AppHandle, State};

use crate::commands::scene_scout::SceneScoutWorkerState;
use crate::commands::settings::{
    emit_move_progress, format_bytes_human, move_entry_tracked, path_is_inside_fs, same_fs_path,
    scan_path_stats, MoveProgressTracker,
};
use crate::state::ActiveInstall;
use crate::utils::logging::console_log;
use crate::utils::process::kill_process_tree;
use crate::utils::sidecar::{
    ai_env_dir, ai_env_python, ai_env_ready, default_ai_root, legacy_cli_models_dir,
    legacy_scout_model_dir, load_custom_ai_root, patch_pyvenv_home, resolve_ai_location,
    save_custom_ai_root, uv_cache_dir, uv_python_dir, SIGLIP_CACHE_DIR_NAME,
};

mod cli_update;
mod install;
mod packs;
mod progress;
pub(crate) mod status;

pub(crate) use cli_update::*;
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

/// install one pack. `gpu` picks the CUDA wheel, `gpu_decode` rebuilds on the NVDEC profile
#[tauri::command]
pub async fn install_ai_pack(
    app: AppHandle,
    install_state: State<'_, ActiveInstall>,
    worker_state: State<'_, SceneScoutWorkerState>,
    pack: String,
    gpu: bool,
    gpu_decode: Option<bool>,
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
    worker_state.stop_daemon("the install").await;

    let app_for_task = app.clone();
    let state_for_task = state.clone();
    let outcome = tokio::task::spawn_blocking(move || {
        let result = install_ai_pack_inner(&app_for_task, &state_for_task, target, gpu, gpu_decode);
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

/// stop an in-flight install; a half-installed pack just reports as not installed
#[tauri::command]
pub async fn abort_ai_install(install_state: State<'_, ActiveInstall>) -> Result<(), String> {
    install_state.cancel();

    let pid = install_state.pid.lock().map_err(|e| e.to_string())?.take();
    let Some(pid) = pid else {
        console_log("DEPS|abort", "no active install");
        return Ok(());
    };

    console_log("DEPS|abort", &format!("killing uv pid={pid}"));

    let _ = kill_process_tree(pid);

    Ok(())
}

/// remove one pack's own packages. torch stays; use `remove_ai_env` for that space
#[tauri::command]
pub async fn uninstall_ai_pack(
    app: AppHandle,
    worker_state: State<'_, SceneScoutWorkerState>,
    pack: String,
) -> Result<AiEnvStatus, String> {
    let target = pack_by_id(&pack)?;
    if !ai_env_ready(&app) {
        return Err("There is no AI environment to remove from.".to_string());
    }
    worker_state.stop_daemon("the uninstall").await;

    let app_for_task = app.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let python = ai_env_python(&app_for_task)?;
        // never torch/torchvision, and nothing another installed pack still needs (opencv is shared)
        let installed = installed_distributions(&app_for_task, &python)?;
        let has = |dist: &str| installed.contains_key(&dist.to_lowercase());
        let still_needed: Vec<&str> = PACKS
            .iter()
            .filter(|p| p.id != target.id && p.requires.iter().all(|d| has(d)))
            .flat_map(|p| p.requires.iter().copied())
            .collect();
        let removable: Vec<&str> = target
            .requires
            .iter()
            .copied()
            .filter(|d| !TORCH_FAMILY.contains(d) && !still_needed.contains(d) && has(d))
            .collect();
        if removable.is_empty() {
            console_log("DEPS|uninstall", &format!("pack={} has nothing of its own to remove", target.id));
            return Ok(());
        }

        let mut cmd = uv_command(&app_for_task)?;
        cmd.arg("pip").arg("uninstall").arg("--python").arg(&python).args(&removable);
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
pub async fn remove_ai_env(
    app: AppHandle,
    worker_state: State<'_, SceneScoutWorkerState>,
) -> Result<AiEnvStatus, String> {
    worker_state.stop_daemon("removing the AI environment").await;
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

/// Relocate AI runtime (`pyenv`, `python`, `uv-cache`), CLI weights (`models`), and Scene Scout's
/// SigLIP 2 weights to `new_dir` (or back to the default path when `None`), patching `pyvenv.cfg`
/// so all installed packages continue to be recognized without re-downloading.
#[tauri::command]
pub async fn move_ai_storage_to_new_dir(
    app: AppHandle,
    install_state: State<'_, ActiveInstall>,
    worker_state: State<'_, SceneScoutWorkerState>,
    new_dir: Option<String>,
) -> Result<AiEnvStatus, String> {
    let install_guard = install_state.inner().clone();
    install_guard.begin()?;

    worker_state.stop_daemon("moving AI storage").await;

    let app_for_task = app.clone();
    let outcome = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let old_loc = resolve_ai_location(&app_for_task)?;
        let old_custom = load_custom_ai_root(&app_for_task);

        let cleaned_new = new_dir
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(PathBuf::from);

        let target_loc = match cleaned_new.as_ref() {
            Some(p) => {
                save_custom_ai_root(&app_for_task, Some(p))?;
                let loc = resolve_ai_location(&app_for_task)?;
                save_custom_ai_root(&app_for_task, old_custom.as_deref())?;
                loc
            }
            None => {
                save_custom_ai_root(&app_for_task, None)?;
                let loc = resolve_ai_location(&app_for_task)?;
                save_custom_ai_root(&app_for_task, old_custom.as_deref())?;
                loc
            }
        };

        let pointer_to_save = match (cleaned_new.as_ref(), default_ai_root(&app_for_task).ok()) {
            (Some(p), Some(def)) if same_fs_path(p, &def) => None,
            (other, _) => other.map(|p| p.to_path_buf()),
        };

        if same_fs_path(&old_loc.root, &target_loc.root) {
            save_custom_ai_root(&app_for_task, pointer_to_save.as_deref())?;
            return Ok(());
        }

        for protected in [&old_loc.runtime_dir, &old_loc.root] {
            if path_is_inside_fs(&target_loc.root, protected)
                && !same_fs_path(&target_loc.root, protected)
            {
                return Err("Pick a folder outside the current AI storage folder.".to_string());
            }
        }
        for sub in ["runtime", "config", "hf-cache"] {
            let new_sub = target_loc.root.join(sub);
            if path_is_inside_fs(&old_loc.root, &new_sub) && !same_fs_path(&old_loc.root, &new_sub)
            {
                return Err("Pick a folder that does not overlap the current AI storage subfolders.".to_string());
            }
        }

        let target_config = target_loc
            .config_dir
            .clone()
            .unwrap_or_else(|| target_loc.root.join("config"));
        let target_hf = target_loc
            .hf_home_dir
            .clone()
            .unwrap_or_else(|| target_loc.root.join("hf-cache"));

        std::fs::create_dir_all(&target_loc.runtime_dir)
            .map_err(|e| format!("Failed to create target AI runtime directory: {e}"))?;

        let old_models = old_loc
            .config_dir
            .as_ref()
            .map(|c| c.join("models"))
            .filter(|p| p.is_dir())
            .or_else(|| legacy_cli_models_dir().filter(|p| p.is_dir()));
        let old_scout = old_loc
            .hf_home_dir
            .as_ref()
            .map(|h| h.join("hub").join(SIGLIP_CACHE_DIR_NAME))
            .filter(|p| p.is_dir())
            .or_else(|| legacy_scout_model_dir().filter(|p| p.is_dir()));

        emit_move_progress(Some(&app_for_task), 0.0, true, "Scanning AI files...");
        let mut total_bytes = 0u64;
        let mut total_files = 0usize;
        for sub in ["python", "pyenv", "uv-cache"] {
            let (b, f) = scan_path_stats(&old_loc.runtime_dir.join(sub));
            total_bytes += b;
            total_files += f;
        }
        if let Some(ref m) = old_models {
            let (b, f) = scan_path_stats(m);
            total_bytes += b;
            total_files += f;
        }
        if let Some(ref s) = old_scout {
            let (b, f) = scan_path_stats(s);
            total_bytes += b;
            total_files += f;
        }

        let mut tracker = MoveProgressTracker::new(Some(&app_for_task), total_bytes, total_files);
        tracker.log(format!(
            "Moving AI features -> {} ({} across {} file{})",
            target_loc.root.display(),
            format_bytes_human(total_bytes),
            total_files,
            if total_files == 1 { "" } else { "s" }
        ));

        let mut leftovers: Vec<String> = Vec::new();

        // 1. Move runtime subfolders (`pyenv`, `python`, `uv-cache`) and patch `pyvenv.cfg`.
        for sub in ["python", "pyenv", "uv-cache"] {
            let src = old_loc.runtime_dir.join(sub);
            if src.exists() {
                tracker.log(format!("Relocating runtime/{sub}..."));
                let dest = target_loc.runtime_dir.join(sub);
                move_entry_tracked(
                    &src,
                    &dest,
                    &mut leftovers,
                    Some(&mut tracker),
                    &format!("runtime/{sub}"),
                )?;
            }
        }
        if old_loc.runtime_dir.is_dir()
            && std::fs::read_dir(&old_loc.runtime_dir)
                .map(|mut it| it.next().is_none())
                .unwrap_or(false)
        {
            let _ = std::fs::remove_dir(&old_loc.runtime_dir);
        }
        let moved_pyenv = target_loc.runtime_dir.join("pyenv");
        let moved_python_dir = target_loc.runtime_dir.join("python");
        let moved_cfg = moved_pyenv.join("pyvenv.cfg");
        patch_pyvenv_home(
            &moved_cfg,
            &old_loc.runtime_dir.join("python"),
            &moved_python_dir,
        )?;

        // Regenerate uv's Windows trampoline exe (`pyenv/Scripts/python.exe`) and pyvenv.cfg offline
        // while keeping every installed wheel in site-packages intact.
        if moved_pyenv.is_dir() {
            if let Some(base_py) = find_base_python_in(&moved_python_dir) {
                if let Ok(uv) = crate::utils::sidecar::uv_binary(&app_for_task) {
                    if uv.is_file() {
                        tracker.log("Refreshing relocated Python environment launchers...");
                        emit_move_progress(
                            Some(&app_for_task),
                            99.0,
                            true,
                            "Refreshing relocated Python launchers...",
                        );
                        let mut cmd = std::process::Command::new(uv);
                        crate::utils::process::apply_no_window(&mut cmd);
                        cmd.env("UV_PYTHON_INSTALL_DIR", &moved_python_dir)
                            .env("UV_CACHE_DIR", target_loc.runtime_dir.join("uv-cache"))
                            .arg("venv")
                            .arg(&moved_pyenv)
                            .arg("--python")
                            .arg(&base_py)
                            .arg("--allow-existing")
                            .arg("--offline");
                        let out = cmd
                            .output()
                            .map_err(|e| format!("Failed to refresh relocated Python venv: {e}"))?;
                        if !out.status.success() {
                            let stderr = String::from_utf8_lossy(&out.stderr);
                            return Err(format!(
                                "Failed to refresh relocated Python environment: {}",
                                stderr.trim()
                            ));
                        }
                    }
                }
            }
        }

        // Persist the new AI root as soon as runtime/ is relocated so an error on optional model weights
        // never orphans the moved Python environment.
        save_custom_ai_root(&app_for_task, pointer_to_save.as_deref())?;

        // 2. Move CLI model weights (`models/upscale`, `models/depth`, etc.).
        if let Some(src_models) = old_models {
            let dest_models = target_config.join("models");
            if src_models.is_dir() && !same_fs_path(&src_models, &dest_models) {
                tracker.log("Relocating model weights...");
                if let Some(parent) = dest_models.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create models folder: {e}"))?;
                }
                move_entry_tracked(
                    &src_models,
                    &dest_models,
                    &mut leftovers,
                    Some(&mut tracker),
                    "config/models",
                )?;
            }
        }

        // 3. Move Scene Scout's SigLIP 2 folder only (never touch unrelated HF models).
        if let Some(src_scout) = old_scout {
            let dest_hub = target_hf.join("hub");
            let dest_scout = dest_hub.join(SIGLIP_CACHE_DIR_NAME);
            if src_scout.is_dir() && !same_fs_path(&src_scout, &dest_scout) {
                tracker.log("Relocating Scene Scout SigLIP 2 model...");
                std::fs::create_dir_all(&dest_hub)
                    .map_err(|e| format!("Failed to create HF cache folder: {e}"))?;
                move_entry_tracked(
                    &src_scout,
                    &dest_scout,
                    &mut leftovers,
                    Some(&mut tracker),
                    "hf-cache/siglip2",
                )?;
            }
        }
        if !leftovers.is_empty() {
            tracker.log(format!(
                "Finished copying; {} locked source item(s) left behind.",
                leftovers.len()
            ));
            console_log(
                "DEPS|move",
                &format!(
                    "moved AI storage to {}, {} source item(s) locked and left behind",
                    target_loc.root.display(),
                    leftovers.len()
                ),
            );
        } else {
            console_log(
                "DEPS|move",
                &format!("moved AI storage to {}", target_loc.root.display()),
            );
        }
        emit_move_progress(Some(&app_for_task), 100.0, false, "AI storage move complete.");
        tracker.log("AI storage move complete.");
        Ok(())
    })
    .await
    .map_err(|e| {
        install_guard.finish();
        format!("AI storage move task panicked: {e}")
    })?;

    install_guard.finish();
    outcome?;
    ai_env_status(app).await
}

fn find_base_python_in(dir: &std::path::Path) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            let direct = if cfg!(windows) {
                p.join("python.exe")
            } else {
                p.join("bin").join("python3")
            };
            if direct.is_file() {
                return Some(direct);
            }
            if let Some(found) = find_base_python_in(&p) {
                return Some(found);
            }
        }
    }
    None
}
