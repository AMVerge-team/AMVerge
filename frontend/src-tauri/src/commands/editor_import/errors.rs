use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(target_os = "windows")]
pub(crate) fn is_import_cancel_requested(abort_requested: &AtomicBool) -> bool {
    abort_requested.load(Ordering::SeqCst)
}

#[cfg(target_os = "windows")]
pub(crate) fn import_canceled_error() -> String {
    "AMVERGE_CANCELED: Auto-import canceled by user.".to_string()
}

#[cfg(target_os = "windows")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum WindowsImportErrorKind {
    Canceled,
    NoWindow,
    NoProject,
    FocusFailed,
    Waiting,
    FilenameFieldNotFound,
    InvalidFilename,
    ResolveBridgeUnavailable,
    ResolveProjectMissing,
    Unknown,
}

#[cfg(target_os = "windows")]
pub(crate) fn classify_windows_import_error(raw: &str) -> WindowsImportErrorKind {
    if raw.contains("AMVERGE_CANCELED") {
        return WindowsImportErrorKind::Canceled;
    }
    if raw.contains("AMVERGE_NO_WINDOW") {
        return WindowsImportErrorKind::NoWindow;
    }
    if raw.contains("AMVERGE_NO_PROJECT") {
        return WindowsImportErrorKind::NoProject;
    }
    if raw.contains("AMVERGE_FOCUS_FAILED") {
        return WindowsImportErrorKind::FocusFailed;
    }
    if raw.contains("AMVERGE_WAITING") {
        return WindowsImportErrorKind::Waiting;
    }
    if raw.contains("AMVERGE_FILENAME_FIELD_NOT_FOUND") {
        return WindowsImportErrorKind::FilenameFieldNotFound;
    }
    if raw.contains("AMVERGE_INVALID_FILENAME") {
        return WindowsImportErrorKind::InvalidFilename;
    }
    if raw.contains("Could not connect to DaVinci Resolve") {
        return WindowsImportErrorKind::ResolveBridgeUnavailable;
    }
    if raw.contains("No Resolve project is open") {
        return WindowsImportErrorKind::ResolveProjectMissing;
    }

    WindowsImportErrorKind::Unknown
}

#[cfg(target_os = "windows")]
pub(crate) fn summarize_windows_import_error(raw: &str) -> String {
    match classify_windows_import_error(raw) {
        WindowsImportErrorKind::Canceled => {
            "AMVERGE_CANCELED: Auto-import canceled by user.".to_string()
        }
        WindowsImportErrorKind::NoWindow => {
            "AMVERGE_NO_WINDOW: Editor window not found yet.".to_string()
        }
        WindowsImportErrorKind::NoProject => {
            "AMVERGE_NO_PROJECT: No project is open yet.".to_string()
        }
        WindowsImportErrorKind::FocusFailed => {
            "AMVERGE_FOCUS_FAILED: Could not bring editor window to the foreground.".to_string()
        }
        WindowsImportErrorKind::Waiting => "AMVERGE_WAITING: Editor is still loading.".to_string(),
        WindowsImportErrorKind::FilenameFieldNotFound => {
            "AMVERGE_FILENAME_FIELD_NOT_FOUND: Could not access the editor dialog file-name field."
                .to_string()
        }
        WindowsImportErrorKind::InvalidFilename => {
            "AMVERGE_INVALID_FILENAME: Imported file path was rejected by the editor dialog."
                .to_string()
        }
        WindowsImportErrorKind::ResolveBridgeUnavailable => "DaVinci Resolve scripting bridge did not connect. In Resolve, enable External scripting using Local (Preferences > System > General), then retry.".to_string(),
        WindowsImportErrorKind::ResolveProjectMissing => {
            "No DaVinci Resolve project is open. Open/create a project in Resolve, then retry."
                .to_string()
        }
        WindowsImportErrorKind::Unknown => raw
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| "Unknown import error.".to_string()),
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn should_retry_windows_import_error(
    raw: &str,
    attempt_index: u32,
    launched_this_call: bool,
) -> bool {
    match classify_windows_import_error(raw) {
        WindowsImportErrorKind::NoWindow
        | WindowsImportErrorKind::NoProject
        | WindowsImportErrorKind::FocusFailed
        | WindowsImportErrorKind::Waiting
        | WindowsImportErrorKind::FilenameFieldNotFound => {
            let max_attempts = if launched_this_call { 12 } else { 4 };
            attempt_index + 1 < max_attempts
        }
        // resolve can take a bit of time to expose scripting after launch
        WindowsImportErrorKind::ResolveBridgeUnavailable => launched_this_call && attempt_index < 8,
        WindowsImportErrorKind::Canceled
        | WindowsImportErrorKind::InvalidFilename
        | WindowsImportErrorKind::ResolveProjectMissing
        | WindowsImportErrorKind::Unknown => false,
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn import_hint_for_error(editor_name: &str, raw: &str) -> String {
    match classify_windows_import_error(raw) {
        WindowsImportErrorKind::Canceled => "Canceling auto-import...".to_string(),
        WindowsImportErrorKind::NoWindow => format!("{editor_name} is still loading"),
        WindowsImportErrorKind::NoProject => {
            if editor_name == "After Effects" {
                return "Select an existing .aep project from the Home screen to continue auto-import"
                    .to_string();
            }
            format!("Open or create a project in {editor_name} to continue auto-import")
        }
        WindowsImportErrorKind::FocusFailed => {
            format!("Click the {editor_name} window to bring it to front")
        }
        WindowsImportErrorKind::Waiting => format!("Waiting for {editor_name}"),
        WindowsImportErrorKind::FilenameFieldNotFound => {
            format!("Re-targeting {editor_name} import field")
        }
        WindowsImportErrorKind::InvalidFilename => {
            format!("{editor_name} rejected imported file path")
        }
        WindowsImportErrorKind::ResolveBridgeUnavailable => {
            "Waiting for DaVinci Resolve scripting bridge".to_string()
        }
        WindowsImportErrorKind::ResolveProjectMissing | WindowsImportErrorKind::Unknown => {
            format!("Waiting for {editor_name}")
        }
    }
}
