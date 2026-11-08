//! Tools: one video in, one upscale or depth map out. the passes decode with OpenCV, which reads the common codecs
//! but not every container or codec the app can play, so anything else is first re-encoded to an H.264 intermediate

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::Ordering;

use tauri::{AppHandle, Manager, State};

#[cfg(not(windows))]
use std::os::unix::process::CommandExt;

use crate::state::ExportAbortState;
use crate::utils::ffmpeg::resolve_bundled_tool;
use crate::utils::logging::console_log;
use crate::utils::paths::file_name_only;
use crate::utils::process::{apply_no_window, bind_to_app_lifetime, output_bound};

/// video codecs the passes' OpenCV build decodes reliably; anything else is converted first
const DIRECT_CODECS: &[&str] = &[
    "h264", "hevc", "mpeg4", "mpeg2video", "mjpeg", "prores", "vp8", "vp9", "dnxhd",
];
/// containers OpenCV opens without trouble
const DIRECT_CONTAINERS: &[&str] = &["mp4", "mov", "m4v", "mkv", "avi", "webm"];

fn tools_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("tools_inputs");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create the tools folder: {e}"))?;
    Ok(dir)
}

/// the first video stream's codec, None when ffprobe can't say
fn probe_video_codec(app: &AppHandle, input: &Path) -> Option<String> {
    let ffprobe = resolve_bundled_tool(app, "ffprobe").ok()?;
    let mut cmd = Command::new(ffprobe);
    apply_no_window(&mut cmd);
    cmd.args([
        "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name",
        "-of", "default=nw=1:nk=1",
    ]);
    cmd.arg(input);
    let output = output_bound(&mut cmd).ok()?;
    if !output.status.success() {
        return None;
    }
    let codec = String::from_utf8_lossy(&output.stdout).trim().to_lowercase();
    (!codec.is_empty()).then_some(codec)
}

/// whether the passes can read this file as it is
fn reads_directly(path: &Path, codec: Option<&str>) -> bool {
    let container_ok = path
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| DIRECT_CONTAINERS.contains(&ext.to_lowercase().as_str()));
    container_ok && codec.is_some_and(|codec| DIRECT_CODECS.contains(&codec))
}

