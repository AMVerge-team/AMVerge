use super::*;

pub(super) async fn import_into_capcut(
    app: &AppHandle,
    media_paths: &[String],
    abort_requested: &AtomicBool,
) -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        let _ = media_paths;
        let _ = abort_requested;
        return Err(
            "CapCut workflow integration is currently implemented for Windows builds only."
                .to_string(),
        );
    }

    #[cfg(target_os = "windows")]
    {
        emit_import_progress(Some(app), 98, "Preparing CapCut media import...");
        let mut capcut_media_paths: Vec<String> = Vec::new();
        let mut skipped_paths: Vec<String> = Vec::new();
        for raw_path in media_paths {
            let normalized = normalize_windows_editor_import_path(raw_path);
            if normalized.is_empty() {
                continue;
            }
            if is_capcut_media_extension_supported(&normalized) {
                capcut_media_paths.push(normalized);
            } else {
                skipped_paths.push(normalized);
            }
        }

        if capcut_media_paths.is_empty() {
            let detail = if skipped_paths.is_empty() {
                "No files were provided.".to_string()
            } else {
                format!("Unsupported paths: {}", skipped_paths.join(", "))
            };
            return Err(format!(
                "CapCut import expects media files only (MP4/MOV/JPG/PNG/MP3). {detail}"
            ));
        }

        if !skipped_paths.is_empty() {
            console_log(
                "NLE|capcut",
                &format!(
                    "skipping unsupported CapCut imports (non-media): {}",
                    skipped_paths.join(" | ")
                ),
            );
        }

        let script_path = write_temp_script(
            "amverge_capcut_import",
            "ps1",
            &build_capcut_ui_import_ps(&capcut_media_paths),
        )?;

        let capcut_running = is_capcut_app_process_running();
        if !capcut_running {
            let capcut_exe = resolve_capcut_executable()
                .ok_or("CapCut executable was not found.".to_string())?;
            emit_import_progress(Some(app), 98, "Launching CapCut...");
            spawn_editor_process(&capcut_exe, "CapCut", "NLE|capcut")?;
        }

        let import_result = run_windows_import_with_retries(
            Some(app),
            abort_requested,
            "NLE|capcut",
            "CapCut",
            30,
            !capcut_running,
            None,
            "CapCut was closed before the import could complete.",
            "CapCut did not become ready in time. Open a project in CapCut and retry.",
            || run_editor_ui_import_ps(&script_path, "CapCut"),
        )
        .await;

        import_result
    }
}

mod detect;
mod script;

#[cfg(target_os = "windows")]
use detect::{
    is_capcut_app_process_running, is_capcut_media_extension_supported, resolve_capcut_executable,
};
#[cfg(target_os = "windows")]
use script::build_capcut_ui_import_ps;
