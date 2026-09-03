use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::{AppHandle, Emitter, Manager, State};
use tokio::task::JoinSet;

#[cfg(unix)]
use std::os::unix::process::CommandExt;

use crate::state::{ActiveFfmpegPids, PreviewProxyLocks, ProxyLockMap};
use crate::utils::ffmpeg::resolve_bundled_tool;
use crate::utils::logging::console_log;
use crate::utils::paths::{file_name_only, resolve_episodes_storage_dir, sanitize_episode_cache_id};
use crate::utils::process::apply_no_window;

use super::fingerprint::{
    cached_fingerprint, content_fingerprint, preview_cache_key_with_fingerprint,
    sanitize_scene_time_window, FingerprintCache,
};
use super::types::{
    SceneWebpBatchItem, SceneWebpBatchResult, SceneWebpJob, SceneWebpReadyPayload, SceneWebpResult,
};

pub(crate) const SCENE_WEBP_MAX_CONCURRENCY: usize = 8;

pub(crate) fn scene_webp_concurrency() -> usize {
    std::thread::available_parallelism()
        .map(|n| (n.get() / 2).max(2))
        .unwrap_or(2)
        .min(SCENE_WEBP_MAX_CONCURRENCY)
}

pub(crate) fn resolve_scene_webp_cache_base(
    app: &AppHandle,
    episode_cache_id: Option<&str>,
    custom_path: Option<&str>,
) -> Result<PathBuf, String> {
    let base = if let Some(raw_id) = episode_cache_id {
        let id = sanitize_episode_cache_id(raw_id)?;
        resolve_episodes_storage_dir(app, custom_path)?.join(id).join("scenes")
    } else {
        app.path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("preview_webp_cache")
    };

    std::fs::create_dir_all(&base)
        .map_err(|e| format!("Failed to create WebP cache directory '{}': {e}", base.display()))?;

    Ok(base)
}