/// the file a Tools run feeds the pass: the input itself when it reads directly, else a high-quality H.264 copy
/// (also used for a range inside a source, and with `force` after a direct run failed). Stop kills it like a pass
#[tauri::command]
pub async fn tools_prepare_input(
    app: AppHandle,
    abort_state: State<'_, ExportAbortState>,
    input_path: String,
    start_sec: Option<f64>,
    end_sec: Option<f64>,
    force: Option<bool>,
) -> Result<String, String> {
    let input = PathBuf::from(&input_path);
    if !input.is_file() {
        return Err(format!("File not found: {}", file_name_only(&input_path)));
    }

    let range = match (start_sec, end_sec) {
        (Some(start), Some(end)) if end > start && start >= 0.0 => Some((start, end - start)),
        (None, None) => None,
        _ => return Err("Invalid clip range.".to_string()),
    };

    if range.is_none() && !force.unwrap_or(false) {
        let codec = probe_video_codec(&app, &input);
        if reads_directly(&input, codec.as_deref()) {
            return Ok(input_path);
        }
        console_log(
            "TOOLS|prepare",
            &format!("converting {} ({})", file_name_only(&input_path), codec.as_deref().unwrap_or("unknown codec")),
        );
    }

    // one run at a time, so the previous run's intermediate is never needed again
    let dir = tools_dir(&app)?;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let _ = std::fs::remove_file(entry.path());
        }
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let output = dir.join(format!("input_{stamp}.mp4"));

    let ffmpeg = resolve_bundled_tool(&app, "ffmpeg")?;
    abort_state.abort_requested.store(false, Ordering::SeqCst);
    let abort_requested = abort_state.abort_requested.clone();
    let pids = abort_state.pids.clone();
    let out_path = output.clone();

    let result = tokio::task::spawn_blocking(move || {
        let mut cmd = Command::new(&ffmpeg);
        apply_no_window(&mut cmd);
        #[cfg(not(windows))]
        cmd.process_group(0);
        cmd.args(["-y", "-hide_banner", "-loglevel", "error"]);
        if let Some((start, _)) = range {
            cmd.args(["-ss", &format!("{start:.3}")]);
        }
        cmd.arg("-i").arg(&input);
        if let Some((_, duration)) = range {
            cmd.args(["-t", &format!("{duration:.3}")]);
        }
        // visually lossless 8-bit H.264, which every pass reads; the pass re-encodes its own output anyway
        cmd.args(["-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "12"]);
        cmd.args(["-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k"]);
        cmd.arg(&out_path);

        let child = cmd
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to run ffmpeg: {e}"))?;
        let pid = child.id();
        bind_to_app_lifetime(pid);
        if let Ok(mut list) = pids.lock() {
            list.push(pid);
        }
        let output = child.wait_with_output().map_err(|e| format!("Failed waiting for ffmpeg: {e}"))?;
        if let Ok(mut list) = pids.lock() {
            list.retain(|p| *p != pid);
        }
        Ok::<_, String>(output)
    })
    .await
    .map_err(|e| format!("ffmpeg task panicked: {e}"))??;

    if abort_requested.load(Ordering::SeqCst) {
        let _ = std::fs::remove_file(&output);
        return Err("Stopped.".to_string());
    }
    if !result.status.success() {
        let _ = std::fs::remove_file(&output);
        let stderr = String::from_utf8_lossy(&result.stderr);
        let reason = stderr.lines().rev().find(|line| !line.trim().is_empty()).unwrap_or("unknown error");
        return Err(format!("Could not read this video: {reason}"));
    }

    Ok(output.to_string_lossy().to_string())
}

/// where Generate renders: the app cache, cleared each time (a file the viewer still holds stays until released);
/// Export copies the result from here to the user's folder
#[tauri::command]
pub fn tools_generated_output(app: AppHandle, base: String) -> Result<String, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("tools_results");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create the results folder: {e}"))?;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let _ = std::fs::remove_file(entry.path());
        }
    }
    // a bare file name, so a base can never point outside the folder
    let name = Path::new(&base)
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| !n.is_empty())
        .unwrap_or("result");
    Ok(dir.join(format!("{name}.mp4")).to_string_lossy().to_string())
}

/// copies a generated result to where the user saves it; over an existing file only when they confirmed that
/// (the save dialog asks before it returns a taken name)
#[tauri::command]
pub async fn tools_export_result(from: String, to: String, overwrite: Option<bool>) -> Result<String, String> {
    let source = PathBuf::from(&from);
    if !source.is_file() {
        return Err("The generated result is gone. Generate it again.".to_string());
    }
    let target = PathBuf::from(&to);
    if target.exists() && !overwrite.unwrap_or(false) {
        return Err(format!("{} already exists.", file_name_only(&to)));
    }
    tokio::task::spawn_blocking(move || {
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create the folder: {e}"))?;
        }
        std::fs::copy(&source, &target).map_err(|e| format!("Could not save the result: {e}"))?;
        Ok::<_, String>(())
    })
    .await
    .map_err(|e| format!("Export task panicked: {e}"))??;
    Ok(to)
}

#[derive(serde::Serialize)]
pub struct VideoSize {
    width: u32,
    height: u32,
}

