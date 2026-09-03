use std::collections::{BTreeSet, HashMap};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::{Arc, Mutex};

use sha2::{Digest, Sha256};

pub(crate) fn sanitize_scene_time_window(start: f64, end: f64) -> (f64, f64, f64) {
    let safe_start = if start.is_finite() { start.max(0.0) } else { 0.0 };
    let mut safe_end = if end.is_finite() { end.max(safe_start) } else { safe_start };
    if safe_end - safe_start < 0.10 {
        safe_end = safe_start + 0.10;
    }
    let max_preview_secs = 2.5;
    if safe_end - safe_start > max_preview_secs {
        safe_end = safe_start + max_preview_secs;
    }
    let duration = safe_end - safe_start;
    (safe_start, safe_end, duration)
}

pub(crate) fn sampled_offsets(size: u64, sample_len: usize) -> Vec<u64> {
    let mut offsets = BTreeSet::new();
    offsets.insert(0);

    if size > sample_len as u64 {
        offsets.insert(size.saturating_sub(sample_len as u64));
    }

    if size > (sample_len as u64) * 2 {
        let half = size / 2;
        let middle = half.saturating_sub((sample_len as u64) / 2);
        offsets.insert(middle);
    }

    offsets.into_iter().collect()
}

pub(crate) fn content_fingerprint(path: &Path) -> Result<String, String> {
    const SAMPLE_BYTES: usize = 1024 * 1024;

    let metadata = std::fs::metadata(path)
        .map_err(|e| format!("Failed to read source metadata '{}': {e}", path.display()))?;
    let size = metadata.len();

    let mut file = File::open(path)
        .map_err(|e| format!("Failed to open source '{}' for fingerprinting: {e}", path.display()))?;
    let mut hasher = Sha256::new();
    hasher.update(size.to_le_bytes());

    let mut buffer = vec![0_u8; SAMPLE_BYTES];
    for offset in sampled_offsets(size, SAMPLE_BYTES) {
        file.seek(SeekFrom::Start(offset))
            .map_err(|e| format!("Failed to seek source '{}' for fingerprinting: {e}", path.display()))?;
        let read = file
            .read(&mut buffer)
            .map_err(|e| format!("Failed to read source '{}' for fingerprinting: {e}", path.display()))?;
        if read > 0 {
            hasher.update(&buffer[..read]);
        }
    }

    Ok(hex::encode(hasher.finalize()))
}

pub(crate) type FingerprintCache = Arc<Mutex<HashMap<String, String>>>;

pub(crate) fn cached_fingerprint(cache: &FingerprintCache, source: &Path) -> Result<String, String> {
    let key = source.to_string_lossy().to_string();
    if let Ok(map) = cache.lock() {
        if let Some(fp) = map.get(&key) {
            return Ok(fp.clone());
        }
    }
    let fingerprint = content_fingerprint(source)?;
    if let Ok(mut map) = cache.lock() {
        map.insert(key, fingerprint.clone());
    }
    Ok(fingerprint)
}

pub(crate) fn preview_cache_key_with_fingerprint(
    fingerprint: &str,
    start: f64,
    end: f64,
    fps: u32,
    is_poster: bool,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(fingerprint.as_bytes());
    hasher.update(format!("{start:.3}:{end:.3}:{fps}:{}:webp_v3", if is_poster { "poster" } else { "animated" }).as_bytes());
    let digest = hex::encode(hasher.finalize());
    digest.chars().take(24).collect()
}
