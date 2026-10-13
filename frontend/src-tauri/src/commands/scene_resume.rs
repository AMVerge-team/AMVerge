//! resuming a paused video-mode episode: an import that stopped early (CLI mini
//! window or app closed) left scenes with no cut clip or poster. this finishes
//! them with `materialize-clips`, streaming the same clip_ready/thumbnail_ready
//! events a live import does

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use crate::commands::scenepacks::{run_materialize_clips, MaterializeClipSpec, MaterializedClip};
use crate::payloads::{ClipReadyPayload, ThumbnailReadyPayload};
use crate::state::ActiveResume;
use crate::utils::logging::{console_log, sanitize_for_console};
use crate::utils::process::kill_process_tree;

/// one video-mode scene the app still shows as unfinished
#[derive(serde::Deserialize)]
pub struct ResumeClipSpec {
    scene_index: u32,
    source_path: String,
    start_sec: f64,
    end_sec: f64,
    clip_path: Option<String>,
    clip_mode: Option<String>,
    // the poster path the CLI promised: <episode>/scenes/scene_XXXX.jpg
    thumbnail: String,
}

fn emit_resumed_clip(app: &AppHandle, episode_cache_id: &str, idx: u32, clip_path: Option<String>, clip_mode: &str) {
    let _ = app.emit(
        "clip_ready",
        ClipReadyPayload {
            scene_index: idx,
            clip_path,
            clip_mode: clip_mode.to_string(),
            episode_cache_id: Some(episode_cache_id.to_string()),
        },
    );
    // sent even for a failed scene so its skeleton always ends
    let _ = app.emit(
        "thumbnail_ready",
        ThumbnailReadyPayload {
            position: idx,
            episode_cache_id: Some(episode_cache_id.to_string()),
        },
    );
}

/// the cut mode that matches how the episode was imported: keyframe detection
/// copied every scene, AI detection copied only keyframe-exact scenes
fn resume_cut_mode(scenes_dir: &Path) -> &'static str {
    let method = scenes_dir
        .parent()
        .and_then(|dir| fs::read_to_string(dir.join("manifest.json")).ok())
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|m| m.pointer("/source/sceneDetectionMethod")?.as_str().map(String::from));
    match method {
        Some(m) if m.starts_with("keyframe") => "copy",
        _ => "auto",
    }
}

/// moves a finished cut + poster to the scene's usual scene_XXXX names, replacing
/// any half-written file the stopped import left there. returns the final clip path
fn place_resumed_clip(cut: &str, thumb: Option<&str>, thumb_target: &Path) -> String {
    let ext = Path::new(cut).extension().and_then(|e| e.to_str()).unwrap_or("mp4");
    let clip_target = thumb_target.with_extension(ext);
    let _ = fs::remove_file(thumb_target.with_extension("mp4"));
    let _ = fs::remove_file(&clip_target);
    let final_clip = match fs::rename(cut, &clip_target) {
        Ok(()) => clip_target.to_string_lossy().to_string(),
        Err(_) => cut.to_string(),
    };
    if let Some(t) = thumb {
        let _ = fs::remove_file(thumb_target);
        let _ = fs::rename(t, thumb_target);
    }
    final_clip
}

/// true when the jpg was written to the end (ends with the EOI marker). a poster the
/// import was killed in the middle of writing is on disk but cut short, and never loads
fn poster_complete(path: &Path) -> bool {
    use std::io::{Read, Seek, SeekFrom};
    let Ok(mut file) = fs::File::open(path) else { return false };
    let mut tail = [0u8; 2];
    file.seek(SeekFrom::End(-2)).is_ok() && file.read_exact(&mut tail).is_ok() && tail == [0xFF, 0xD9]
}

/// splits the scenes into those still needing a cut and reports the rest: files
/// already on disk are ready, specs with no usable poster path end as failed
fn split_finished(
    clips: Vec<ResumeClipSpec>,
    mut emit_done: impl FnMut(u32, Option<String>, &str),
) -> Vec<ResumeClipSpec> {
    let mut todo = Vec::new();
    for clip in clips {
        let thumb = PathBuf::from(&clip.thumbnail);
        let cut_ok = clip.clip_path.as_deref().is_some_and(|p| Path::new(p).is_file());
        if cut_ok && poster_complete(&thumb) {
            emit_done(
                clip.scene_index,
                clip.clip_path.clone(),
                clip.clip_mode.as_deref().unwrap_or("copy"),
            );
        } else if thumb.extension().and_then(|e| e.to_str()) == Some("jpg") && thumb.parent().is_some() {
            todo.push(clip);
        } else {
            emit_done(clip.scene_index, None, "failed");
        }
    }
    todo
}

