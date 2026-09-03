use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::sync::Mutex;

use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use crate::payloads::{PassLogPayload, PassPreviewPayload, PassProgressPayload, ProgressPayload};
use crate::state::{ActiveFfmpegPids, ExportAbortState};
use crate::utils::logging::{console_log, sanitize_for_console};
use crate::utils::paths::file_name_only;
use crate::utils::sidecar::{amverge_ai_command, amverge_command, amverge_exe_name};

mod hardware;
mod ops;
mod types;

pub use types::{
    ExportOptionsPayload, GpuEncoderCapabilitiesPayload, NvidiaEncoderDetectionPayload,
};

/// one clip to export. `input` is a pre-cut clip file exported whole (video
/// mode); when `start_sec`/`end_sec` are present, `input` is a source episode
/// and that range is cut from it (webp mode). serialized as-is into the CLI's
/// `--inputs-json`
#[derive(serde::Deserialize, serde::Serialize)]
pub(crate) struct ClipSpec {
    input: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    start_sec: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    end_sec: Option<f64>,
}

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

/// reject a resolved save path whose final component contains separators /
/// parent refs; prevents path-traversal via a user-supplied merge filename
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

/// Map the profile workflow to the CLI `--codec`. remux → stream copy; encode →
/// the profile's codec (the CLI validates codec/container compatibility)
fn codec_for(options: Option<&ExportOptionsPayload>) -> String {
    match options {
        Some(o) if o.workflow().contains("remux") => "copy".to_string(),
        Some(o) => o.codec.clone(),
        None => "copy".to_string(),
    }
}