pub(crate) async fn generate_scene_webp_inner(
    app: AppHandle,
    proxy_locks: ProxyLockMap,
    ffmpeg_pids: Arc<Mutex<Vec<u32>>>,
    fingerprint_cache: FingerprintCache,
    scene_id: String,
    source_path: String,
    start: f64,
    end: f64,
    fps: Option<u32>,
    episode_cache_id: Option<String>,
    custom_path: Option<String>,
    kind: Option<String>,
) -> Result<SceneWebpResult, String> {
    let input_path = PathBuf::from(&source_path);
    if !input_path.is_file() {
        return Err(format!("Scene source is missing or not a file: {}", input_path.display()));
    }

    let is_poster = kind.as_deref() == Some("poster");
    let frame_rate = fps.unwrap_or(8).clamp(1, 24);
    let (safe_start, safe_end, duration) = sanitize_scene_time_window(start, end);

    let fingerprint = cached_fingerprint(&fingerprint_cache, &input_path)?;
    let key = preview_cache_key_with_fingerprint(
        &fingerprint,
        safe_start,
        safe_end,
        frame_rate,
        is_poster,
    );
    let base = resolve_scene_webp_cache_base(
        &app,
        episode_cache_id.as_deref(),
        custom_path.as_deref(),
    )?;
    let prefix = if is_poster { "poster" } else { "scene" };
    let webp_path = base.join(format!("{prefix}_{key}.webp"));
    let webp_tmp_path = webp_path.with_extension("tmp.webp");

    let lock_key = webp_path.to_string_lossy().to_string();
    let clip_lock = {
        let mut map = proxy_locks.lock().await;
        map.retain(|_, v| Arc::strong_count(v) > 1);
        map.entry(lock_key)
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
            .clone()
    };
    let _guard = clip_lock.lock().await;

    if let Ok(meta) = std::fs::metadata(&webp_path) {
        if meta.is_file() && meta.len() > 1024 {
            return Ok(SceneWebpResult {
                scene_id,
                path: webp_path.to_string_lossy().to_string(),
                duration,
                cached: true,
            });
        }
    }

    let ffmpeg = resolve_bundled_tool(&app, "ffmpeg")?;
    let vf = if is_poster {
        "scale=-2:240:flags=fast_bilinear".to_string()
    } else {
        format!("fps={frame_rate},scale=-2:240:flags=fast_bilinear")
    };
    let _ = std::fs::remove_file(&webp_tmp_path);

    let ffmpeg_clone = ffmpeg.clone();
    let input = input_path.clone();
    let output = webp_tmp_path.clone();
    let pids = ffmpeg_pids.clone();

    let encode_started = Instant::now();
    let ffmpeg_output = tokio::task::spawn_blocking(move || {
        let mut cmd = Command::new(&ffmpeg_clone);
        apply_no_window(&mut cmd);
        #[cfg(not(windows))]
        cmd.process_group(0);
        const PRE_SEEK_OFFSET: f64 = 0.5;
        let pre_seek = (safe_start - PRE_SEEK_OFFSET).max(0.0);
        let post_seek = safe_start - pre_seek;

        cmd.args(["-y"]);
        if pre_seek > 0.0 {
            cmd.args(["-ss", &format!("{pre_seek:.3}")]);
        }
        cmd.arg("-i");
        cmd.arg(&input);
        cmd.args(["-ss", &format!("{post_seek:.3}")]);
        if !is_poster {
            cmd.args(["-t", &format!("{duration:.3}")]);
        }
        if is_poster {
            cmd.args([
                "-frames:v",
                "1",
                "-an",
                "-vf",
                &vf,
                "-c:v",
                "libwebp",
                "-threads",
                "2",
                "-lossless",
                "0",
                "-compression_level",
                "4",
                "-q:v",
                "70",
            ]);
        } else {
            cmd.args([
                "-an",
                "-vf",
                &vf,
                "-c:v",
                "libwebp",
                "-threads",
                "2",
                "-lossless",
                "0",
                "-compression_level",
                "0",
                "-q:v",
                "48",
                "-loop",
                "0",
            ]);
        }
        cmd.arg(&output);

        let child = cmd
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to run ffmpeg: {e}"))?;
        let pid = child.id();
        if let Ok(mut l) = pids.lock() { l.push(pid); }
        let result = child.wait_with_output().map_err(|e| format!("Failed waiting for ffmpeg: {e}"))?;
        if let Ok(mut l) = pids.lock() { l.retain(|p| *p != pid); }
        Ok::<std::process::Output, String>(result)
    })
    .await
    .map_err(|e| format!("ffmpeg task panicked: {e}"))??;

    if !ffmpeg_output.status.success() {
        let _ = std::fs::remove_file(&webp_tmp_path);
        let stderr = String::from_utf8_lossy(&ffmpeg_output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "FFmpeg WebP generation failed".to_string()
        } else {
            format!("FFmpeg WebP generation failed: {stderr}")
        });
    }

    let meta = std::fs::metadata(&webp_tmp_path).map_err(|e| e.to_string())?;
    if meta.len() <= 1024 {
        let _ = std::fs::remove_file(&webp_tmp_path);
        return Err("WebP generation produced an invalid file".to_string());
    }

    match std::fs::remove_file(&webp_path) {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("Failed to remove existing WebP: {e}")),
    }

    if let Err(e) = std::fs::rename(&webp_tmp_path, &webp_path) {
        std::fs::copy(&webp_tmp_path, &webp_path)
            .map_err(|copy_err| format!("Failed to publish WebP (rename={e}, copy={copy_err})"))?;
        let _ = std::fs::remove_file(&webp_tmp_path);
    }

    console_log(
        "WEBP|ready",
        &format!(
            "scene={} encode_ms={} path={}",
            scene_id,
            encode_started.elapsed().as_millis(),
            file_name_only(&webp_path.to_string_lossy())
        ),
    );

    Ok(SceneWebpResult {
        scene_id,
        path: webp_path.to_string_lossy().to_string(),
        duration,
        cached: false,
    })
}

pub(crate) async fn run_scene_webp_job(
    app: AppHandle,
    proxy_locks: ProxyLockMap,
    ffmpeg_pids: Arc<Mutex<Vec<u32>>>,
    fingerprint_cache: FingerprintCache,
    job: SceneWebpJob,
) -> Result<SceneWebpResult, String> {
    generate_scene_webp_inner(
        app,
        proxy_locks,
        ffmpeg_pids,
        fingerprint_cache,
        job.scene_id,
        job.source_path,
        job.start,
        job.end,
        job.fps,
        job.episode_cache_id,
        job.custom_path,
        job.kind,
    )
    .await
}

pub(crate) fn list_dir_file_sizes(dir: &Path) -> HashMap<String, u64> {
    let mut map = HashMap::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    if let Some(name) = entry.file_name().to_str() {
                        map.insert(name.to_string(), meta.len());
                    }
                }
            }
        }
    }
    map
}

