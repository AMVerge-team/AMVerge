#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod payloads;
mod state;
mod utils;

use state::{
    ActiveFfmpegPids, ActiveInstall, ActiveResume, ActiveSidecar, DiscordRPCState, EditorImportAbortState,
    ExportAbortState, PreviewProxyLocks, PreviewTranscodeSlots,
};
use utils::process::kill_process_tree;
use std::sync::atomic::Ordering;
use tauri::Manager;

fn main() {
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(PreviewProxyLocks::default())
        .manage(PreviewTranscodeSlots::default())
        .manage(ActiveSidecar::default())
        .manage(DiscordRPCState::default())
        .manage(EditorImportAbortState::default())
        .manage(ExportAbortState::default())
        .manage(ActiveFfmpegPids::default())
        .manage(ActiveResume::default())
        .manage(ActiveInstall::default())
        .manage(commands::auth::DiscordAuthState::default())
        .manage(crate::commands::scene_scout::SceneScoutWorkerState::default())
        .manage(crate::commands::scene_scout::ActiveScoutIndex::default())
        .invoke_handler(tauri::generate_handler![
            commands::bug_report::submit_bug_report,
            commands::auth::begin_discord_login,
            commands::auth::cancel_discord_login,
            commands::auth::discord_session,
            commands::auth::discord_logout,
            commands::events::fetch_events,
            commands::events::fetch_my_events,
            commands::events::submit_event_request,
            commands::events::update_event_request,
            commands::events::delete_event_request,
            commands::events::acknowledge_event_denial,
            commands::events::acknowledge_ban_notice,
            commands::events::acknowledge_event_approval,
            commands::system_specs::detect_pc_specs,
            commands::deps::ai_env_status,
            commands::deps::install_ai_pack,
            commands::deps::abort_ai_install,
            commands::deps::uninstall_ai_pack,
            commands::deps::remove_ai_env,
            commands::deps::update_ai_cli,
            commands::models::list_models,
            commands::models::download_model,
            commands::models::delete_model,
            commands::notifications::fetch_startup_notification,
            commands::scenes::detect_scenes,
            commands::scenes::load_episode_manifest,
            commands::scenes::abort_detect_scenes,
            commands::export::export_clips,
            commands::export::run_export_pass,
            commands::export::abort_export,
            commands::export::delete_export_intermediates,
            commands::export::create_export_staging_dir,
            commands::export::delete_export_staging_dir,
            commands::export::unique_export_base_name,
            commands::scene_resume::resume_episode_clips,
            commands::scene_resume::abort_resume_episode,
            commands::export::detect_nvidia_encoder_profile,
            commands::export::detect_gpu_encoder_capabilities,
            commands::export::fast_merge,
            commands::export::fast_split,
            commands::extension_sync::read_extension_sync_theme,
            commands::extension_sync::list_extension_sync_episodes,
            commands::extension_sync::clear_extension_sync,
            commands::editor_import::import_media_to_editor,
            commands::editor_import::abort_editor_import,
            commands::editor_import::davinci_resolve::detect_davinci_resolve,
            commands::editor_import::davinci_resolve::import_clips_to_davinci,
            commands::preview::check_hevc,
            commands::preview::get_audio_streams,
            commands::preview::probe_export_source_streams,
            commands::preview::hover_preview_error,
            commands::preview::ensure_preview_proxy,
            commands::preview::ensure_merged_preview,
            commands::preview::ensure_scene_range_preview,
            commands::preview::generate_scene_webp,
            commands::preview::generate_scene_webp_batch,
            commands::preview::lookup_scene_webp_cache_batch,
            commands::cache::delete_episode_cache,
            commands::cache::clear_episode_panel_cache,
            commands::scenepacks::materialize_scenepack_clips,
            commands::scenepacks::delete_scenepack_clip_files,
            commands::scenepacks::save_scenepack_thumbnail,
            commands::scenepacks::delete_scenepack_storage,
            commands::scenepacks::clear_scenepacks_storage,
            commands::settings::save_background_image,
            commands::settings::crop_and_save_image,
            commands::settings::crop_and_save_profile_icon,
            commands::settings::delete_profile_icon_file,
            commands::settings::reveal_in_file_manager,
            commands::settings::move_storage_to_new_dir,
            commands::scene_scout::scout_list_databases,
            commands::scene_scout::scout_database_info,
            commands::scene_scout::scout_open_database,
            commands::scene_scout::scout_create_database,
            commands::scene_scout::scout_delete_database,
            commands::scene_scout::scout_list_videos,
            commands::scene_scout::scout_delete_video,
            commands::scene_scout::scout_status,
            commands::scene_scout::scout_search,
            commands::scene_scout::scout_add_video,
            commands::scene_scout::abort_scout_index,
            commands::scene_scout::scout_unload_model,
            commands::scene_scout::extract_scout_thumbnail_memory,
            commands::scene_scout::scout_generate_thumbnails,
            commands::settings::get_default_episodes_dir,
            commands::discord::start_discord_rpc,
            commands::discord::update_discord_rpc,
            commands::discord::stop_discord_rpc,
            commands::discord::discord_rpc_status,
            commands::discord::discord_rpc_app_info,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                kill_all_child_processes(&window.app_handle().clone());
            }
        })
        .build(tauri::generate_context!())
        .expect("error building app")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                kill_all_child_processes(app);
            }
        });
}

/// empties a tracked pid list, so each pid is killed exactly once
fn drain_pids(pids: &std::sync::Mutex<Vec<u32>>) -> Vec<u32> {
    pids.lock().map(|mut l| l.drain(..).collect()).unwrap_or_default()
}

/// takes a single tracked pid, leaving the slot empty
fn take_pid(pid: &std::sync::Mutex<Option<u32>>) -> Option<u32> {
    pid.lock().ok().and_then(|mut l| l.take())
}

fn kill_all_child_processes(app: &tauri::AppHandle) {
    let mut pids: Vec<u32> = Vec::new();

    // active export ffmpeg processes
    let export_state = app.state::<ExportAbortState>();
    export_state.abort_requested.store(true, Ordering::SeqCst);
    pids.extend(drain_pids(&export_state.pids));

    // untracked ffmpeg processes (merge, split, proxy) and a running episode resume
    let resume = app.state::<ActiveResume>();
    resume.cancel_requested.store(true, Ordering::SeqCst);
    pids.extend(drain_pids(&app.state::<ActiveFfmpegPids>().pids));
    pids.extend(drain_pids(&resume.pids));

    // Python sidecar (scene detection) process group
    pids.extend(app.state::<ActiveSidecar>().take_pids(None));

    // an in-flight dependency install (uv + its download children)
    pids.extend(take_pid(&app.state::<ActiveInstall>().pid));

    for pid in pids {
        let _ = kill_process_tree(pid);
    }

    // clear the Discord presence before the process goes away, so no ghost
    // "playing AMVerge" is left on the profile
    commands::discord::shutdown(app);

    // kill active Scene Scout daemon worker
    let scout_worker = app.state::<crate::commands::scene_scout::SceneScoutWorkerState>();
    if let Ok(mut guard) = scout_worker.inner.try_lock() {
        if let Some(mut session) = guard.take() {
            let _ = session.child.start_kill();
        }
    };

    let scout_index = app.state::<crate::commands::scene_scout::ActiveScoutIndex>();
    if let Some(pid) = take_pid(&scout_index.pid) {
        let _ = kill_process_tree(pid);
    }
}