/// a video's real frame size, for the labels under Tools' players (what plays there may be a smaller copy)
#[tauri::command]
pub async fn tools_video_size(app: AppHandle, path: String) -> Result<VideoSize, String> {
    let ffprobe = resolve_bundled_tool(&app, "ffprobe")?;
    let output = tokio::task::spawn_blocking(move || {
        let mut cmd = Command::new(ffprobe);
        apply_no_window(&mut cmd);
        cmd.args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0"]);
        cmd.arg(&path);
        output_bound(&mut cmd)
    })
    .await
    .map_err(|e| format!("ffprobe task panicked: {e}"))?
    .map_err(|e| format!("Failed to run ffprobe: {e}"))?;

    let text = String::from_utf8_lossy(&output.stdout);
    let (w, h) = text
        .trim()
        .split_once('x')
        .ok_or_else(|| "Could not read the video's size.".to_string())?;
    Ok(VideoSize {
        width: w.trim().parse().map_err(|_| "Could not read the video's size.".to_string())?,
        height: h.trim().parse().map_err(|_| "Could not read the video's size.".to_string())?,
    })
}

/// the export encoder's crf and x264 preset per upscale quality; mirrors the CLI's `upscaling/registry.json`
/// `presets`, and the depth pass's fixed crf 18 / medium in `depth/depth_map.py`. change them together
fn export_encoder(kind: &str, quality: &str) -> (u32, &'static str) {
    match (kind, quality) {
        ("depth", _) => (18, "medium"),
        (_, "archival") => (14, "slow"),
        (_, "balanced") => (20, "medium"),
        (_, "fast") => (22, "veryfast"),
        _ => (17, "slow"),
    }
}

fn live_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("tools_live");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create the live preview folder: {e}"))?;
    Ok(dir)
}

/// the input's color tags, which the CLI copies onto the upscale (`get_color_args`); probed once per input
fn color_args(app: &AppHandle, input: &Path) -> Vec<String> {
    static CACHE: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<PathBuf, Vec<String>>>> =
        std::sync::OnceLock::new();
    let cache = CACHE.get_or_init(Default::default);
    if let Some(hit) = cache.lock().ok().and_then(|map| map.get(input).cloned()) {
        return hit;
    }

    let mut args = Vec::new();
    if let Ok(ffprobe) = resolve_bundled_tool(app, "ffprobe") {
        let mut cmd = Command::new(ffprobe);
        apply_no_window(&mut cmd);
        cmd.args([
            "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=color_primaries,color_transfer,color_space,color_range",
            "-of", "default=nw=1",
        ]);
        cmd.arg(input);
        if let Ok(output) = output_bound(&mut cmd) {
            let text = String::from_utf8_lossy(&output.stdout).to_string();
            for (key, flag) in [
                ("color_primaries", "-color_primaries"),
                ("color_transfer", "-color_trc"),
                ("color_space", "-colorspace"),
                ("color_range", "-color_range"),
            ] {
                let value = text
                    .lines()
                    .find_map(|line| line.strip_prefix(&format!("{key}=")))
                    .map(str::trim)
                    .filter(|v| !v.is_empty() && !matches!(v.to_lowercase().as_str(), "unknown" | "n/a" | "reserved"));
                if let Some(value) = value {
                    args.push(flag.to_string());
                    args.push(value.to_string());
                }
            }
        }
    }
    if let Ok(mut map) = cache.lock() {
        map.insert(input.to_path_buf(), args.clone());
    }
    args
}

/// keeps a live frame before the CLI writes over it (it alternates between two files), so a slow encode never
/// shows a newer frame than the one it was placed for
#[tauri::command]
pub fn tools_snapshot_live_frame(app: AppHandle, frame_path: String, seq: u64) -> Result<String, String> {
    let dir = live_dir(&app)?;
    let ext = Path::new(&frame_path).extension().and_then(|e| e.to_str()).unwrap_or("jpg");
    let snapshot = dir.join(format!("frame_{}.{ext}", seq % 6));
    std::fs::copy(&frame_path, &snapshot).map_err(|e| format!("Could not read the live frame: {e}"))?;
    Ok(snapshot.to_string_lossy().to_string())
}