pub(crate) fn lookup_scene_webp_cache_item(
    app: &AppHandle,
    fingerprint_cache: &mut HashMap<String, String>,
    dir_cache: &mut HashMap<String, HashMap<String, u64>>,
    job: SceneWebpJob,
) -> SceneWebpBatchItem {
    let scene_id = job.scene_id.clone();
    let is_poster = job.kind.as_deref() == Some("poster");
    let frame_rate = job.fps.unwrap_or(8).clamp(1, 24);
    let (safe_start, safe_end, duration) = sanitize_scene_time_window(job.start, job.end);

    let source = PathBuf::from(&job.source_path);
    if !source.is_file() {
        return SceneWebpBatchItem {
            scene_id,
            path: None,
            duration: Some(duration),
            cached: false,
            error: Some(format!("Scene source is missing or not a file: {}", source.display())),
        };
    }

    let base = match resolve_scene_webp_cache_base(
        app,
        job.episode_cache_id.as_deref(),
        job.custom_path.as_deref(),
    ) {
        Ok(base) => base,
        Err(error) => {
            return SceneWebpBatchItem {
                scene_id,
                path: None,
                duration: Some(duration),
                cached: false,
                error: Some(error),
            }
        }
    };

    let source_key = source.to_string_lossy().to_string();
    let fingerprint = if let Some(cached) = fingerprint_cache.get(&source_key) {
        cached.clone()
    } else {
        match content_fingerprint(&source) {
            Ok(fp) => {
                fingerprint_cache.insert(source_key.clone(), fp.clone());
                fp
            }
            Err(error) => {
                return SceneWebpBatchItem {
                    scene_id,
                    path: None,
                    duration: Some(duration),
                    cached: false,
                    error: Some(error),
                }
            }
        }
    };

    let key = preview_cache_key_with_fingerprint(
        &fingerprint,
        safe_start,
        safe_end,
        frame_rate,
        is_poster,
    );
    let prefix = if is_poster { "poster" } else { "scene" };
    let file_name = format!("{prefix}_{key}.webp");
    let cache_path = base.join(&file_name);

    let base_key = base.to_string_lossy().to_string();
    let dir_entries = dir_cache
        .entry(base_key)
        .or_insert_with(|| list_dir_file_sizes(&base));
    let exists = dir_entries
        .get(&file_name)
        .map_or(false, |&len| len > 1024);

    SceneWebpBatchItem {
        scene_id,
        path: if exists {
            Some(cache_path.to_string_lossy().to_string())
        } else {
            None
        },
        duration: Some(duration),
        cached: exists,
        error: None,
    }
}

pub(crate) fn batch_item_from_result(
    scene_id: String,
    result: Result<SceneWebpResult, String>,
) -> SceneWebpBatchItem {
    match result {
        Ok(ok) => SceneWebpBatchItem {
            scene_id: ok.scene_id,
            path: Some(ok.path),
            duration: Some(ok.duration),
            cached: ok.cached,
            error: None,
        },
        Err(error) => SceneWebpBatchItem {
            scene_id,
            path: None,
            duration: None,
            cached: false,
            error: Some(error),
        },
    }
}

#[tauri::command]
pub async fn generate_scene_webp(
    app: AppHandle,
    proxy_locks: State<'_, PreviewProxyLocks>,
    ffmpeg_pids: State<'_, ActiveFfmpegPids>,
    scene_id: String,
    source_path: String,
    start: f64,
    end: f64,
    fps: Option<u32>,
    episode_cache_id: Option<String>,
    custom_path: Option<String>,
    kind: Option<String>,
) -> Result<SceneWebpResult, String> {
    run_scene_webp_job(
        app.clone(),
        proxy_locks.inner.clone(),
        ffmpeg_pids.pids.clone(),
        Arc::new(Mutex::new(HashMap::new())),
        SceneWebpJob {
            scene_id,
            source_path,
            start,
            end,
            fps,
            episode_cache_id,
            custom_path,
            kind,
        },
    )
    .await
}