/// finishes the cuts/posters a video-mode import left behind when it stopped
/// early. files already on disk are only reported; the rest go to one
/// `materialize-clips` run that copies or re-encodes each scene the way the
/// import would have, into the scene's usual scene_XXXX names
#[tauri::command]
pub async fn resume_episode_clips(
    app: AppHandle,
    resume_state: State<'_, ActiveResume>,
    episode_cache_id: String,
    clips: Vec<ResumeClipSpec>,
) -> Result<(), String> {
    resume_state.cancel_requested.store(false, Ordering::SeqCst);
    // a paused (aborted) resume leaves its remaining clips untouched, never marked failed
    let canceled = || resume_state.cancel_requested.load(Ordering::SeqCst);
    let emit_done = |idx: u32, clip_path: Option<String>, clip_mode: &str| {
        emit_resumed_clip(&app, &episode_cache_id, idx, clip_path, clip_mode)
    };

    let todo = split_finished(clips, emit_done);

    console_log(
        "SCENE|resume",
        &format!("episode={episode_cache_id} recut={}", todo.len()),
    );

    if todo.is_empty() || canceled() {
        return Ok(());
    }
    let scenes_dir = PathBuf::from(&todo[0].thumbnail)
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default();
    // the episode was deleted meanwhile: never recreate its folder
    if !scenes_dir.is_dir() {
        console_log("SCENE|resume", &format!("episode={episode_cache_id} gone, stopping"));
        return Ok(());
    }
    let cut_mode = resume_cut_mode(&scenes_dir);

    let specs: Vec<MaterializeClipSpec> = todo
        .iter()
        .map(|c| MaterializeClipSpec {
            source_path: Some(c.source_path.clone()),
            start_sec: Some(c.start_sec),
            end_sec: Some(c.end_sec),
            existing_clip_path: None,
            existing_thumbnail_path: None,
        })
        .collect();

    // one CLI run, so the source's keyframes are read once; each item is placed
    // and reported the moment it finishes
    let targets: Vec<(u32, PathBuf)> = todo
        .iter()
        .map(|c| (c.scene_index, PathBuf::from(&c.thumbnail)))
        .collect();
    let reported = Arc::new(Mutex::new(HashSet::<usize>::new()));
    let on_item = {
        let app = app.clone();
        let episode = episode_cache_id.clone();
        let reported = Arc::clone(&reported);
        Box::new(move |item: MaterializedClip| {
            let Some((scene_index, thumb_target)) = targets.get(item.index) else { return };
            if let Ok(mut r) = reported.lock() {
                r.insert(item.index);
            }
            match item.clip_path.as_deref() {
                Some(cut) => {
                    let clip = place_resumed_clip(cut, item.thumbnail_path.as_deref(), thumb_target);
                    let mode = item.clip_mode.as_deref().unwrap_or("reencode");
                    emit_resumed_clip(&app, &episode, *scene_index, Some(clip), mode);
                }
                None => emit_resumed_clip(&app, &episode, *scene_index, None, "failed"),
            }
        })
    };

    let result = run_materialize_clips(
        &app,
        &specs,
        &scenes_dir,
        cut_mode,
        false,
        Some(resume_state.pids.clone()),
        Some(on_item),
    )
    .await;

    if canceled() {
        console_log("SCENE|resume", &format!("episode={episode_cache_id} paused"));
        return Ok(());
    }
    if let Err(e) = result {
        console_log("ERROR|resume_episode_clips", &sanitize_for_console(&e));
        // anything the CLI never reported ends as failed instead of loading forever
        let reported = reported.lock().map(|r| r.clone()).unwrap_or_default();
        for (i, c) in todo.iter().enumerate() {
            if !reported.contains(&i) {
                emit_done(c.scene_index, None, "failed");
            }
        }
    }

    Ok(())
}

/// pauses a running resume: kills its cutter, the remaining clips stay unfinished
#[tauri::command]
pub async fn abort_resume_episode(resume_state: State<'_, ActiveResume>) -> Result<(), String> {
    resume_state.cancel_requested.store(true, Ordering::SeqCst);
    let pids: Vec<u32> = resume_state
        .pids
        .lock()
        .map(|mut l| l.drain(..).collect())
        .unwrap_or_default();

    for pid in pids {
        let _ = kill_process_tree(pid);
    }
    Ok(())
}
