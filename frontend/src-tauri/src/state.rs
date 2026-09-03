use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
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

/// the in-flight optional-AI-dependency install (a `uv` process tree).
/// cloned into the blocking install task, so every field is shared
#[derive(Default, Clone)]
pub struct ActiveInstall {
    pub pid: Arc<Mutex<Option<u32>>>,
    running: Arc<AtomicBool>,
    cancel_requested: Arc<AtomicBool>,
}

impl ActiveInstall {
    /// claim the install slot. only one install may run at a time, a second
    /// one would fight the first over the same venv
    pub fn begin(&self) -> Result<(), String> {
        if self.running.swap(true, Ordering::SeqCst) {
            return Err("Another dependency install is already running.".to_string());
        }
        self.cancel_requested.store(false, Ordering::SeqCst);
        Ok(())
    }

    pub fn finish(&self) {
        self.running.store(false, Ordering::SeqCst);
        self.cancel_requested.store(false, Ordering::SeqCst);
    }

    pub fn cancel(&self) {
        self.cancel_requested.store(true, Ordering::SeqCst);
    }

    pub fn canceled(&self) -> bool {
        self.cancel_requested.load(Ordering::SeqCst)
    }
}

/// per-output-path locks that serialize duplicate proxy/WebP encode requests
pub type ProxyLockMap = Arc<AsyncMutex<HashMap<String, Arc<AsyncMutex<()>>>>>;

#[derive(Default)]
pub struct PreviewProxyLocks {
    pub inner: ProxyLockMap,
}

/// caps how many preview proxies may run libx264 at the same time
pub struct PreviewTranscodeSlots {
    pub semaphore: Arc<tokio::sync::Semaphore>,
    pub threads_per_encode: usize,
}

impl Default for PreviewTranscodeSlots {
    fn default() -> Self {
        // leave headroom for the UI and any running import: at most a quarter of
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

/// Discord Rich Presence lives with its worker thread, not here, the presence
/// is an IPC connection, no longer a child process
pub use crate::commands::discord::DiscordRPCState;

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
