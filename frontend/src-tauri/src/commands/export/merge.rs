use std::io::Write;
use std::path::Path;

use crate::utils::logging::{console_log, sanitize_for_console};
use crate::utils::paths::file_name_only;

use super::encode::{
    append_audio_encode_args, append_video_encode_args, select_gpu_encoder_for_codec,
};
use super::probe::{clip_first_presented_frame_is_key, clip_video_start_ms, ffprobe_duration_ms};
use super::probe::clip_first_video_packet_is_copy_safe;
use super::progress::{
    emit_export_progress, export_canceled_error, is_canceled_error_text, is_export_cancel_requested,
};
use super::runner::run_ffmpeg_with_progress;
use super::types::ExportRuntime;

fn uses_gpu_encoding(runtime: &ExportRuntime) -> bool {
    matches!(
        runtime
            .export_options
            .as_ref()
            .map(|o| o.hardware_mode.as_str()),
        Some("auto") | Some("gpu")
    )
}

fn is_gpu_session_open_error(error_text: &str) -> bool {
    let text = error_text.to_ascii_lowercase();
    let mentions_hw_encoder = text.contains("nvenc")
        || text.contains("openencodesessionex")
        || text.contains("_amf")
        || text.contains("amf")
        || text.contains("_qsv")
        || text.contains("qsv")
        || text.contains("videotoolbox")
        || text.contains("vaapi");

    if !mentions_hw_encoder {
        return false;
    }

    text.contains("openencodesessionex failed")
        || text.contains("no capable devices found")
        || text.contains("incompatible client key")
        || text.contains("unsupported device")
        || text.contains("error while opening encoder")
        || text.contains("failed to initialise")
        || text.contains("failed to initialize")
        || text.contains("device failed")
        || text.contains("encoder not found")
        || text.contains("function not implemented")
        || text.contains("invalid argument")
}

