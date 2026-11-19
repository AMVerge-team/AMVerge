//! optional AI dependencies: torch packs installed on demand into an app-managed uv venv, pinned to the sidecar's CLI version

use std::path::PathBuf;
use tauri::{AppHandle, State};

use crate::commands::scene_scout::SceneScoutWorkerState;
use crate::commands::settings::{
    copy_entry_tracked, emit_move_progress, ensure_media_idle, format_bytes_human,
    path_is_inside_fs, remove_with_retries, replace_staged_entry, same_fs_path,
    scan_path_stats, MoveProgressTracker,
};
use crate::state::{ActiveFfmpegPids, ActiveInstall, ActiveResume, ActiveSidecar, ExportAbortState};
use crate::utils::logging::console_log;
use crate::utils::paths::STORAGE_MOVE_LOCK;
use crate::utils::process::kill_process_tree;
use crate::utils::sidecar::{
    ai_env_dir, ai_env_python, ai_env_ready, default_ai_root, legacy_cli_config_dir,
    legacy_scout_model_dir, patch_pyvenv_home, resolve_ai_location,
    resolve_ai_location_for_move, save_custom_ai_root, uv_cache_dir, uv_python_dir,
    SIGLIP_CACHE_DIR_NAME,
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

pub(crate) fn removable_for_pack(
    target: &Pack,
    installed: &std::collections::HashMap<String, String>,
) -> Vec<&'static str> {
    let has = |dist: &str| installed.contains_key(&dist.to_lowercase());
    let still_needed: Vec<&str> = PACKS
        .iter()
        .filter(|p| p.id != target.id && p.requires.iter().all(|d| has(d)))
        .flat_map(|p| p.requires.iter().copied())
        .collect();
    target
        .requires
        .iter()
        .copied()
        .filter(|&d| d != "torch" && !still_needed.contains(&d) && has(d))
        .collect()
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
        // never torch, and nothing another installed pack still needs (opencv is shared)
        let installed = installed_distributions(&app_for_task, &python)?;
        let removable = removable_for_pack(target, &installed);
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
    sidecar: State<'_, ActiveSidecar>,
    resume: State<'_, ActiveResume>,
    ffmpeg: State<'_, ActiveFfmpegPids>,
    export: State<'_, ExportAbortState>,
    worker_state: State<'_, SceneScoutWorkerState>,
    new_dir: Option<String>,
) -> Result<AiEnvStatus, String> {
    let _move_guard = STORAGE_MOVE_LOCK
        .try_lock()
        .map_err(|_| "Another storage move is already running.".to_string())?;
    if std::env::var("AMVERGE_RUNTIME_DIR")
        .ok()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
    {
        return Err("AMVERGE_RUNTIME_DIR is set, so a storage move cannot change the active runtime. Clear it and restart AMVerge first.".to_string());
    }
    ensure_media_idle(&sidecar, &install_state, &resume, &ffmpeg, &export)?;

    let install_guard = install_state.inner().clone();
    install_guard.begin()?;

    worker_state.stop_daemon("moving AI storage").await;

    let app_for_task = app.clone();
    let outcome = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let old_loc = resolve_ai_location(&app_for_task)?;

        let cleaned_new = new_dir
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(PathBuf::from);

        let target_loc = resolve_ai_location_for_move(&app_for_task, cleaned_new.as_deref())?;

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

        let old_config = old_loc
            .config_dir
            .clone()
            .filter(|p| p.is_dir())
            .or_else(|| legacy_cli_config_dir().filter(|p| p.is_dir()));
        let old_scout = old_loc
            .hf_home_dir
            .as_ref()
            .map(|h| h.join("hub").join(SIGLIP_CACHE_DIR_NAME))
            .filter(|p| p.is_dir())
            .or_else(|| legacy_scout_model_dir().filter(|p| p.is_dir()));

        if let Some(ref config) = old_config {
            if path_is_inside_fs(&target_config, config) && !same_fs_path(&target_config, config) {
                return Err("Pick a folder outside the current CLI config folder.".to_string());
            }
        }
        if let Some(ref scout) = old_scout {
            let target_scout = target_hf.join("hub").join(SIGLIP_CACHE_DIR_NAME);
            if path_is_inside_fs(&target_scout, scout) && !same_fs_path(&target_scout, scout) {
                return Err("Pick a folder outside the current Scene Scout model folder.".to_string());
            }
        }

        emit_move_progress(Some(&app_for_task), 0.0, true, "Scanning AI files...");
        let mut total_bytes = 0u64;
        let mut total_files = 0usize;
        for sub in ["python", "pyenv", "uv-cache"] {
            let (b, f) = scan_path_stats(&old_loc.runtime_dir.join(sub));
            total_bytes += b;
            total_files += f;
        }
        if let Some(ref config) = old_config {
            let (b, f) = scan_path_stats(config);
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

        let nonce = uuid::Uuid::new_v4().simple().to_string();
        let stage_root = target_loc.root.join(format!(".amverge-ai-move-{nonce}"));
        let backup_root = target_loc.root.join(format!(".amverge-ai-backup-{nonce}"));
        let mut leftovers: Vec<String> = Vec::new();
        let mut committed: Vec<(PathBuf, PathBuf)> = Vec::new();
        let transfer_result = (|| -> Result<(), String> {
            for sub in ["python", "pyenv", "uv-cache"] {
                let src = old_loc.runtime_dir.join(sub);
                let dest = target_loc.runtime_dir.join(sub);
                let staged = stage_root.join("runtime").join(sub);
                if dest.is_dir() {
                    copy_entry_tracked(
                        &dest,
                        &staged,
                        &mut leftovers,
                        Some(&mut tracker),
                        &format!("existing/runtime/{sub}"),
                    )?;
                }
                if src.exists() {
                    tracker.log(format!("Staging runtime/{sub}..."));
                    copy_entry_tracked(
                        &src,
                        &staged,
                        &mut leftovers,
                        Some(&mut tracker),
                        &format!("runtime/{sub}"),
                    )?;
                }
            }

            if target_config.is_dir() {
                copy_entry_tracked(
                    &target_config,
                    &stage_root.join("config"),
                    &mut leftovers,
                    Some(&mut tracker),
                    "existing/config",
                )?;
            }
            if let Some(ref src_config) = old_config {
                tracker.log("Staging CLI config and model weights...");
                copy_entry_tracked(
                    src_config,
                    &stage_root.join("config"),
                    &mut leftovers,
                    Some(&mut tracker),
                    "config",
                )?;
            }

            let dest_scout = target_hf.join("hub").join(SIGLIP_CACHE_DIR_NAME);
            let staged_scout = stage_root.join("hf-cache").join(SIGLIP_CACHE_DIR_NAME);
            if dest_scout.is_dir() {
                copy_entry_tracked(
                    &dest_scout,
                    &staged_scout,
                    &mut leftovers,
                    Some(&mut tracker),
                    "existing/hf-cache/siglip2",
                )?;
            }
            if let Some(ref src_scout) = old_scout {
                tracker.log("Staging Scene Scout SigLIP 2 model...");
                copy_entry_tracked(
                    src_scout,
                    &staged_scout,
                    &mut leftovers,
                    Some(&mut tracker),
                    "hf-cache/siglip2",
                )?;
            }

            for sub in ["python", "pyenv", "uv-cache"] {
                let staged = stage_root.join("runtime").join(sub);
                if staged.exists() {
                    let dest = target_loc.runtime_dir.join(sub);
                    let backup = backup_root.join("runtime").join(sub);
                    replace_staged_entry(&staged, &dest, &backup)?;
                    committed.push((dest, backup));
                }
            }
            if stage_root.join("config").exists() {
                let backup = backup_root.join("config");
                replace_staged_entry(&stage_root.join("config"), &target_config, &backup)?;
                committed.push((target_config.clone(), backup));
            }
            if staged_scout.exists() {
                let backup = backup_root.join("hf-cache").join(SIGLIP_CACHE_DIR_NAME);
                replace_staged_entry(&staged_scout, &dest_scout, &backup)?;
                committed.push((dest_scout, backup));
            }
            Ok(())
        })();

        if let Err(err) = transfer_result {
            for (dest, backup) in committed.into_iter().rev() {
                if dest.exists() {
                    let _ = remove_with_retries(&dest);
                }
                if backup.exists() {
                    let _ = std::fs::rename(&backup, &dest);
                }
            }
            let _ = std::fs::remove_dir_all(&stage_root);
            let _ = std::fs::remove_dir_all(&backup_root);
            return Err(err);
        }
        let _ = std::fs::remove_dir_all(&stage_root);
        let _ = std::fs::remove_dir_all(&backup_root);

        let moved_pyenv = target_loc.runtime_dir.join("pyenv");
        let moved_python_dir = target_loc.runtime_dir.join("python");
        let moved_cfg = moved_pyenv.join("pyvenv.cfg");
        patch_pyvenv_home(
            &moved_cfg,
            &old_loc.runtime_dir.join("python"),
            &moved_python_dir,
        )?;

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

        save_custom_ai_root(&app_for_task, pointer_to_save.as_deref())?;

        for sub in ["python", "pyenv", "uv-cache"] {
            let src = old_loc.runtime_dir.join(sub);
            if src.exists() && !remove_with_retries(&src) {
                leftovers.push(src.to_string_lossy().to_string());
            }
        }
        if let Some(src_config) = old_config {
            if src_config.exists() && !remove_with_retries(&src_config) {
                leftovers.push(src_config.to_string_lossy().to_string());
            }
        }
        if let Some(src_scout) = old_scout {
            if src_scout.exists() && !remove_with_retries(&src_scout) {
                leftovers.push(src_scout.to_string_lossy().to_string());
            }
        }
        if old_loc.runtime_dir.is_dir()
            && std::fs::read_dir(&old_loc.runtime_dir)
                .map(|mut it| it.next().is_none())
                .unwrap_or(false)
        {
            let _ = std::fs::remove_dir(&old_loc.runtime_dir);
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
        crate::commands::extension_sync::write_app_paths_file(&app_for_task, None)?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::settings::move_entry_tracked;
    use std::collections::HashMap;
    use std::fs;

    fn is_installed(pack_id: &str, dists: &HashMap<String, String>) -> bool {
        let p = pack_by_id(pack_id).unwrap();
        p.requires
            .iter()
            .all(|d| dists.contains_key(&d.to_lowercase()))
    }

    fn all_installed_env() -> HashMap<String, String> {
        ALL_PACK
            .requires
            .iter()
            .map(|d| (d.to_lowercase(), "1.0.0".to_string()))
            .collect()
    }

    #[test]
    fn free_up_space_uninstalls_every_pack_cleanly_in_any_order() {
        for order in [
            ["depth", "upscale", "scout", "ml"],
            ["upscale", "depth", "ml", "scout"],
            ["ml", "scout", "depth", "upscale"],
        ] {
            let mut env = all_installed_env();
            for id in ["ml", "depth", "scout", "upscale"] {
                assert!(is_installed(id, &env), "{id} should start installed");
            }

            let mut remaining: Vec<&str> = vec!["ml", "depth", "scout", "upscale"];
            for target_id in order {
                let target = pack_by_id(target_id).unwrap();
                let removable = removable_for_pack(target, &env);
                assert!(
                    !removable.is_empty(),
                    "Free up space for {target_id} must remove at least one distribution"
                );
                for dist in removable {
                    env.remove(&dist.to_lowercase());
                }
                assert!(
                    !is_installed(target_id, &env),
                    "{target_id} must report not installed after Free up space"
                );
                remaining.retain(|&id| id != target_id);
                for &still_on in &remaining {
                    assert!(
                        is_installed(still_on, &env),
                        "uninstalling {target_id} broke still-installed pack {still_on}"
                    );
                }
            }
            assert!(env.contains_key("torch"), "torch must remain until remove_ai_env");
        }
    }

    #[test]
    fn relocates_ai_runtime_config_and_siglip_across_multiple_locations() {
        let tmp = tempfile::tempdir().unwrap();
        let loc_a = tmp.path().join("ai_a");
        let loc_b = tmp.path().join("ai_b");
        let loc_c = tmp.path().join("ai_c");

        // Seed full AI layout in loc_a: runtime/{python,pyenv,uv-cache}, config/models, hf-cache/hub/siglip2
        let py_bin = loc_a.join("runtime/python/cpython-3.12-windows/python.exe");
        let venv_cfg = loc_a.join("runtime/pyenv/pyvenv.cfg");
        let uv_marker = loc_a.join("runtime/uv-cache/CACHEDIR.TAG");
        let depth_weight = loc_a.join("config/models/depth_anything_v2_vits.pth");
        let ffmpeg = loc_a.join("config/ffmpeg/bin/ffmpeg.exe");
        let preset = loc_a.join("config/pipelines/look.json");
        let flowframes = loc_a.join("config/flowframes_path.txt");
        let siglip_blob = loc_a
            .join("hf-cache/hub")
            .join(SIGLIP_CACHE_DIR_NAME)
            .join("blobs/11a61a2068800d5f4f35cb041c1fea25");
        let siglip_snap_dir = loc_a
            .join("hf-cache/hub")
            .join(SIGLIP_CACHE_DIR_NAME)
            .join("snapshots/cc24074f");

        for p in [
            &py_bin,
            &venv_cfg,
            &uv_marker,
            &depth_weight,
            &ffmpeg,
            &preset,
            &flowframes,
            &siglip_blob,
        ] {
            fs::create_dir_all(p.parent().unwrap()).unwrap();
        }
        fs::create_dir_all(&siglip_snap_dir).unwrap();
        fs::write(&py_bin, b"py").unwrap();
        fs::write(
            &venv_cfg,
            format!(
                "home = {}\ninclude-system-site-packages = false\n",
                loc_a.join("runtime/python/cpython-3.12-windows").display()
            ),
        )
        .unwrap();
        fs::write(&uv_marker, b"cache").unwrap();
        fs::write(&depth_weight, b"depth-weights").unwrap();
        fs::write(&ffmpeg, b"ffmpeg").unwrap();
        fs::write(&preset, b"{}").unwrap();
        fs::write(&flowframes, b"D:\\Flowframes\\Flowframes.exe").unwrap();
        fs::write(&siglip_blob, b"siglip-weights").unwrap();

        let snap_link = siglip_snap_dir.join("model.safetensors");
        let rel = PathBuf::from("..")
            .join("..")
            .join("blobs")
            .join("11a61a2068800d5f4f35cb041c1fea25");
        #[cfg(windows)]
        let _ = std::os::windows::fs::symlink_file(&rel, &snap_link);
        #[cfg(unix)]
        let _ = std::os::unix::fs::symlink(&rel, &snap_link);
        if fs::symlink_metadata(&snap_link).is_err() {
            fs::write(&snap_link, b"siglip-weights").unwrap();
        }

        // Move A -> B (forcing copy+delete path by pre-creating destination folders), then B -> C
        for (from, to) in [(&loc_a, &loc_b), (&loc_b, &loc_c)] {
            fs::create_dir_all(to.join("runtime/pyenv")).unwrap();
            fs::create_dir_all(to.join("hf-cache/hub").join(SIGLIP_CACHE_DIR_NAME).join("snapshots")).unwrap();
            let mut leftovers = Vec::new();
            for sub in ["python", "pyenv", "uv-cache"] {
                move_entry_tracked(
                    &from.join("runtime").join(sub),
                    &to.join("runtime").join(sub),
                    &mut leftovers,
                    None,
                    sub,
                )
                .unwrap();
            }
            patch_pyvenv_home(
                &to.join("runtime/pyenv/pyvenv.cfg"),
                &from.join("runtime/python"),
                &to.join("runtime/python"),
            )
            .unwrap();
            move_entry_tracked(
                &from.join("config"),
                &to.join("config"),
                &mut leftovers,
                None,
                "config",
            )
            .unwrap();
            move_entry_tracked(
                &from.join("hf-cache/hub").join(SIGLIP_CACHE_DIR_NAME),
                &to.join("hf-cache/hub").join(SIGLIP_CACHE_DIR_NAME),
                &mut leftovers,
                None,
                "hf-cache/siglip2",
            )
            .unwrap();
            assert!(leftovers.is_empty());
        }

        let final_cfg = fs::read_to_string(loc_c.join("runtime/pyenv/pyvenv.cfg")).unwrap();
        assert!(final_cfg.contains(&loc_c.join("runtime/python").to_string_lossy().to_string()));
        assert_eq!(
            fs::read(loc_c.join("config/models/depth_anything_v2_vits.pth")).unwrap(),
            b"depth-weights"
        );
        assert_eq!(fs::read(loc_c.join("config/ffmpeg/bin/ffmpeg.exe")).unwrap(), b"ffmpeg");
        assert_eq!(fs::read(loc_c.join("config/pipelines/look.json")).unwrap(), b"{}");
        assert_eq!(
            fs::read_to_string(loc_c.join("config/flowframes_path.txt")).unwrap(),
            "D:\\Flowframes\\Flowframes.exe"
        );
        assert_eq!(
            fs::read(
                loc_c
                    .join("hf-cache/hub")
                    .join(SIGLIP_CACHE_DIR_NAME)
                    .join("snapshots/cc24074f/model.safetensors")
            )
            .unwrap(),
            b"siglip-weights"
        );
    }
}
