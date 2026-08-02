use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use tokio::sync::Mutex as AsyncMutex;

pub struct ActiveSidecar {
    pub pid: Mutex<Option<u32>>,
    pub child: Mutex<Option<std::process::Child>>,
}

impl Default for ActiveSidecar {
    fn default() -> Self {
        Self {
            pid: Mutex::new(None),
            child: Mutex::new(None),
        }
    }
}

/// Per-output-path locks that serialize duplicate proxy/WebP encode requests
pub type ProxyLockMap = Arc<AsyncMutex<HashMap<String, Arc<AsyncMutex<()>>>>>;

#[derive(Default)]
pub struct PreviewProxyLocks {
    pub inner: ProxyLockMap,
}

/// Caps how many preview proxies may run libx264 at the same time
pub struct PreviewTranscodeSlots {
    pub semaphore: Arc<tokio::sync::Semaphore>,
    pub threads_per_encode: usize,
}

impl Default for PreviewTranscodeSlots {
    fn default() -> Self {
        // Leave headroom for the UI and any running import: at most a quarter of
        // the machine's threads, clamped to 1..=3
        let parallelism = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);
        let permits = (parallelism / 4).clamp(1, 3);
        Self {
            semaphore: Arc::new(tokio::sync::Semaphore::new(permits)),
            threads_per_encode: (parallelism / permits).max(1),
        }
    }
}

#[derive(Default)]
pub struct DiscordRPCState {
    pub child: Mutex<Option<std::process::Child>>,
}

#[derive(Default)]
pub struct EditorImportAbortState {
    pub abort_requested: AtomicBool,
}

#[derive(Default)]
pub struct ExportAbortState {
    pub abort_requested: Arc<AtomicBool>,
    pub pids: Arc<Mutex<Vec<u32>>>,
}

#[derive(Default)]
pub struct ActiveFfmpegPids {
    pub pids: Arc<Mutex<Vec<u32>>>,
}