#[tauri::command]
pub async fn generate_scene_webp_batch(
    app: AppHandle,
    proxy_locks: State<'_, PreviewProxyLocks>,
    ffmpeg_pids: State<'_, ActiveFfmpegPids>,
    jobs: Vec<SceneWebpJob>,
) -> Result<SceneWebpBatchResult, String> {
    let proxy_locks = proxy_locks.inner.clone();
    let ffmpeg_pids = ffmpeg_pids.pids.clone();
    let fingerprint_cache: FingerprintCache = Arc::new(Mutex::new(HashMap::new()));

    // fingerprint each unique source exactly once, off the async runtime, so the
    // concurrent encode tasks below never block a worker thread computing cache
    // keys (a batch of scenes from one episode all share the same fingerprint)
    {
        let unique_sources: BTreeSet<String> =
            jobs.iter().map(|job| job.source_path.clone()).collect();
        let cache = fingerprint_cache.clone();
        let _ = tokio::task::spawn_blocking(move || {
            for source in unique_sources {
                let path = PathBuf::from(&source);
                if path.is_file() {
                    let _ = cached_fingerprint(&cache, &path);
                }
            }
        })
        .await;
    }

    let concurrency = scene_webp_concurrency().max(1);
    let mut items: Vec<SceneWebpBatchItem> = Vec::with_capacity(jobs.len());
    let mut set: JoinSet<(String, Result<SceneWebpResult, String>)> = JoinSet::new();
    let mut iter = jobs.into_iter();

    macro_rules! spawn_next {
        () => {{
            if let Some(job) = iter.next() {
                let scene_id = job.scene_id.clone();
                let app = app.clone();
                let proxy_locks = proxy_locks.clone();
                let ffmpeg_pids = ffmpeg_pids.clone();
                let fingerprint_cache = fingerprint_cache.clone();
                set.spawn(async move {
                    let result =
                        run_scene_webp_job(app, proxy_locks, ffmpeg_pids, fingerprint_cache, job)
                            .await;
                    (scene_id, result)
                });
            }
        }};
    }

    for _ in 0..concurrency {
        spawn_next!();
    }

    while let Some(joined) = set.join_next().await {
        match joined {
            Ok((scene_id, result)) => {
                if let Ok(ok) = &result {
                    let _ = app.emit(
                        "scene_webp_ready",
                        SceneWebpReadyPayload {
                            scene_id: ok.scene_id.clone(),
                            path: ok.path.clone(),
                        },
                    );
                }
                items.push(batch_item_from_result(scene_id, result));
            }
            Err(e) => console_log("ERROR|webp_batch", &format!("encode task failed: {e}")),
        }
        spawn_next!();
    }

    Ok(SceneWebpBatchResult { items })
}

#[tauri::command]
pub async fn lookup_scene_webp_cache_batch(
    app: AppHandle,
    jobs: Vec<SceneWebpJob>,
) -> Result<SceneWebpBatchResult, String> {
    let started = Instant::now();
    let requested = jobs.len();
    let episode_hint = jobs
        .first()
        .and_then(|job| job.episode_cache_id.clone())
        .unwrap_or_else(|| "none".to_string());

    let app_for_lookup = app.clone();
    let (items, unique_sources): (Vec<SceneWebpBatchItem>, usize) =
        tokio::task::spawn_blocking(move || {
            let mut fingerprint_cache: HashMap<String, String> = HashMap::new();
            let mut dir_cache: HashMap<String, HashMap<String, u64>> = HashMap::new();
            let items: Vec<SceneWebpBatchItem> = jobs
                .into_iter()
                .map(|job| {
                    lookup_scene_webp_cache_item(
                        &app_for_lookup,
                        &mut fingerprint_cache,
                        &mut dir_cache,
                        job,
                    )
                })
                .collect();
            let unique = fingerprint_cache.len();
            (items, unique)
        })
        .await
        .map_err(|e| format!("cache lookup task panicked: {e}"))?;

    let hits = items.iter().filter(|item| item.path.is_some()).count();
    let misses = requested.saturating_sub(hits);
    let sample_hit = items
        .iter()
        .find_map(|item| item.path.as_deref())
        .map(file_name_only)
        .unwrap_or_else(|| "none".to_string());
    let sample_error = items
        .iter()
        .find_map(|item| item.error.as_deref())
        .unwrap_or("none");

    console_log(
        "WEBP|cache_lookup",
        &format!(
            "episode={} requested={} hits={} misses={} unique_sources={} elapsed_ms={} sample_hit={} sample_error={}",
            episode_hint,
            requested,
            hits,
            misses,
            unique_sources,
            started.elapsed().as_millis(),
            sample_hit,
            sample_error,
        ),
    );

    Ok(SceneWebpBatchResult { items })
}
