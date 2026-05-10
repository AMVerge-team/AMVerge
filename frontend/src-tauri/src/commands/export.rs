use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::sync::Mutex;

use tauri::{AppHandle, State};

use crate::state::{ActiveFfmpegPids, ExportAbortState};
use crate::utils::ffmpeg::resolve_bundled_tool;
use crate::utils::logging::console_log;
use crate::utils::paths::file_name_only;

mod encode;
mod hardware;
mod merge;
mod multi;
mod ops;
mod probe;
mod progress;
mod runner;
mod types;

pub use types::{
    ExportOptionsPayload, GpuEncoderCapabilitiesPayload, NvidiaEncoderDetectionPayload,
};

use types::ExportRuntime;

struct ExportAbortGuard {
    abort_requested: Arc<std::sync::atomic::AtomicBool>,
    active_pids: Arc<Mutex<Vec<u32>>>,
}

impl Drop for ExportAbortGuard {
    fn drop(&mut self) {
        self.abort_requested.store(false, Ordering::SeqCst);
        if let Ok(mut lock) = self.active_pids.lock() {
            lock.clear();
        }
    }
}

fn normalize_save_path(save_path: &str) -> Result<PathBuf, String> {
    let mut path = PathBuf::from(save_path);

    if path.extension().is_none() {
        path.set_extension("mp4");
    }

    if let Some(parent) = path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    Ok(path)
}

#[tauri::command]
pub async fn export_clips(
    app: AppHandle,
    abort_state: State<'_, ExportAbortState>,
    clips: Vec<String>,
    save_path: String,
    merge_enabled: bool,
    export_options: Option<ExportOptionsPayload>,
) -> Result<Vec<String>, String> {
    abort_state.abort_requested.store(false, Ordering::SeqCst);
    if let Ok(mut lock) = abort_state.pids.lock() {
        lock.clear();
    }

    let abort_requested = abort_state.abort_requested.clone();
    let active_pids = abort_state.pids.clone();

    let _abort_guard = ExportAbortGuard {
        abort_requested: abort_requested.clone(),
        active_pids: active_pids.clone(),
    };

    if clips.is_empty() {
        return Ok(Vec::new());
    }

    console_log(
        "EXPORT|start",
        &format!(
            "merge_enabled={} clips={} dest={}",
            merge_enabled,
            clips.len(),
            file_name_only(&save_path)
        ),
    );

    if let Some(options) = &export_options {
        console_log(
            "EXPORT|profile",
            &format!(
                "profile={} workflow={} editor={} codec={} audio={} hardware={} parallel={}",
                options.profile_id,
                options.workflow,
                options.editor_target,
                options.codec,
                options.audio_mode,
                options.hardware_mode,
                options.parallel_exports
            ),
        );
    }

    let workflow = export_options
        .as_ref()
        .map(|options| options.workflow())
        .unwrap_or("video_encode");
    let remux_workflow = workflow == "video_remux" || workflow == "editor_remux";
    let force_encode_workflow = workflow == "video_encode" || workflow == "editor_encode";

    let ffmpeg = resolve_bundled_tool(&app, "ffmpeg")?;
    let ffprobe = resolve_bundled_tool(&app, "ffprobe")?;
    let gpu_capabilities = hardware::detect_gpu_encoder_capabilities_inner(ffmpeg.clone())
        .await
        .unwrap_or_default();

    if gpu_capabilities.has_gpu_encoder {
        console_log(
            "EXPORT|gpu",
            &format!(
                "backend={} h264={} h265={} av1={} max_parallel={}",
                gpu_capabilities.preferred_backend,
                gpu_capabilities.h264_encoder.as_deref().unwrap_or("none"),
                gpu_capabilities.h265_encoder.as_deref().unwrap_or("none"),
                gpu_capabilities.av1_encoder.as_deref().unwrap_or("none"),
                gpu_capabilities.max_parallel_exports
            ),
        );
    } else {
        console_log(
            "EXPORT|gpu",
            "no hardware video encoder available; cpu path",
        );
    }

    let runtime = ExportRuntime {
        app,
        ffmpeg,
        ffprobe,
        abort_requested,
        active_pids,
        export_options,
        gpu_capabilities,
        export_start_time: std::time::Instant::now(),
        remux_workflow,
        force_encode_workflow,
    };

    let normalized_save_path = normalize_save_path(&save_path)?;

    let exported_files = if merge_enabled {
        vec![merge::run_merge_export(&runtime, &clips, &normalized_save_path).await?]
    } else {
        multi::run_multi_export(&runtime, &clips, &normalized_save_path).await?
    };

    console_log("EXPORT|end", "ok");

    Ok(exported_files)
}

#[tauri::command]
pub async fn detect_nvidia_encoder_profile() -> Result<NvidiaEncoderDetectionPayload, String> {
    hardware::detect_nvidia_encoder_profile_inner().await
}

#[tauri::command]
pub async fn detect_gpu_encoder_capabilities(
    app: AppHandle,
) -> Result<GpuEncoderCapabilitiesPayload, String> {
    let ffmpeg = resolve_bundled_tool(&app, "ffmpeg")?;
    hardware::detect_gpu_encoder_capabilities_inner(ffmpeg).await
}

#[tauri::command]
pub async fn fast_merge(
    app: AppHandle,
    ffmpeg_pids: State<'_, ActiveFfmpegPids>,
    clips: Vec<String>,
    output_path: String,
) -> Result<String, String> {
    ops::fast_merge_inner(app, ffmpeg_pids.pids.clone(), clips, output_path).await
}

#[tauri::command]
pub async fn fast_split(
    app: AppHandle,
    ffmpeg_pids: State<'_, ActiveFfmpegPids>,
    input_path: String,
    split_time: f64,
    output_path1: String,
    output_path2: String,
    thumb_path2: String,
) -> Result<(), String> {
    ops::fast_split_inner(
        app,
        ffmpeg_pids.pids.clone(),
        input_path,
        split_time,
        output_path1,
        output_path2,
        thumb_path2,
    )
    .await
}

#[tauri::command]
pub async fn abort_export(abort_state: State<'_, ExportAbortState>) -> Result<String, String> {
    ops::abort_export_inner(abort_state).await
}