/// drive the AMVerge CLI to export the selected clips. replaces the former
/// in-process Rust ffmpeg pipeline: spawns `amverge export --ipc`, forwards its
/// progress to the UI, and returns the produced file paths
#[tauri::command]
pub async fn export_clips(
    app: AppHandle,
    abort_state: State<'_, ExportAbortState>,
    clips: Vec<ClipSpec>,
    save_path: String,
    merge_enabled: bool,
    export_options: Option<ExportOptionsPayload>,
    audio_track: Option<u32>,
    audio_language: Option<String>,
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

    // preflight: every input clip must still exist (the working folder can be
    // wiped between import and export)
    {
        let mut missing: Vec<String> = Vec::new();
        for clip in &clips {
            if !std::path::Path::new(&clip.input).exists() {
                missing.push(file_name_only(&clip.input));
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

    // the CLI reads the input clip list from a temp JSON file
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
    if let Some(language) = audio_language.as_deref().filter(|l| !l.is_empty()) {
        cmd.arg("--audio-language").arg(language);
    }
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

    // stderr thread: forward PROGRESS to the UI; surface CLI logs to the console
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
                // per-clip completion; the export UI tracks the aggregate bar only
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

    // the CLI prints a final JSON summary to stdout in --ipc mode
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

/// Map a pass id to its CLI subcommand and whether it needs the optional AI env.
/// dead frames is opencv-only, so it runs on the bundled sidecar; depth and
/// interpolation need torch
fn pass_cli_command(pass: &str) -> Result<(&'static str, bool), String> {
    match pass {
        "depth" => Ok(("depth-map", true)),
        "deadframes" => Ok(("deadframes", false)),
        "interpolate" => Ok(("interpolate", true)),
        other => Err(format!("Unknown export pass: {other}")),
    }
}

/// run one post-export pass (`depth`/`deadframes`/`interpolate`) on `input_path`
/// via `amverge <cmd> <input> -o <output> --ipc [args]`. streams `PROGRESS|` and
/// `PREVIEW_FRAME|` as `pass_progress`/`pass_preview` events, other lines as
/// `pass_log`. reuses the export abort state so `abort_export` stops it. returns
/// the output path on success
#[tauri::command]
pub async fn run_export_pass(
    app: AppHandle,
    abort_state: State<'_, ExportAbortState>,
    pass: String,
    input_path: String,
    output_path: String,
    args: Vec<String>,
    delete_input: Option<bool>,
) -> Result<String, String> {
    let (cli_cmd, needs_ai) = pass_cli_command(&pass)?;

    if !std::path::Path::new(&input_path).exists() {
        return Err(format!("Pass input no longer exists: {}", file_name_only(&input_path)));
    }
    if let Some(parent) = std::path::Path::new(&output_path).parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    abort_state.abort_requested.store(false, Ordering::SeqCst);
    let abort_requested = abort_state.abort_requested.clone();
    let active_pids = abort_state.pids.clone();

    let mut cmd = if needs_ai {
        amverge_ai_command(&app)?
    } else {
        amverge_command(&app)?
    };
    cmd.arg(cli_cmd)
        .arg(&input_path)
        .arg("--output")
        .arg(&output_path)
        .arg("--ipc");
    for a in &args {
        cmd.arg(a);
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    console_log(
        "PASS|spawn",
        &format!("pass={pass} in={} out={}", file_name_only(&input_path), file_name_only(&output_path)),
    );

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn amverge {cli_cmd}: {e}"))?;
    let child_pid = child.id();
    if let Ok(mut lock) = active_pids.lock() {
        lock.push(child_pid);
    }

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let app_for_err = app.clone();
    let pass_for_err = pass.clone();
    let stderr_accum = Arc::new(Mutex::new(String::new()));
    let stderr_accum_thread = Arc::clone(&stderr_accum);
    let stderr_handle = tokio::task::spawn_blocking(move || {
        for line in BufReader::new(stderr).lines().flatten() {
            if let Some(rest) = line.strip_prefix("PROGRESS|") {
                let mut parts = rest.splitn(2, '|');
                let pct = parts.next().unwrap_or("");
                let msg = parts.next().unwrap_or("").to_string();
                if let Ok(p) = pct.parse::<u8>() {
                    let _ = app_for_err.emit(
                        "pass_progress",
                        PassProgressPayload { pass: pass_for_err.clone(), percent: p, message: msg },
                    );
                }
            } else if let Some(rest) = line.strip_prefix("PREVIEW_FRAME|") {
                let parts: Vec<&str> = rest.splitn(3, '|').collect();
                if parts.len() == 3 {
                    if let Ok(seq) = parts[2].trim().parse::<u64>() {
                        let _ = app_for_err.emit(
                            "pass_preview",
                            PassPreviewPayload {
                                pass: pass_for_err.clone(),
                                path: parts[1].to_string(),
                                seq,
                            },
                        );
                    }
                }
            } else if !line.trim().is_empty() {
                if let Ok(mut acc) = stderr_accum_thread.lock() {
                    acc.push_str(&line);
                    acc.push('\n');
                }
                let sanitized = sanitize_for_console(&line);
                let _ = app_for_err.emit(
                    "pass_log",
                    PassLogPayload { pass: pass_for_err.clone(), line: sanitized.clone() },
                );
                console_log("PASS|cli", &sanitized);
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
    let _ = stdout_string;

    let _ = stderr_handle.await;
    let status = tokio::task::spawn_blocking(move || child.wait())
        .await
        .map_err(|e| format!("wait thread panicked: {e}"))?
        .map_err(|e| format!("Failed waiting for amverge {cli_cmd}: {e}"))?;

    if let Ok(mut lock) = active_pids.lock() {
        lock.retain(|p| *p != child_pid);
    }

    if abort_requested.load(Ordering::SeqCst) {
        let _ = std::fs::remove_file(&output_path);
        return Err("Pass canceled.".to_string());
    }

    if status.success() && std::path::Path::new(&output_path).exists() {
        if delete_input.unwrap_or(false) {
            let _ = std::fs::remove_file(&input_path);
        }
        console_log("PASS|end", &format!("pass={pass} ok"));
        return Ok(output_path);
    }

    let err = stderr_accum.lock().map(|s| s.trim().to_string()).unwrap_or_default();
    console_log("ERROR|run_export_pass", &format!("pass={pass} exit={status}"));
    Err(if err.is_empty() { format!("{pass} pass failed ({status})") } else { err })
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

/// delete the per-clip files an export produced once the merged output exists.
/// only removes files sitting directly in `dir`, so a bad path can never reach
/// A scratch folder for the per-clip parts a merged export builds from.
///
/// interpolation has to run clip by clip, so a merged export with that pass
/// enabled must cut the clips before it can join them. those parts are nobody's
/// deliverable, so they are staged here instead of in the folder the user
/// picked, which then only ever receives the merged result
#[tauri::command]
pub async fn create_export_staging_dir() -> Result<String, String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);

    let dir = std::env::temp_dir().join(format!("amverge_merge_{}_{}", std::process::id(), stamp));
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create staging folder: {e}"))?;

    Ok(dir.to_string_lossy().to_string())
}

/// removes a staging folder created above. refuses anything that is not one of
/// ours inside the system temp directory, so a bad path cannot delete a tree
/// that matters
#[tauri::command]
pub async fn delete_export_staging_dir(dir: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(&dir);

    let is_ours = path.starts_with(std::env::temp_dir())
        && path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.starts_with("amverge_merge_"));

    if !is_ours {
        return Err("Refusing to remove a folder outside export staging.".to_string());
    }

    if path.exists() {
        let _ = std::fs::remove_dir_all(&path);
    }

    Ok(())
}

/// outside the export folder the user picked
#[tauri::command]
pub async fn delete_export_intermediates(dir: String, paths: Vec<String>) -> Result<(), String> {
    let dir_path = std::path::PathBuf::from(&dir);

    for candidate in paths {
        let path = std::path::PathBuf::from(&candidate);
        if path.parent() != Some(dir_path.as_path()) {
            continue;
        }
        let _ = std::fs::remove_file(&path);
    }

    Ok(())
}

#[cfg(test)]
mod staging_tests {
    /// mirrors the guard in `delete_export_staging_dir`
    fn is_ours(path: &std::path::Path) -> bool {
        path.starts_with(std::env::temp_dir())
            && path
                .file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("amverge_merge_"))
    }

    #[test]
    fn accepts_only_our_own_staging_folders() {
        let ours = std::env::temp_dir().join("amverge_merge_123_456");
        assert!(is_ours(&ours), "a folder we created must be removable");

        // anything else must be refused, however it is dressed up
        for bad in [
            std::env::temp_dir().join("something_else"),
            std::env::temp_dir(),
            std::path::PathBuf::from(r"C:\Windows"),
            std::path::PathBuf::from("/"),
            std::path::PathBuf::from(r"D:\Videosmverge_merge_123"),
        ] {
            assert!(!is_ours(&bad), "must refuse {}", bad.display());
        }
    }

    #[test]
    fn created_dir_is_ours_and_removable() {
        let dir = std::env::temp_dir().join(format!("amverge_merge_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("part_0000.mp4"), b"x").unwrap();

        assert!(is_ours(&dir));
        std::fs::remove_dir_all(&dir).unwrap();
        assert!(!dir.exists(), "staging folder and its contents are gone");
    }
}
