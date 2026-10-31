use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InstallProgressPayload {
    pack: String,
    /// "python" | "torch" | "packages" | "cleanup"
    phase: String,
    percent: u8,
    /// true while a multi-GB wheel downloads and no real percentage exists
    indeterminate: bool,
    message: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InstallLogPayload {
    pack: String,
    line: String,
}

pub(crate) fn emit_progress(
    app: &AppHandle,
    pack: &str,
    phase: &str,
    percent: u8,
    indeterminate: bool,
    message: &str,
) {
    let _ = app.emit(
        "ai_install_progress",
        InstallProgressPayload {
            pack: pack.to_string(),
            phase: phase.to_string(),
            percent,
            indeterminate,
            message: message.to_string(),
        },
    );
}

pub(crate) fn emit_log(app: &AppHandle, pack: &str, line: &str) {
    let _ = app.emit(
        "ai_install_log",
        InstallLogPayload {
            pack: pack.to_string(),
            line: line.to_string(),
        },
    );
}

/// what the package step is doing right now, shared by the uv output reader and the disk watcher
pub(crate) struct LiveStatus {
    percent: u8,
    indeterminate: bool,
    label: String,
    /// past "Prepared": files are being copied into the env rather than downloaded
    installing: bool,
    /// big wheels uv announced with "Downloading <name>" and has not finished yet
    in_flight: Vec<String>,
    total_packages: usize,
    downloaded: usize,
    /// bytes written so far, from the watcher; uv prints no byte progress when it is not on a terminal
    disk_note: String,
}

impl LiveStatus {
    pub(crate) fn new() -> Self {
        Self {
            percent: 10,
            indeterminate: true,
            label: "Downloading packages".into(),
            installing: false,
            in_flight: Vec::new(),
            total_packages: 0,
            downloaded: 0,
            disk_note: String::new(),
        }
    }

    fn emit(&self, app: &AppHandle, pack: &str) {
        let message = if self.disk_note.is_empty() {
            format!("{}...", self.label)
        } else {
            format!("{}... {}", self.label, self.disk_note)
        };
        emit_progress(app, pack, "packages", self.percent, self.indeterminate, &message);
    }

    fn downloading_label(&self) -> String {
        if self.in_flight.is_empty() {
            format!("Downloading packages ({}/{})", self.downloaded, self.total_packages.max(self.downloaded))
        } else {
            format!("Downloading {}", self.in_flight.join(", "))
        }
    }
}

/// updates the live status from one uv line: its byte percentages first, else Resolved/Downloaded counts
pub(crate) fn report_uv_progress(app: &AppHandle, pack: &str, line: &str, live: &Mutex<LiveStatus>) {
    const DOWNLOAD_START: u8 = 10;
    const DOWNLOAD_END: u8 = 80;

    let Ok(mut live) = live.lock() else { return };

    if let Some(pct_pos) = line.find('%') {
        let prefix = &line[..pct_pos];
        let digits = prefix
            .rfind(|c: char| !c.is_ascii_digit())
            .map(|i| &prefix[i + 1..])
            .unwrap_or(prefix);
        if let Ok(val) = digits.parse::<u8>() {
            let span = (DOWNLOAD_END - DOWNLOAD_START) as u32;
            live.percent = (DOWNLOAD_START as u32 + val.min(100) as u32 * span / 100) as u8;
            live.indeterminate = false;
            live.label = line.to_string();
            live.emit(app, pack);
            return;
        }
    }

    if let Some(rest) = line.strip_prefix("Resolved ") {
        if let Some(count) = rest.split_whitespace().next().and_then(|n| n.parse().ok()) {
            live.total_packages = count;
        }
        return;
    }

    // "Downloading torch (2.4GiB)": only big wheels get this line, so it names what the wait is for
    if let Some(rest) = line.strip_prefix("Downloading ") {
        if let Some(name) = rest.split_whitespace().next() {
            if !live.in_flight.iter().any(|n| n == name) {
                live.in_flight.push(name.to_string());
            }
            live.label = live.downloading_label();
            live.emit(app, pack);
        }
        return;
    }

    if let Some(rest) = line.strip_prefix("Downloaded ") {
        let name = rest.split_whitespace().next().unwrap_or_default().to_string();
        live.in_flight.retain(|n| *n != name);
        live.downloaded += 1;
        if live.total_packages > 0 {
            let span = (DOWNLOAD_END - DOWNLOAD_START) as usize;
            let done = live.downloaded.min(live.total_packages);
            live.percent = (DOWNLOAD_START as usize + span * done / live.total_packages).min(DOWNLOAD_END as usize) as u8;
            live.indeterminate = false;
        }
        live.label = live.downloading_label();
        live.emit(app, pack);
        return;
    }

    if line.starts_with("Prepared ") {
        live.percent = 85;
        live.indeterminate = false;
        live.installing = true;
        live.disk_note.clear();
        live.label = "Installing packages".into();
        live.emit(app, pack);
    } else if line.starts_with("Installed ") {
        live.percent = 95;
        live.disk_note.clear();
        live.label = "Finishing up".into();
        live.emit(app, pack);
    }
}

/// re-emits the live status every second with how much has been written, so a multi-GB wheel never looks frozen
pub(crate) struct DiskWatcher {
    stop: Arc<AtomicBool>,
}

impl DiskWatcher {
    /// `cache` grows while uv downloads and unpacks, `env` while it copies files in
    pub(crate) fn spawn(app: AppHandle, pack: String, live: Arc<Mutex<LiveStatus>>, cache: PathBuf, env: PathBuf) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        std::thread::spawn(move || {
            let cache_base = dir_size(&cache);
            let env_base = dir_size(&env);
            while !flag.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(1000));
                if flag.load(Ordering::Relaxed) {
                    break;
                }
                let installing = live.lock().map(|l| l.installing).unwrap_or(false);
                let note = if installing {
                    format!("{} copied", format_bytes(dir_size(&env).saturating_sub(env_base)))
                } else {
                    format!("{} downloaded and unpacked", format_bytes(dir_size(&cache).saturating_sub(cache_base)))
                };
                let Ok(mut live) = live.lock() else { break };
                if live.label == "Finishing up" {
                    continue;
                }
                live.disk_note = format!("({note})");
                live.emit(&app, &pack);
            }
        });
        Self { stop }
    }
}

impl Drop for DiskWatcher {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

fn dir_size(path: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else { return 0 };
    entries
        .flatten()
        .map(|entry| match entry.file_type() {
            Ok(kind) if kind.is_dir() => dir_size(&entry.path()),
            Ok(_) => entry.metadata().map(|m| m.len()).unwrap_or(0),
            Err(_) => 0,
        })
        .sum()
}

fn format_bytes(bytes: u64) -> String {
    const GB: f64 = 1024.0 * 1024.0 * 1024.0;
    const MB: f64 = 1024.0 * 1024.0;
    let b = bytes as f64;
    if b >= GB {
        format!("{:.2} GB", b / GB)
    } else {
        format!("{:.0} MB", b / MB)
    }
}
