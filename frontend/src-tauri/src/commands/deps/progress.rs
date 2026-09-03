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

/// run one uv step, streaming its output to the install modal. returns the tail
/// of the output on failure so the UI can show a real reason.
/// turn uv's output into a real percentage. its own progress lines carry a byte
/// percentage ("... [====] 42% ..."), which is the most accurate source; when a
/// line has none, the "Resolved N packages" header plus one "Downloaded <name>"
/// per package still fills the bar across the download
pub(crate) fn report_uv_progress(
    app: &AppHandle,
    pack: &str,
    line: &str,
    total_packages: &mut usize,
    downloaded: &mut usize,
) {
    const DOWNLOAD_START: u8 = 10;
    const DOWNLOAD_END: u8 = 80;

    if let Some(pct_pos) = line.find('%') {
        let prefix = &line[..pct_pos];
        let digits = prefix
            .rfind(|c: char| !c.is_ascii_digit())
            .map(|i| &prefix[i + 1..])
            .unwrap_or(prefix);
        if let Ok(val) = digits.parse::<u8>() {
            let span = (DOWNLOAD_END - DOWNLOAD_START) as u32;
            let scaled = DOWNLOAD_START as u32 + val.min(100) as u32 * span / 100;
            emit_progress(app, pack, "packages", scaled as u8, false, line);
            return;
        }
    }

    if let Some(rest) = line.strip_prefix("Resolved ") {
        if let Some(count) = rest.split_whitespace().next().and_then(|n| n.parse().ok()) {
            *total_packages = count;
        }
        return;
    }

    if line.starts_with("Downloaded ") {
        *downloaded += 1;
        if *total_packages > 0 {
            let span = (DOWNLOAD_END - DOWNLOAD_START) as usize;
            let done = (*downloaded).min(*total_packages);
            let percent = DOWNLOAD_START as usize + span * done / *total_packages;
            emit_progress(
                app,
                pack,
                "packages",
                percent.min(DOWNLOAD_END as usize) as u8,
                false,
                &format!("Downloading packages ({done}/{total})", total = *total_packages),
            );
        }
        return;
    }

    if line.starts_with("Prepared ") {
        emit_progress(app, pack, "packages", 85, false, "Installing packages...");
    } else if line.starts_with("Installed ") {
        emit_progress(app, pack, "packages", 95, false, "Finishing up...");
    }
}
