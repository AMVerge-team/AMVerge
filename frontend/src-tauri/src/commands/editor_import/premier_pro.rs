use super::*;

pub(super) async fn import_into_premier_pro(
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
            "Auto-import for Premiere Pro is currently implemented for Windows builds only."
                .to_string(),
        );
    }

    #[cfg(target_os = "windows")]
    {
        emit_import_progress(Some(app), 98, "Preparing Premiere Pro auto-import...");
        let import_paths = match stage_windows_editor_import_paths("premiere_pro", media_paths) {
            Ok(paths) => paths,
            Err(err) => {
                console_log(
                    "NLE|premiere",
                    &format!("staging skipped (fallback to original paths): {err}"),
                );
                media_paths.to_vec()
            }
        };

        let script_path = write_temp_script(
            "amverge_premiere_import",
            "ps1",
            &build_premier_pro_ui_import_ps(&import_paths),
        )?;

        let premiere_already_running = is_windows_process_running("Adobe Premiere Pro.exe");

        if !premiere_already_running {
            emit_import_progress(Some(app), 98, "Launching Premiere Pro...");
            let premiere = resolve_premier_pro_executable()
                .ok_or("Premiere Pro executable was not found.".to_string())?;
            spawn_editor_process(&premiere, "Premiere Pro", "NLE|premiere")?;
        }

        let max_attempts: u32 = 30;

        let first_attempt = run_windows_import_with_retries(
            Some(app),
            abort_requested,
            "NLE|premiere",
            "Premiere Pro",
            max_attempts,
            !premiere_already_running,
            Some("Adobe Premiere Pro.exe"),
            "Premiere Pro was closed before the import could complete.",
            "Premiere Pro did not become ready in time. Make sure a project is open, then retry.",
            || run_editor_ui_import_ps(&script_path, "Premiere Pro"),
        )
        .await;

        match first_attempt {
            Ok(msg) => Ok(msg),
            Err(err) => {
                if err.contains("AMVERGE_INVALID_FILENAME") {
                    console_log(
                        "NLE|premiere",
                        "dialog rejected path; retrying with forced staged filenames",
                    );

                    let forced_paths =
                        stage_windows_editor_import_paths_forced("premiere_pro", media_paths)
                            .map_err(|stage_err| {
                                format!("{err}\nForced staging failed: {stage_err}")
                            })?;

                    let forced_script = write_temp_script(
                        "amverge_premiere_import_forced_stage",
                        "ps1",
                        &build_premier_pro_ui_import_ps(&forced_paths),
                    )?;

                    return run_windows_import_with_retries(
                        Some(app),
                        abort_requested,
                        "NLE|premiere",
                        "Premiere Pro",
                        12,
                        false,
                        Some("Adobe Premiere Pro.exe"),
                        "Premiere Pro was closed before the import could complete.",
                        "Premiere Pro did not become ready in time. Make sure a project is open, then retry.",
                        || run_editor_ui_import_ps(&forced_script, "Premiere Pro"),
                    )
                    .await;
                }

                Err(err)
            }
        }
    }
}

/// Execute the editor UI-import PowerShell script and return the result.
#[cfg(target_os = "windows")]
pub(super) fn build_premier_pro_ui_import_ps(media_paths: &[String]) -> String {
    let project_ready_expr = "($titleLower -match '\\.prproj') -or (($titleLower -match 'premiere') -and ($title -match '\\s[-–—]\\s') -and ($titleLower -notmatch 'home|accueil|learn|importer|import'))";
    let window_title_match_expr = "($titleLower -match 'premiere')";
    let dialog_reject_expr = "$false";

    build_editor_ui_import_ps(
        media_paths,
        "Adobe Premiere Pro",
        "Premiere Pro",
        "AMVERGE_NO_WINDOW: Adobe Premiere Pro window not found. Premiere may still be loading.",
        "AMVERGE_NO_PROJECT: No Premiere project is open yet.",
        window_title_match_expr,
        project_ready_expr,
        dialog_reject_expr,
    )
}
