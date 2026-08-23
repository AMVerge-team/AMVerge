use super::*;

// The Python bridge lives in its own file rather than being string-built in
// Rust: it is the only Resolve-specific logic in the app, and keeping it
// readable is what makes it patchable (or deletable) on its own.
const IMPORT_SCRIPT_TEMPLATE: &str = include_str!("resolve_import.py");

#[derive(serde::Serialize)]
pub struct DavinciDetection {
    pub installed: bool,
    pub path: Option<String>,
}

/// Whether DaVinci Resolve is installed at all. Free and Studio share the same
/// install path, executable metadata and `fusionscript.dll`, so nothing on disk
/// tells the two editions apart — only an actual scripting connection does, and
/// that needs Resolve running. Detection therefore gates on "installed", and a
/// Free install surfaces as an explicit error at import time.
#[tauri::command]
pub fn detect_davinci_resolve() -> DavinciDetection {
    match davinci_install_path() {
        Some(path) => DavinciDetection {
            installed: true,
            path: Some(path.to_string_lossy().to_string()),
        },
        None => DavinciDetection {
            installed: false,
            path: None,
        },
    }
}

/// Send clip files straight to Resolve: Media Pool, then appended to the current
/// timeline (a new one at the clip's frame rate if no timeline is open).
#[tauri::command]
pub async fn import_clips_to_davinci(
    app: AppHandle,
    abort_state: State<'_, EditorImportAbortState>,
    clip_paths: Vec<String>,
) -> Result<String, String> {
    abort_state.abort_requested.store(false, Ordering::SeqCst);
    let normalized = normalize_editor_media_paths(clip_paths)?;

    import_clips_into_timeline(&app, &normalized, &abort_state.abort_requested).await
}

fn davinci_install_path() -> Option<PathBuf> {
    if let Ok(custom) = std::env::var("AMVERGE_RESOLVE_PATH") {
        let path = PathBuf::from(custom);
        if path.exists() {
            return Some(path);
        }
    }

    #[cfg(target_os = "windows")]
    {
        resolve_davinci_executable()
    }

    #[cfg(target_os = "macos")]
    {
        // The installer puts the bundle in its own folder; older installs and
        // manual copies sit straight in /Applications.
        [
            "/Applications/DaVinci Resolve/DaVinci Resolve.app",
            "/Applications/DaVinci Resolve.app",
        ]
        .iter()
        .map(PathBuf::from)
        .find(|p| p.exists())
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let bin = PathBuf::from("/opt/resolve/bin/resolve");
        bin.exists().then_some(bin)
    }
}

/// Official Resolve scripting environment, per platform. Without it the Python
/// module falls back to its own hardcoded defaults, which miss any install that
/// is not in the stock location.
///
/// Windows sets this inline in `run_python_script`, where it also has to prepend
/// Resolve's folder to PATH for `fusionscript.dll`'s dependencies.
#[cfg(not(target_os = "windows"))]
pub(super) fn apply_resolve_script_env(cmd: &mut Command) {
    let Some(install) = davinci_install_path() else {
        return;
    };

    #[cfg(target_os = "macos")]
    let (api_dir, lib_path) = (
        PathBuf::from(
            "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting",
        ),
        install.join("Contents/Libraries/Fusion/fusionscript.so"),
    );

    #[cfg(all(unix, not(target_os = "macos")))]
    let (api_dir, lib_path) = {
        // install points at <root>/bin/resolve.
        let root = install
            .parent()
            .and_then(|p| p.parent())
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("/opt/resolve"));
        (
            root.join("Developer/Scripting"),
            root.join("libs/Fusion/fusionscript.so"),
        )
    };

    cmd.env("RESOLVE_SCRIPT_API", &api_dir);
    cmd.env("RESOLVE_SCRIPT_LIB", &lib_path);

    let mut python_path = vec![api_dir.join("Modules").to_string_lossy().to_string()];
    if let Ok(existing) = std::env::var("PYTHONPATH") {
        if !existing.trim().is_empty() {
            python_path.insert(0, existing);
        }
    }
    cmd.env("PYTHONPATH", python_path.join(":"));
}

/// Media Pool only — used by the export-profile editor import path.
pub(super) async fn import_into_davinci_resolve(
    app: &AppHandle,
    media_paths: &[String],
    abort_requested: &AtomicBool,
) -> Result<String, String> {
    run_davinci_import(app, media_paths, abort_requested, false).await
}

/// Media Pool + append to the current (or a freshly created) timeline — used by
/// the clip-selection bar.
pub(super) async fn import_clips_into_timeline(
    app: &AppHandle,
    media_paths: &[String],
    abort_requested: &AtomicBool,
) -> Result<String, String> {
    run_davinci_import(app, media_paths, abort_requested, true).await
}

async fn run_davinci_import(
    app: &AppHandle,
    media_paths: &[String],
    abort_requested: &AtomicBool,
    append_to_timeline: bool,
) -> Result<String, String> {
    let script_path = write_temp_script(
        "amverge_resolve_import",
        "py",
        &build_davinci_import_script(media_paths, append_to_timeline),
    )?;

    #[cfg(target_os = "windows")]
    {
        emit_import_progress(Some(app), 98, "Preparing DaVinci Resolve auto-import...");
        let resolve_running = is_windows_process_running("Resolve.exe");
        if !resolve_running {
            if let Some(resolve_exe) = resolve_davinci_executable() {
                emit_import_progress(Some(app), 98, "Launching DaVinci Resolve...");
                spawn_editor_process(&resolve_exe, "DaVinci Resolve", "NLE|davinci")?;
            } else {
                return Err("DaVinci Resolve executable was not found.".to_string());
            }
        }

        run_windows_import_with_retries(
            Some(app),
            abort_requested,
            "NLE|davinci",
            "DaVinci Resolve",
            30,
            !resolve_running,
            Some("Resolve.exe"),
            "DaVinci Resolve was closed before the import could complete.",
            "DaVinci Resolve did not become ready for scripting in time.",
            || run_python_script(&script_path),
        )
        .await
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        let _ = abort_requested;
        run_python_script(&script_path)
    }
}

pub(super) fn build_davinci_import_script(
    media_paths: &[String],
    append_to_timeline: bool,
) -> String {
    let media_json = serde_json::to_string(media_paths).unwrap_or_else(|_| "[]".to_string());

    IMPORT_SCRIPT_TEMPLATE
        .replace("__AMVERGE_MEDIA_JSON__", &media_json)
        .replace(
            "__AMVERGE_APPEND_JSON__",
            if append_to_timeline { "true" } else { "false" },
        )
}
