use super::*;

#[cfg(target_os = "windows")]
fn build_after_effects_media_import_jsx(media_paths: &[String]) -> String {
    let rows = media_paths
        .iter()
        .map(|p| normalize_windows_editor_import_path(p))
        .map(|p| format!("\"{}\"", escape_jsx_double_quoted(&p)))
        .collect::<Vec<_>>()
        .join(",\n    ");

    format!(
        r#"(function () {{
  app.beginSuppressDialogs();
  app.beginUndoGroup("AMVerge Auto Import");

  if (!app.project) {{
    app.newProject();
  }}

  var paths = [
    {rows}
  ];

  var missing = [];
  var failed = [];
  var imported = 0;

  for (var i = 0; i < paths.length; i++) {{
    var p = paths[i];
    var f = new File(p);
    if (!f.exists) {{
      missing.push(p);
      continue;
    }}

    try {{
      var io = new ImportOptions(f);
      var item = app.project.importFile(io);
      if (item) {{
        imported++;
      }} else {{
        failed.push(p + " -> null item");
      }}
    }} catch (e) {{
      failed.push(p + " -> " + e.toString());
    }}
  }}

  app.endUndoGroup();
  app.endSuppressDialogs(false);

  if (missing.length > 0) {{
    throw new Error("Missing files: " + missing.join(" | "));
  }}

  if (failed.length > 0) {{
    throw new Error("Import failed: " + failed.join(" || "));
  }}

  $.writeln("AMVERGE_AFTERFX_IMPORTED=" + imported);
}})();
"#
    )
}

#[cfg(target_os = "windows")]
fn import_into_after_effects_via_jsx(media_paths: &[String]) -> Result<String, String> {
    let script = build_after_effects_media_import_jsx(media_paths);
    let script_path = write_temp_script("amverge_afterfx_import_jsx", "jsx", &script)?;

    let afterfx = resolve_afterfx_executable()
        .ok_or("After Effects executable was not found.".to_string())?;
    let runner = afterfx
        .parent()
        .map(|dir| dir.join("AfterFX.com"))
        .filter(|p| p.exists())
        .unwrap_or_else(|| afterfx.clone());

    let mut cmd = Command::new(&runner);
    apply_no_window(&mut cmd);
    let out = cmd.arg("-r").arg(&script_path).output().map_err(|e| {
        format!(
            "Failed to run After Effects script runner ({}): {e}",
            runner.display()
        )
    })?;

    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();

    if !out.status.success() {
        let details = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "Unknown After Effects script failure.".to_string()
        };

        return Err(format!(
            "After Effects script import failed. If your AE build blocks CLI scripts, open AE and allow scripts to write files/preferences.\n{details}"
        ));
    }

    Ok("After Effects import complete.".to_string())
}

pub(super) async fn import_into_after_effects(
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
            "Auto-import for After Effects is currently implemented for Windows builds only."
                .to_string(),
        );
    }

    #[cfg(target_os = "windows")]
    {
        emit_import_progress(Some(app), 98, "Preparing After Effects auto-import...");

        let import_paths = match stage_windows_editor_import_paths("after_effects", media_paths) {
            Ok(paths) => paths,
            Err(err) => {
                console_log(
                    "NLE|after_effects",
                    &format!("staging skipped (fallback to original paths): {err}"),
                );
                media_paths.to_vec()
            }
        };

        // Use UI automation instead of AfterFX -r scripting because some AE
        // installations intermittently report "scripting plugin is not installed"
        // for command-line script execution.
        let script_path = write_temp_script(
            "amverge_afterfx_import_ui",
            "ps1",
            &build_after_effects_ui_import_ps(&import_paths),
        )?;

        let afterfx_already_running = is_windows_process_running("AfterFX.exe");

        if !afterfx_already_running {
            emit_import_progress(Some(app), 98, "Launching After Effects...");
            let afterfx = resolve_afterfx_executable()
                .ok_or("After Effects executable was not found.".to_string())?;
            spawn_editor_process(&afterfx, "After Effects", "NLE|after_effects")?;
        }

        let max_attempts: u32 = 30;

        let first_attempt = run_windows_import_with_retries(
            Some(app),
            abort_requested,
            "NLE|after_effects",
            "After Effects",
            max_attempts,
            !afterfx_already_running,
            Some("AfterFX.exe"),
            "After Effects was closed before the import could complete.",
            "After Effects did not become ready in time. Make sure a project is open, then retry.",
            || run_editor_ui_import_ps(&script_path, "After Effects"),
        )
        .await;

        match first_attempt {
            Ok(msg) => Ok(msg),
            Err(err) => {
                if err.contains("AMVERGE_INVALID_FILENAME")
                    || err.contains("AMVERGE_FILENAME_FIELD_NOT_FOUND")
                {
                    console_log(
                        "NLE|after_effects",
                        "dialog path entry failed; retrying with forced staged filenames",
                    );

                    let forced_paths = stage_windows_editor_import_paths_forced(
                        "after_effects",
                        media_paths,
                    )
                    .map_err(|stage_err| format!("{err}\nForced staging failed: {stage_err}"))?;

                    let forced_script = write_temp_script(
                        "amverge_afterfx_import_ui_forced_stage",
                        "ps1",
                        &build_after_effects_ui_import_ps(&forced_paths),
                    )?;

                    let forced_attempt = run_windows_import_with_retries(
                        Some(app),
                        abort_requested,
                        "NLE|after_effects",
                        "After Effects",
                        12,
                        false,
                        Some("AfterFX.exe"),
                        "After Effects was closed before the import could complete.",
                        "After Effects did not become ready in time. Make sure a project is open, then retry.",
                        || run_editor_ui_import_ps(&forced_script, "After Effects"),
                    )
                    .await;

                    let forced_error = match forced_attempt {
                        Ok(msg) => return Ok(msg),
                        Err(forced_err) => forced_err,
                    };

                    console_log(
                        "NLE|after_effects",
                        "UI import fallback still failing; trying direct JSX import",
                    );
                    emit_import_progress(Some(app), 99, "Retrying import via After Effects script...");

                    return import_into_after_effects_via_jsx(&forced_paths)
                        .map_err(|jsx_err| format!("{err}\n{forced_error}\n{jsx_err}"));
                }

                Err(err)
            }
        }
    }
}

pub(super) fn build_after_effects_ui_import_ps(media_paths: &[String]) -> String {
    let project_ready_expr = "($titleLower -match '\\.aep') -and ($titleLower -notmatch 'untitled|sans titre') -and ($titleLower -notmatch 'home|accueil')";
    let window_title_match_expr = "($titleLower -match 'after effects')";
    let dialog_reject_expr =
        "($dialogTitleLower -match 'project|projet') -and ($dialogTitleLower -notmatch 'import|importer')";

    build_editor_ui_import_ps(
        media_paths,
        "AfterFX",
        "After Effects",
        "AMVERGE_NO_WINDOW: After Effects window not found. After Effects may still be loading.",
        "AMVERGE_NO_PROJECT: No opened .aep project yet. Select a project from the Home screen.",
        window_title_match_expr,
        project_ready_expr,
        dialog_reject_expr,
    )
}
