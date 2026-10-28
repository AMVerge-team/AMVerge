use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tokio::sync::Mutex as AsyncMutex;

/// one running `amverge backend` and the episode it imports
pub struct SidecarProc {
    pub episode_cache_id: Option<String>,
    pub child: std::process::Child,
}

/// every running scene detection by pid; a batch can overlap two, which a single slot lost track of
#[derive(Default)]
pub struct ActiveSidecar {
    pub procs: Mutex<HashMap<u32, SidecarProc>>,
}

impl ActiveSidecar {
    /// removes and returns the pids of `episode`'s process, or of every process when `None`
    pub fn take_pids(&self, episode: Option<&str>) -> Vec<u32> {
        let Ok(mut procs) = self.procs.lock() else { return Vec::new() };
        let pids: Vec<u32> = procs
            .iter()
            .filter(|(_, p)| episode.is_none() || p.episode_cache_id.as_deref() == episode)
            .map(|(pid, _)| *pid)
            .collect();
        for pid in &pids {
            procs.remove(pid);
        }
        pids
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

/// the in-flight resume of a paused video-mode episode (`resume_episode_clips`)
#[derive(Default)]
pub struct ActiveResume {
    pub cancel_requested: AtomicBool,
    pub pids: Arc<Mutex<Vec<u32>>>,
}

#[derive(Default)]
pub struct ActiveFfmpegPids {
    pub pids: Arc<Mutex<Vec<u32>>>,
}
