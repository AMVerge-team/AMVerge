use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::sync::Mutex;

use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use crate::payloads::ProgressPayload;
use crate::state::{ActiveFfmpegPids, ExportAbortState};
use crate::utils::logging::{console_log, sanitize_for_console};
use crate::utils::paths::file_name_only;
use crate::utils::sidecar::{amverge_command, amverge_exe_name};

mod hardware;
mod ops;
mod types;

pub use types::{
    ExportOptionsPayload, GpuEncoderCapabilitiesPayload, NvidiaEncoderDetectionPayload,
};

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

/// Reject a resolved save path whose final component contains separators /
/// parent refs — prevents path-traversal via a user-supplied merge filename.
fn validate_save_path_filename(path: &std::path::Path) -> Result<(), String> {
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Output path has no file name component.".to_string())?;
    if file_name.is_empty() || file_name == "." || file_name == ".." {
        return Err("Output file name is invalid.".into());
    }
    if file_name.contains('/') || file_name.contains('\\') || file_name.contains('\0') {
        return Err("Output file name contains invalid characters.".into());
    }
    Ok(())
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

/// Map the profile workflow to the CLI `--codec`. Remux → stream copy; encode →
/// the profile's codec (the CLI validates codec/container compatibility).
fn codec_for(options: Option<&ExportOptionsPayload>) -> String {
    match options {
        Some(o) if o.workflow().contains("remux") => "copy".to_string(),
        Some(o) => o.codec.clone(),
        None => "copy".to_string(),
    }
}

/// Drive the AMVerge CLI to export the selected clips. Replaces the former
/// in-process Rust ffmpeg pipeline: spawns `amverge export --ipc`, forwards its
/// progress to the UI, and returns the produced file paths.
#[tauri::command]
pub async fn export_clips(
    app: AppHandle,
    abort_state: State<'_, ExportAbortState>,
    clips: Vec<String>,
    save_path: String,
    merge_enabled: bool,
    export_options: Option<ExportOptionsPayload>,
    audio_track: Option<u32>,
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

    // Preflight: every input clip must still exist (the working folder can be
    // wiped between import and export).
    {
        let mut missing: Vec<String> = Vec::new();
        for clip in &clips {
            if !std::path::Path::new(clip).exists() {
                missing.push(file_name_only(clip));
                if missing.len() >= 3 {
                    break;
                }
            }
        }
        if !missing.is_empty() {
            return Err(format!(
                "Source clip(s) no longer exist on disk: {}. Re-import the episode and try again.",
                missing.join(", ")
            ));
        }
    }

    let normalized_save_path = normalize_save_path(&save_path)?;
    validate_save_path_filename(&normalized_save_path)?;

    let out_dir = normalized_save_path
        .parent()
        .ok_or("Invalid save path")?
        .to_string_lossy()
        .to_string();
    let stem = normalized_save_path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("Invalid filename")?
        .to_string();
    let container = normalized_save_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4")
        .to_ascii_lowercase();

    let codec = codec_for(export_options.as_ref());
    let audio = export_options
        .as_ref()
        .map(|o| o.audio_mode.clone())
        .unwrap_or_else(|| "copy".to_string());
    let hardware = export_options
        .as_ref()
        .map(|o| o.hardware_mode.clone())
        .unwrap_or_else(|| "auto".to_string());
    let workers = export_options
        .as_ref()
        .map(|o| o.parallel_exports())
        .unwrap_or(1)
        .max(1);

    console_log(
        "EXPORT|start",
        &format!(
            "clips={} merge={} codec={codec} audio={audio} hw={hardware} dest={}",
            clips.len(),
            merge_enabled,
            file_name_only(&save_path)
        ),
    );

    // The CLI reads the input clip list from a temp JSON file.
    let inputs_path = std::env::temp_dir().join(format!("amverge_export_{}.json", std::process::id()));
    std::fs::write(
        &inputs_path,
        serde_json::to_string(&clips).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("Failed to write export input list: {e}"))?;
    let inputs_path_str = inputs_path.to_string_lossy().to_string();

    let mut cmd = amverge_command(&app)?;
    cmd.arg("export")
        .arg("--inputs-json")
        .arg(&inputs_path_str)
        .arg("--output")
        .arg(&out_dir)
        .arg("--name")
        .arg(&stem)
        .arg("--container")
        .arg(&container)
        .arg("--codec")
        .arg(&codec)
        .arg("--audio")
        .arg(&audio)
        .arg("--hardware")
        .arg(&hardware)
        .arg("--workers")
        .arg(workers.to_string());
    if let Some(track) = audio_track {
        cmd.arg("--audio-track").arg(track.to_string());
    }
    if merge_enabled {
        cmd.arg("--merge");
    }
    cmd.arg("--ipc")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    console_log(
        "EXPORT|spawn",
        &format!("exe={} merge={merge_enabled} workers={workers}", amverge_exe_name()),
    );

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn amverge CLI: {e}"))?;
    let child_pid = child.id();
    if let Ok(mut lock) = active_pids.lock() {
        lock.push(child_pid);
    }

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    // stderr thread: forward PROGRESS to the UI; surface CLI logs to the console.
    let app_for_err = app.clone();
    let stderr_accum = Arc::new(Mutex::new(String::new()));
    let stderr_accum_thread = Arc::clone(&stderr_accum);
    let stderr_handle = tokio::task::spawn_blocking(move || {
        for line in BufReader::new(stderr).lines().flatten() {
            if let Ok(mut acc) = stderr_accum_thread.lock() {
                acc.push_str(&line);
                acc.push('\n');
            }
            if let Some(rest) = line.strip_prefix("PROGRESS|") {
                let mut parts = rest.splitn(2, '|');
                let pct = parts.next().unwrap_or("");
                let msg = parts.next().unwrap_or("").to_string();
                if let Ok(p) = pct.parse::<u8>() {
                    let _ = app_for_err.emit("scene_progress", ProgressPayload { percent: p, message: msg });
                }
            } else if line.starts_with("CLIP_READY|") {
                // Per-clip completion; the export UI tracks the aggregate bar only.
            } else if !line.trim().is_empty() {
                console_log("EXPORT|cli", &sanitize_for_console(&line));
            }
        }
    });

    let stdout_string = tokio::task::spawn_blocking(move || {
        let mut buf = String::new();
        BufReader::new(stdout).read_to_string(&mut buf).map(|_| buf)
    })
    .await
    .map_err(|e| format!("stdout thread panicked: {e}"))?
    .map_err(|e| format!("Failed reading stdout: {e}"))?;

    let _ = stderr_handle.await;
    let status = tokio::task::spawn_blocking(move || child.wait())
        .await
        .map_err(|e| format!("wait thread panicked: {e}"))?
        .map_err(|e| format!("Failed waiting for amverge: {e}"))?;

    if let Ok(mut lock) = active_pids.lock() {
        lock.retain(|p| *p != child_pid);
    }
    let _ = std::fs::remove_file(&inputs_path);

    if abort_requested.load(Ordering::SeqCst) {
        return Err("Export canceled.".to_string());
    }

    // The CLI prints a final JSON summary to stdout in --ipc mode.
    if let Ok(payload) = serde_json::from_str::<Value>(stdout_string.trim()) {
        if let Some(err) = payload.get("error").and_then(|e| e.as_object()) {
            let msg = err.get("message").and_then(|m| m.as_str()).unwrap_or("export failed");
            console_log("ERROR|export_clips", &sanitize_for_console(msg));
            return Err(msg.to_string());
        }
        let outputs: Vec<String> = payload
            .get("outputs")
            .and_then(|o| o.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();
        if status.success() {
            console_log("EXPORT|end", &format!("ok files={}", outputs.len()));
            return Ok(outputs);
        }
    }

    let err = stderr_accum
        .lock()
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    console_log("ERROR|export_clips", &format!("exit={status}"));
    Err(if err.is_empty() {
        format!("Export failed ({status})")
    } else {
        err
    })
}

#[tauri::command]
pub async fn detect_nvidia_encoder_profile() -> Result<NvidiaEncoderDetectionPayload, String> {
    hardware::detect_nvidia_encoder_profile_inner().await
}

#[tauri::command]
pub async fn detect_gpu_encoder_capabilities(
    app: AppHandle,
) -> Result<GpuEncoderCapabilitiesPayload, String> {
    let ffmpeg = crate::utils::ffmpeg::resolve_bundled_tool(&app, "ffmpeg")?;
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
