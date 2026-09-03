use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::utils::process::apply_no_window;

#[cfg(target_os = "windows")]
use std::path::PathBuf;
#[cfg(target_os = "windows")]
use crate::utils::logging::console_log;
#[cfg(target_os = "windows")]
use super::executables::resolve_davinci_executable;

#[cfg(target_os = "windows")]
pub(crate) fn is_windows_process_running(image_name: &str) -> bool {
    let expected = image_name.trim().to_ascii_lowercase();
    if expected.is_empty() {
        return false;
    }

    let mut cmd = Command::new("tasklist");
    apply_no_window(&mut cmd);

    let output = cmd.arg("/FO").arg("CSV").arg("/NH").output();
    let Ok(out) = output else {
        return false;
    };
    if !out.status.success() {
        return false;
    }

    String::from_utf8_lossy(&out.stdout).lines().any(|line| {
        let trimmed = line.trim();
        if !trimmed.starts_with('"') {
            return false;
        }

        let Some(end_quote) = trimmed[1..].find('"') else {
            return false;
        };

        let image = trimmed[1..1 + end_quote].trim().to_ascii_lowercase();
        image == expected
    })
}

#[cfg(target_os = "windows")]
pub(crate) fn spawn_editor_process(
    executable: &Path,
    editor_name: &str,
    log_scope: &str,
) -> Result<(), String> {
    console_log(
        log_scope,
        &format!("launching {editor_name}: {}", executable.display()),
    );

    let mut launch_cmd = Command::new(executable);
    apply_no_window(&mut launch_cmd);
    launch_cmd
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    launch_cmd.spawn().map_err(|e| {
        format!(
            "Failed to launch {editor_name} ({}): {e}",
            executable.display()
        )
    })?;

    Ok(())
}

#[cfg(target_os = "windows")]
pub(crate) fn run_editor_ui_import_ps(script_path: &Path, editor_name: &str) -> Result<String, String> {
    let mut cmd = Command::new("powershell");
    apply_no_window(&mut cmd);
    let out = cmd
        .arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-STA")
        .arg("-File")
        .arg(script_path)
        .output()
        .map_err(|e| format!("Failed to run {editor_name} importer script: {e}"))?;

    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();

    if out.status.success() {
        Ok(if stdout.is_empty() {
            format!("{editor_name} import complete.")
        } else {
            stdout
        })
    } else {
        let detail = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "No error output.".to_string()
        };
        Err(detail)
    }
}