pub(super) async fn run_merge_export(
    runtime: &ExportRuntime,
    clips: &[String],
    save_path: &Path,
) -> Result<String, String> {
    use tempfile::NamedTempFile;

    if is_export_cancel_requested(&runtime.abort_requested) {
        return Err(export_canceled_error());
    }

    emit_export_progress(
        &runtime.app,
        0,
        "Merging clips...",
        runtime.export_start_time,
    );

    let out_str = save_path.to_str().ok_or("Invalid output path")?.to_string();

    emit_export_progress(
        &runtime.app,
        25,
        "Probing durations...",
        runtime.export_start_time,
    );

    let mut total_ms: Option<u64> = Some(0);
    for clip in clips {
        if is_export_cancel_requested(&runtime.abort_requested) {
            return Err(export_canceled_error());
        }
        match ffprobe_duration_ms(runtime.ffprobe.clone(), clip.clone()).await {
            Ok(Some(ms)) => {
                if let Some(total) = total_ms {
                    total_ms = Some(total.saturating_add(ms));
                }
            }
            _ => {
                total_ms = None;
                break;
            }
        }
    }

    emit_export_progress(
        &runtime.app,
        40,
        "Preparing file list...",
        runtime.export_start_time,
    );

    let mut filelist =
        NamedTempFile::new().map_err(|e| format!("Failed to create temp file: {e}"))?;
    for clip in clips {
        if is_export_cancel_requested(&runtime.abort_requested) {
            return Err(export_canceled_error());
        }
        let safe_path = clip.replace("'", "'\\''");
        writeln!(filelist, "file '{}'", safe_path)
            .map_err(|e| format!("Failed to write to temp file: {e}"))?;
    }

    let filelist_path = filelist.path().to_string_lossy().to_string();

    emit_export_progress(&runtime.app, 50, "Merging...", runtime.export_start_time);

    let mut remux_merge_fallback_reason: Option<String> = None;
    if runtime.remux_workflow {
        for clip in clips {
            if is_export_cancel_requested(&runtime.abort_requested) {
                return Err(export_canceled_error());
            }

            let leading_gap_ms = clip_video_start_ms(runtime.ffprobe.clone(), clip.clone())
                .await
                .ok()
                .flatten();
            if let Some(ms) = leading_gap_ms.filter(|ms| *ms >= 1) {
                remux_merge_fallback_reason = Some(format!(
                    "leading gap={}ms detected on {}; using merge re-encode",
                    ms,
                    file_name_only(clip)
                ));
                break;
            }

            let starts_with_presentable_key =
                match clip_first_presented_frame_is_key(runtime.ffprobe.clone(), clip.clone())
                    .await
                {
                    Ok(Some(v)) => v,
                    Ok(None) | Err(_) => false,
                };
            if !starts_with_presentable_key {
                remux_merge_fallback_reason = Some(format!(
                    "first displayed frame is not key/I on {}; using merge re-encode",
                    file_name_only(clip)
                ));
                break;
            }

            let first_packet_copy_safe =
                match clip_first_video_packet_is_copy_safe(runtime.ffprobe.clone(), clip.clone())
                    .await
                {
                    Ok(Some(v)) => v,
                    Ok(None) | Err(_) => false,
                };
            if !first_packet_copy_safe {
                remux_merge_fallback_reason = Some(format!(
                    "first video packet not copy-safe (needs sync/preroll) on {}; using merge re-encode",
                    file_name_only(clip)
                ));
                break;
            }
        }
    }

    let use_stream_copy = runtime.remux_workflow && remux_merge_fallback_reason.is_none();

    if let Some(reason) = &remux_merge_fallback_reason {
        console_log("EXPORT|merge", reason);
    }

    let mut args = vec![
        "-y".into(),
        "-f".into(),
        "concat".into(),
        "-safe".into(),
        "0".into(),
        "-i".into(),
        filelist_path.clone(),
        "-map".into(),
        "0:v:0".into(),
        "-map".into(),
        "0:a?".into(),
        "-map_metadata".into(),
        "-1".into(),
    ];

    if use_stream_copy {
        args.extend(["-c:v".into(), "copy".into(), "-c:a".into(), "copy".into()]);
    } else {
        let audio_mode = runtime
            .export_options
            .as_ref()
            .map(|options| options.audio_mode.as_str())
            .unwrap_or("aac");
        let selected_gpu_encoder = runtime.export_options.as_ref().and_then(|options| {
            select_gpu_encoder_for_codec(options.codec.as_str(), &runtime.gpu_capabilities)
        });

        args.extend(["-vf".into(), "setpts=PTS-STARTPTS".into()]);
        if audio_mode != "none" && audio_mode != "copy" {
            args.extend(["-af".into(), "asetpts=PTS-STARTPTS".into()]);
        }

        append_video_encode_args(
            &mut args,
            runtime.export_options.as_ref(),
            selected_gpu_encoder,
        );
        args.extend(["-enc_time_base:v".into(), "demux".into()]);
        append_audio_encode_args(&mut args, runtime.export_options.as_ref());
        args.extend(["-fps_mode".into(), "passthrough".into()]);
    }

    let ext = save_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext == "mp4" || ext == "mov" {
        args.push("-movflags".into());
        args.push("+faststart".into());
    }

    args.extend([
        "-max_muxing_queue_size".into(),
        "1024".into(),
        out_str.clone(),
    ]);

    let app_for_ffmpeg = runtime.app.clone();
    let ffmpeg_clone = runtime.ffmpeg.clone();
    let start_time = runtime.export_start_time;
    let abort_requested_for_run = runtime.abort_requested.clone();
    let active_pids_for_run = runtime.active_pids.clone();

    let run_result = tokio::task::spawn_blocking(move || {
        run_ffmpeg_with_progress(
            app_for_ffmpeg,
            ffmpeg_clone,
            args,
            total_ms,
            0,
            total_ms,
            "Merging",
            start_time,
            abort_requested_for_run,
            active_pids_for_run,
            true,
        )
    })
    .await
    .map_err(|e| format!("ffmpeg task panicked: {e}"))?;

    if let Err(error_text) = run_result {
        if is_canceled_error_text(&error_text) {
            return Err(error_text);
        }

        if !use_stream_copy && uses_gpu_encoding(runtime) && is_gpu_session_open_error(&error_text)
        {
            console_log(
                "EXPORT|retry",
                "merge gpu encoder init failed; retry merge re-encode on cpu",
            );

            let mut cpu_options = runtime.export_options.clone();
            if let Some(options) = cpu_options.as_mut() {
                options.hardware_mode = "cpu".to_string();
            }

            let mut cpu_args = vec![
                "-y".to_string(),
                "-f".to_string(),
                "concat".to_string(),
                "-safe".to_string(),
                "0".to_string(),
                "-i".to_string(),
                filelist_path.clone(),
                "-map".to_string(),
                "0:v:0".to_string(),
                "-map".to_string(),
                "0:a?".to_string(),
                "-map_metadata".to_string(),
                "-1".to_string(),
                "-vf".to_string(),
                "setpts=PTS-STARTPTS".to_string(),
            ];
            let cpu_audio_mode = cpu_options
                .as_ref()
                .map(|options| options.audio_mode.as_str())
                .unwrap_or("aac");
            if cpu_audio_mode != "none" && cpu_audio_mode != "copy" {
                cpu_args.extend(["-af".to_string(), "asetpts=PTS-STARTPTS".to_string()]);
            }

            append_video_encode_args(&mut cpu_args, cpu_options.as_ref(), None);
            cpu_args.extend(["-enc_time_base:v".to_string(), "demux".to_string()]);
            append_audio_encode_args(&mut cpu_args, cpu_options.as_ref());
            cpu_args.extend(["-fps_mode".to_string(), "passthrough".to_string()]);

            if ext == "mp4" || ext == "mov" {
                cpu_args.extend(["-movflags".to_string(), "+faststart".to_string()]);
            }

            cpu_args.extend([
                "-max_muxing_queue_size".to_string(),
                "1024".to_string(),
                out_str.clone(),
            ]);

            let app_for_ffmpeg = runtime.app.clone();
            let ffmpeg_clone = runtime.ffmpeg.clone();
            let start_time = runtime.export_start_time;
            let abort_requested_for_run = runtime.abort_requested.clone();
            let active_pids_for_run = runtime.active_pids.clone();
            let cpu_retry_result = tokio::task::spawn_blocking(move || {
                run_ffmpeg_with_progress(
                    app_for_ffmpeg,
                    ffmpeg_clone,
                    cpu_args,
                    total_ms,
                    0,
                    total_ms,
                    "Merging (cpu fallback)",
                    start_time,
                    abort_requested_for_run,
                    active_pids_for_run,
                    true,
                )
            })
            .await
            .map_err(|e| format!("ffmpeg task panicked: {e}"))?;

            if let Err(cpu_error_text) = cpu_retry_result {
                if is_canceled_error_text(&cpu_error_text) {
                    return Err(cpu_error_text);
                }
                return Err(format!(
                    "FFmpeg merge failed.\n(gpu)\n{error_text}\n\n(cpu fallback)\n{cpu_error_text}"
                ));
            }

            emit_export_progress(
                &runtime.app,
                100,
                "Export complete",
                runtime.export_start_time,
            );

            return Ok(out_str);
        }

        console_log(
            "ERROR|export_clips",
            &format!("merge failed: {}", sanitize_for_console(&error_text)),
        );
        return Err(format!("FFmpeg merge failed: {error_text}"));
    }

    emit_export_progress(
        &runtime.app,
        100,
        "Export complete",
        runtime.export_start_time,
    );

    Ok(out_str)
}
