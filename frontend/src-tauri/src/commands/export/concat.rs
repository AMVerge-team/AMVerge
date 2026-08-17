//! Export-grade concat of the source segments behind a single grid tile.
//!
//! The import-time similar-scene pass folds several detected scenes into one
//! tile and records every source segment in that tile's `mergedSrcs`. Export
//! needs one output file per tile, but `export_clips` only understands "merge
//! every input into one file" or "one file per input path" — it has no way to
//! express per-tile grouping. Without this step a non-merged export of a single
//! folded tile writes N files, one per segment.
//!
//! So each multi-segment tile is concatenated into one intermediate file first,
//! and the export pass then treats that file as an ordinary single clip. Every
//! existing export setting (workflow, codec, container, audio track, parallel
//! workers, `####` numbering) keeps working unchanged, because by the time
//! `export_clips` runs there is nothing special about these inputs.
//!
//! Deliberately NOT reusing `preview::ensure_merged_preview`: that one maps only
//! `0:v:0` (its no-track-selected branch produces a silent file) and re-encodes
//! the selected track to 160k stereo AAC. Fine for hover previews, unacceptable
//! for an export master. This keeps every audio track and stream-copies through.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::{AppHandle, State};

use crate::state::{ExportAbortState, PreviewProxyLocks};
use crate::utils::ffmpeg::resolve_bundled_tool;
use crate::utils::logging::console_log;
use crate::utils::paths::file_name_only;

use super::progress::{emit_export_progress, export_canceled_error, is_export_cancel_requested};
use super::runner::run_ffmpeg_with_progress;
use super::ExportAbortGuard;

/// Trailing `_NNNN` of a segment filename, e.g. `episode_0007.mp4` -> `0007`.
/// `build_clip_jobs` reads each output's number off this same suffix, so the
/// concatenated file has to carry it or a folded tile would be renumbered by
/// list position instead of keeping its scene number.
fn segment_code(path: &Path) -> String {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .and_then(|stem| stem.rsplit('_').next())
        .filter(|code| !code.is_empty() && code.chars().all(|ch| ch.is_ascii_digit()))
        .unwrap_or("0000")
        .to_string()
}

/// Final and staging paths for a group, both alongside the first segment and
/// keeping its extension — staying in the source container means the export
/// pass probes the same codec it would have on an unmerged clip and applies its
/// own bitstream filter when the target container needs one.
fn merged_export_paths(srcs: &[String]) -> Result<(PathBuf, PathBuf), String> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let first = Path::new(&srcs[0]);
    let parent = first
        .parent()
        .ok_or("Invalid clip path (no parent directory)")?;
    let stem = first
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or("Invalid clip filename")?;
    let ext = first
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("mp4");

    let mut hasher = DefaultHasher::new();
    srcs.hash(&mut hasher);
    let hash = hasher.finish();

    // `_{code}` stays last so the scene number survives into the export name.
    let name = format!("{stem}.mergedexport.{hash:016x}_{}", segment_code(first));
    Ok((
        parent.join(format!("{name}.{ext}")),
        parent.join(format!("{name}.tmp.{ext}")),
    ))
}