/// one live frame encoded exactly as the export encodes it (x264 crf and preset for the quality, high profile,
/// the CLI pipe's bgr24 to yuv420p conversion, the input's color tags), so the viewer shows what the file will be
#[tauri::command]
pub async fn tools_encode_live_frame(
    app: AppHandle,
    frame_path: String,
    input_path: String,
    kind: String,
    quality: String,
    seq: u64,
) -> Result<String, String> {
    let ffmpeg = resolve_bundled_tool(&app, "ffmpeg")?;
    let dir = live_dir(&app)?;
    // a few slots, so the file the viewer is still showing is never rewritten under it
    let output = dir.join(format!("live_{}.mp4", seq % 4));
    let (crf, preset) = export_encoder(&kind, &quality);
    let colors = if kind == "depth" { Vec::new() } else { color_args(&app, Path::new(&input_path)) };

    let out = output.clone();
    let result = tokio::task::spawn_blocking(move || {
        let mut cmd = Command::new(&ffmpeg);
        apply_no_window(&mut cmd);
        cmd.args(["-y", "-hide_banner", "-loglevel", "error", "-i"]);
        cmd.arg(&frame_path);
        // the CLI hands the encoder bgr24 frames; going through bgr24 here gives the same yuv conversion
        cmd.args(["-frames:v", "1", "-vf", "format=bgr24", "-c:v", "libx264"]);
        cmd.args(["-crf", &crf.to_string(), "-preset", preset, "-profile:v", "high", "-pix_fmt", "yuv420p"]);
        cmd.args(&colors);
        cmd.args(["-an", "-movflags", "+faststart"]);
        cmd.arg(&out);
        output_bound(&mut cmd).map_err(|e| format!("Failed to run ffmpeg: {e}"))
    })
    .await
    .map_err(|e| format!("ffmpeg task panicked: {e}"))??;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(format!("Could not encode the live frame: {}", stderr.lines().last().unwrap_or("unknown error")));
    }
    Ok(output.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_common_codecs_in_common_containers_directly() {
        assert!(reads_directly(Path::new("a.mp4"), Some("h264")));
        assert!(reads_directly(Path::new("a.MKV"), Some("hevc")));
        assert!(reads_directly(Path::new("a.mov"), Some("prores")));
    }

    #[tokio::test]
    async fn export_copies_the_result_and_never_overwrites() {
        let tmp = tempfile::tempdir().unwrap();
        let generated = tmp.path().join("cache/clip_upscaled.mp4");
        std::fs::create_dir_all(generated.parent().unwrap()).unwrap();
        std::fs::write(&generated, b"video").unwrap();
        let target = tmp.path().join("out/clip_upscaled.mp4");

        let saved = tools_export_result(generated.to_string_lossy().into(), target.to_string_lossy().into(), None)
            .await
            .unwrap();
        assert_eq!(std::fs::read(&saved).unwrap(), b"video");
        assert!(generated.exists(), "the viewer still plays the generated copy");

        let again = tools_export_result(generated.to_string_lossy().into(), target.to_string_lossy().into(), None).await;
        assert!(again.is_err());

        // confirmed in the save dialog
        std::fs::write(&generated, b"newer").unwrap();
        tools_export_result(generated.to_string_lossy().into(), target.to_string_lossy().into(), Some(true))
            .await
            .unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"newer");
    }

    #[tokio::test]
    async fn export_says_so_when_the_result_is_gone() {
        let tmp = tempfile::tempdir().unwrap();
        let err = tools_export_result(
            tmp.path().join("missing.mp4").to_string_lossy().into(),
            tmp.path().join("out.mp4").to_string_lossy().into(),
            None,
        )
        .await
        .unwrap_err();
        assert!(err.contains("Generate it again"));
    }

    #[test]
    fn converts_other_codecs_containers_and_unknowns() {
        assert!(!reads_directly(Path::new("a.mkv"), Some("av1")));
        assert!(!reads_directly(Path::new("a.mp4"), None));
        assert!(!reads_directly(Path::new("a.ts"), Some("h264")));
        assert!(!reads_directly(Path::new("a.wmv"), Some("wmv3")));
    }
}