pub(crate) fn run_python_script(script_path: &Path) -> Result<String, String> {
    let mut launch_errors: Vec<String> = Vec::new();

    // Resolve script runs against the user's system Python (the backend/venv
    // interpreter lookup was removed with the backend folder).
    //
    // `fusionscript.dll` is a CPython extension built against ONE ABI, 3.13 for
    // Resolve 21, and a mismatched interpreter dies with "initialization of
    // fusionscript failed without raising an exception" before Resolve is ever
    // contacted. the default `python` on PATH is routinely an older version, so
    // the launcher's newest versions are tried first and the loop falls through
    // on the ABI failure
    #[cfg(target_os = "windows")]
    let candidates: Vec<(String, Vec<String>)> = vec![
        ("py".to_string(), vec!["-3.13".to_string()]),
        ("py".to_string(), vec!["-3.12".to_string()]),
        ("py".to_string(), vec!["-3.11".to_string()]),
        ("py".to_string(), vec!["-3.10".to_string()]),
        ("python".to_string(), vec![]),
        ("py".to_string(), vec!["-3".to_string()]),
    ];

    // same ABI constraint on macOS and Linux, where `fusionscript.so` is the
    // extension and there is no `py` launcher to ask for a version
    #[cfg(not(target_os = "windows"))]
    let candidates: Vec<(String, Vec<String>)> = vec![
        ("python3.13".to_string(), vec![]),
        ("python3.12".to_string(), vec![]),
        ("python3.11".to_string(), vec![]),
        ("python3.10".to_string(), vec![]),
        ("python3".to_string(), vec![]),
        ("python".to_string(), vec![]),
    ];

    for (exe, extra_args) in candidates {
        let mut cmd = Command::new(&exe);
        apply_no_window(&mut cmd);
        cmd.args(extra_args)
            .arg(script_path)
            .env("PYTHONIOENCODING", "utf-8");

        #[cfg(not(target_os = "windows"))]
        davinci_resolve::apply_resolve_script_env(&mut cmd);

        #[cfg(target_os = "windows")]
        {
            if let Some(resolve_exe) = resolve_davinci_executable() {
                if let Some(resolve_dir) = resolve_exe.parent() {
                    let resolve_dir_str = resolve_dir.to_string_lossy().to_string();
                    let script_api_dir = PathBuf::from(
                        std::env::var("PROGRAMDATA")
                            .unwrap_or_else(|_| r"C:\ProgramData".to_string()),
                    )
                    .join("Blackmagic Design")
                    .join("DaVinci Resolve")
                    .join("Support")
                    .join("Developer")
                    .join("Scripting");
                    let modules_dir = script_api_dir.join("Modules");
                    let resolve_script_lib = resolve_dir.join("fusionscript.dll");

                    // official Resolve scripting env
                    cmd.env(
                        "RESOLVE_SCRIPT_API",
                        script_api_dir.to_string_lossy().to_string(),
                    );
                    cmd.env(
                        "RESOLVE_SCRIPT_LIB",
                        resolve_script_lib.to_string_lossy().to_string(),
                    );

                    // ensure Python can import Resolve modules
                    let mut pythonpath_parts: Vec<String> = Vec::new();
                    if let Ok(existing) = std::env::var("PYTHONPATH") {
                        if !existing.trim().is_empty() {
                            pythonpath_parts.push(existing);
                        }
                    }
                    pythonpath_parts.push(modules_dir.to_string_lossy().to_string());
                    cmd.env("PYTHONPATH", pythonpath_parts.join(";"));

                    // ensure fusionscript.dll deps resolve
                    let mut path_parts: Vec<String> = vec![resolve_dir_str];
                    if let Ok(existing_path) = std::env::var("PATH") {
                        if !existing_path.trim().is_empty() {
                            path_parts.push(existing_path);
                        }
                    }
                    cmd.env("PATH", path_parts.join(";"));
                }
            }
        }

        match run_with_timeout(&mut cmd, PYTHON_SCRIPT_TIMEOUT) {
            Ok(None) => {
                launch_errors.push(format!(
                    "{exe} was killed after {}s without answering",
                    PYTHON_SCRIPT_TIMEOUT.as_secs()
                ));
            }
            Ok(Some(out)) => {
                let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();

                if out.status.success() {
                    let msg = if stdout.is_empty() {
                        "DaVinci Resolve import command sent.".to_string()
                    } else {
                        stdout
                    };
                    return Ok(msg);
                }

                // the bridge itself loaded and Resolve answered (or refused):
                // every remaining interpreter would hit the same wall, so the
                // error goes straight back to the retry harness that knows how
                // to classify it
                if is_resolve_side_failure(&stderr) {
                    return Err(stderr);
                }

                if !stderr.is_empty() {
                    launch_errors.push(format!("{exe} stderr: {stderr}"));
                }
                if !stdout.is_empty() {
                    launch_errors.push(format!("{exe} stdout: {stdout}"));
                }
                if stderr.is_empty() && stdout.is_empty() {
                    launch_errors.push(format!("{exe} exited with status {}", out.status));
                }
            }
            Err(e) => {
                launch_errors.push(format!("{exe} failed to start: {e}"));
            }
        }
    }

    Err(format!(
        "{}\nFailed to run DaVinci scripting bridge.",
        launch_errors.join("\n")
    ))
}

/// errors raised by the bridge script itself, i.e. past the point where the
/// interpreter mattered
pub(crate) fn is_resolve_side_failure(stderr: &str) -> bool {
    const MARKERS: [&str; 5] = [
        "Could not connect to DaVinci Resolve",
        "No Resolve project is open",
        "Could not access Resolve media pool",
        "Resolve refused",
        "Resolve failed to import media",
    ];
    MARKERS.iter().any(|marker| stderr.contains(marker))
}

/// a Resolve API call can hang forever (project switch, wedged handle). plain
/// `Command::output()` would hang with it, and the retry harness above would
/// never get its turn, so the child gets a deadline and a kill
pub(crate) const PYTHON_SCRIPT_TIMEOUT: Duration = Duration::from_secs(180);

/// `Ok(None)` = the deadline passed and the child was killed
pub(crate) fn run_with_timeout(
    cmd: &mut Command,
    timeout: Duration,
) -> std::io::Result<Option<std::process::Output>> {
    use std::io::Read;

    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    // drained on threads: a child that fills a pipe buffer blocks on write, and
    // would then never reach the exit we are polling for
    let mut child_stdout = child.stdout.take();
    let mut child_stderr = child.stderr.take();
    let stdout_reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(pipe) = child_stdout.as_mut() {
            let _ = pipe.read_to_end(&mut buf);
        }
        buf
    });
    let stderr_reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(pipe) = child_stderr.as_mut() {
            let _ = pipe.read_to_end(&mut buf);
        }
        buf
    });

    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait()? {
            Some(status) => break Some(status),
            None => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    break None;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
        }
    };

    let stdout = stdout_reader.join().unwrap_or_default();
    let stderr = stderr_reader.join().unwrap_or_default();

    Ok(status.map(|status| std::process::Output {
        status,
        stdout,
        stderr,
    }))
}