async fn concat_group(
    app: &AppHandle,
    ffmpeg: &PathBuf,
    proxy_locks: &State<'_, PreviewProxyLocks>,
    srcs: &[String],
    abort_requested: &Arc<AtomicBool>,
    active_pids: &Arc<Mutex<Vec<u32>>>,
    start_time: Instant,
) -> Result<String, String> {
    let (out_path, tmp_path) = merged_export_paths(srcs)?;

    // Serialise on the output file so two exports of the same tile — or an
    // export racing the grid's download button — can't write it concurrently.
    let lock_key = out_path.to_string_lossy().to_string();
    let group_lock = {
        let mut map = proxy_locks.inner.lock().await;
        map.retain(|_, value| Arc::strong_count(value) > 1);
        map.entry(lock_key)
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
            .clone()
    };
    let _guard = group_lock.lock().await;

    // Keyed by the segment list, so a finished intermediate is reused as-is and
    // re-exporting the same tile costs nothing.
    if let Ok(meta) = std::fs::metadata(&out_path) {
        if meta.is_file() && meta.len() > 0 {
            return Ok(out_path.to_string_lossy().to_string());
        }
    }

    let mut filelist = tempfile::NamedTempFile::new()
        .map_err(|e| format!("Failed to create temp file: {e}"))?;
    for src in srcs {
        writeln!(filelist, "file '{}'", src.replace('\'', "'\\''"))
            .map_err(|e| format!("Failed to write concat list: {e}"))?;
    }
    let filelist_path = filelist
        .path()
        .to_str()
        .ok_or("Invalid concat list path")?
        .to_string();

    let _ = std::fs::remove_file(&tmp_path);
    let out_str = tmp_path
        .to_str()
        .ok_or("Invalid merged clip path")?
        .to_string();
    let ext = out_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let mut args: Vec<String> = vec![
        "-y".into(),
        "-f".into(),
        "concat".into(),
        "-safe".into(),
        "0".into(),
        "-i".into(),
        filelist_path,
        "-map".into(),
        "0:v:0".into(),
        // Keep every audio track: the export pass still has to be able to honour
        // the profile's audio-track selection against this file.
        "-map".into(),
        "0:a?".into(),
        "-c".into(),
        "copy".into(),
    ];
    if ext == "mp4" || ext == "mov" {
        args.extend(["-movflags".into(), "+faststart".into()]);
    }
    args.extend(["-max_muxing_queue_size".into(), "1024".into(), out_str]);

    console_log(
        "EXPORT|concat",
        &format!(
            "{} segment(s) -> {}",
            srcs.len(),
            file_name_only(&out_path.to_string_lossy())
        ),
    );

    let app_for_ffmpeg = app.clone();
    let ffmpeg_clone = ffmpeg.clone();
    let abort_for_run = abort_requested.clone();
    let pids_for_run = active_pids.clone();
    let run_result = tokio::task::spawn_blocking(move || {
        run_ffmpeg_with_progress(
            app_for_ffmpeg,
            ffmpeg_clone,
            args,
            None,
            0,
            None,
            "Preparing merged clip",
            start_time,
            abort_for_run,
            pids_for_run,
            // Per-group messages are emitted by the caller; this pass has no
            // duration total to derive a meaningful percentage from.
            false,
        )
    })
    .await
    .map_err(|e| format!("ffmpeg task panicked: {e}"))?;

    drop(filelist);

    if let Err(err) = run_result {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(err);
    }

    let meta = std::fs::metadata(&tmp_path)
        .map_err(|e| format!("Merged clip was not created: {e}"))?;
    if meta.len() == 0 {
        let _ = std::fs::remove_file(&tmp_path);
        return Err("Merged clip produced an empty file.".to_string());
    }

    match std::fs::remove_file(&out_path) {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("Failed to replace existing merged clip: {e}")),
    }
    if let Err(e) = std::fs::rename(&tmp_path, &out_path) {
        std::fs::copy(&tmp_path, &out_path).map_err(|copy_err| {
            format!("Failed to publish merged clip (rename={e}, copy={copy_err})")
        })?;
        let _ = std::fs::remove_file(&tmp_path);
    }

    Ok(out_path.to_string_lossy().to_string())
}

pub(super) async fn ensure_merged_export_clips_inner(
    app: AppHandle,
    abort_state: State<'_, ExportAbortState>,
    proxy_locks: State<'_, PreviewProxyLocks>,
    groups: Vec<Vec<String>>,
) -> Result<Vec<String>, String> {
    if groups.iter().any(|group| group.is_empty()) {
        return Err("Cannot merge an empty clip group.".to_string());
    }

    // Nothing was folded together, so every group is already a single path and
    // export runs exactly as it did before this step existed.
    let pending = groups.iter().filter(|group| group.len() > 1).count();
    if pending == 0 {
        return Ok(groups
            .into_iter()
            .map(|mut group| group.remove(0))
            .collect());
    }

    // Same abort handshake as `export_clips`: a fresh operation starts
    // uncancelled, and the guard clears the shared state on the way out so the
    // export call that follows this one starts clean.
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

    let ffmpeg = resolve_bundled_tool(&app, "ffmpeg")?;
    let start_time = Instant::now();
    console_log(
        "EXPORT|concat",
        &format!("preparing {pending} merged clip(s)"),
    );

    let mut resolved: Vec<String> = Vec::with_capacity(groups.len());
    let mut done = 0usize;

    for group in &groups {
        if group.len() < 2 {
            resolved.push(group[0].clone());
            continue;
        }

        if is_export_cancel_requested(&abort_requested) {
            return Err(export_canceled_error());
        }

        emit_export_progress(
            &app,
            ((done * 100) / pending) as u8,
            &format!("Preparing merged clip {}/{}...", done + 1, pending),
            start_time,
        );

        resolved.push(
            concat_group(
                &app,
                &ffmpeg,
                &proxy_locks,
                group,
                &abort_requested,
                &active_pids,
                start_time,
            )
            .await?,
        );
        done += 1;
    }

    Ok(resolved)
}
