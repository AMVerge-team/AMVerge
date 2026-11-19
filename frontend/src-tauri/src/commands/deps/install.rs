use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

use tauri::AppHandle;

use crate::state::ActiveInstall;
use crate::utils::logging::{console_log, sanitize_for_console};
use crate::utils::sidecar::{
    ai_env_dir, ai_env_python, ai_env_ready, bundled_cli_version, runtime_dir, uv_cache_dir,
};

use super::packs::{
    Pack, AI_ENV_PYTHON_VERSION, AI_ENV_PYTHON_VERSION_GPU_DECODE, NELUX_PIN_GPU_DECODE, PACKS,
    TORCH_CUDA_INDEX, TORCH_CUDA_INDEX_GPU_DECODE, TORCH_FAMILY, TORCH_PIN_GPU_DECODE,
};
use super::status::env_python_version_of;
use super::progress::{emit_log, emit_progress, report_uv_progress, DiskWatcher, LiveStatus};
use super::status::{installed_distributions, uv_command};

pub(crate) fn run_uv_step(
    app: &AppHandle,
    install_state: &ActiveInstall,
    pack: &str,
    mut cmd: Command,
    step_label: &str,
) -> Result<(), String> {
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start {step_label}: {e}"))?;
    crate::utils::process::bind_to_app_lifetime(child.id());
    if let Ok(mut lock) = install_state.pid.lock() {
        *lock = Some(child.id());
    }

    let stdout_handle = child.stdout.take().map(|stdout| {
        let app = app.clone();
        let pack = pack.to_string();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    emit_log(&app, &pack, &sanitize_for_console(trimmed));
                }
            }
        })
    });

    let mut tail: Vec<String> = Vec::new();
    let track_progress = step_label == "Package install";
    let live = Arc::new(Mutex::new(LiveStatus::new()));
    // stops itself when dropped at the end of this step
    let _watcher = match (track_progress, uv_cache_dir(app), ai_env_dir(app)) {
        (true, Ok(cache), Ok(env)) => Some(DiskWatcher::spawn(app.clone(), pack.to_string(), live.clone(), cache, env)),
        _ => None,
    };
    if let Some(stderr) = child.stderr.take() {
        let mut reader = BufReader::new(stderr);
        let mut buf = Vec::new();

        while let Ok(n) = reader.read_until(b'\n', &mut buf) {
            if n == 0 {
                break;
            }
            let raw = String::from_utf8_lossy(&buf);
            for segment in raw.split(|c| c == '\r' || c == '\n') {
                let trimmed = segment.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let sanitized = sanitize_for_console(trimmed);
                console_log("DEPS|uv", &sanitized);
                emit_log(app, pack, &sanitized);

                if track_progress {
                    report_uv_progress(app, pack, &sanitized, &live);
                }

                tail.push(sanitized);
                if tail.len() > 12 {
                    tail.remove(0);
                }
            }
            buf.clear();
        }
    }

    let status = child
        .wait()
        .map_err(|e| format!("Failed waiting for {step_label}: {e}"))?;
    if let Some(handle) = stdout_handle {
        let _ = handle.join();
    }
    if let Ok(mut lock) = install_state.pid.lock() {
        *lock = None;
    }

    if status.success() {
        return Ok(());
    }
    if install_state.canceled() {
        return Err("Install canceled.".to_string());
    }

    let detail = tail.join("\n");
    Err(if detail.is_empty() {
        format!("{step_label} failed ({status})")
    } else {
        format!("{step_label} failed ({status}):\n{detail}")
    })
}

// waits before each retry; uv keeps finished downloads in its cache, so a retry resumes rather than restarts
const FILE_LOCK_RETRY_DELAYS_SECS: &[u64] = &[5, 15, 30];

// antivirus scanning a freshly unpacked file makes uv's rename of its temp folder fail on windows
pub(crate) fn is_transient_file_lock(error: &str) -> bool {
    let error = error.to_ascii_lowercase();
    error.contains("os error 32")
        || error.contains("being used by another process")
        || (error.contains("os error 5") && error.contains("failed to rename"))
}

fn file_lock_message(app: &AppHandle, error: &str) -> String {
    let folder = runtime_dir(app)
        .map(|dir| dir.display().to_string())
        .unwrap_or_else(|_| "the AMVerge runtime folder".to_string());
    format!(
        "Windows kept one of the downloaded files locked, usually because antivirus software was \
         scanning it. Your downloads are kept, so Try again continues where this left off. If it \
         keeps happening, add an antivirus exclusion for {folder}.\n\n{error}"
    )
}

/// runs a uv step, rebuilding and rerunning it when a windows file lock (not a real failure) stops it
pub(crate) fn run_uv_step_with_lock_retry(
    app: &AppHandle,
    install_state: &ActiveInstall,
    pack: &str,
    build: impl Fn() -> Result<Command, String>,
    step_label: &str,
) -> Result<(), String> {
    let mut retries = FILE_LOCK_RETRY_DELAYS_SECS.iter();
    loop {
        let error = match run_uv_step(app, install_state, pack, build()?, step_label) {
            Ok(()) => return Ok(()),
            Err(error) => error,
        };
        if install_state.canceled() || !is_transient_file_lock(&error) {
            return Err(error);
        }
        let Some(&delay) = retries.next() else {
            return Err(file_lock_message(app, &error));
        };

        let attempt = FILE_LOCK_RETRY_DELAYS_SECS.len() - retries.len() + 1;
        let total = FILE_LOCK_RETRY_DELAYS_SECS.len() + 1;
        let note = format!(
            "A downloaded file was locked by another program (often antivirus). Retrying in {delay}s, attempt {attempt} of {total}..."
        );
        console_log("DEPS|retry", &format!("{step_label}: file lock, retry {attempt}/{total} in {delay}s"));
        emit_log(app, pack, &note);
        emit_progress(app, pack, "packages", 10, true, &note);

        for _ in 0..(delay * 4) {
            if install_state.canceled() {
                return Err("Install canceled.".to_string());
            }
            std::thread::sleep(std::time::Duration::from_millis(250));
        }
    }
}

pub(crate) fn install_ai_pack_inner(
    app: &AppHandle,
    install_state: &ActiveInstall,
    pack: &Pack,
    gpu: bool,
    gpu_decode: Option<bool>,
) -> Result<(), String> {
    let env_dir = ai_env_dir(app)?;
    let python = ai_env_python(app)?;
    std::fs::create_dir_all(runtime_dir(app)?).map_err(|e| e.to_string())?;

    let has_nelux = installed_distributions(app, &python)
        .map(|d| d.contains_key("nelux"))
        .unwrap_or(false);
    let want_nelux = gpu_decode.unwrap_or(has_nelux);

    console_log(
        "DEPS|install",
        &format!(
            "pack={} gpu={gpu} gpu_decode={want_nelux} (was {has_nelux})",
            pack.id
        ),
    );

    let wanted_python = if want_nelux {
        AI_ENV_PYTHON_VERSION_GPU_DECODE
    } else {
        AI_ENV_PYTHON_VERSION
    };

    // 1. provision the venv (uv downloads a standalone CPython the first time).
    let existing_python = if ai_env_ready(app) {
        env_python_version_of(&python)
    } else {
        None
    };

    // turning GPU decode off only removes Nelux; a full rebuild re-fetched gigabytes for nothing
    if gpu_decode == Some(false) && existing_python.is_some() {
        if has_nelux {
            emit_progress(app, pack.id, "packages", 50, true, "Removing GPU decode...");
            let mut cmd = uv_command(app)?;
            cmd.arg("pip")
                .arg("uninstall")
                .arg("--python")
                .arg(&python)
                .arg("nelux");
            run_uv_step(app, install_state, pack.id, cmd, "Removing GPU decode")?;
        }
        emit_progress(app, pack.id, "done", 100, false, "GPU decode removed.");
        return Ok(());
    }
    let needs_rebuild = match existing_python.as_deref() {
        None => true,
        Some(found) => want_nelux && found != AI_ENV_PYTHON_VERSION_GPU_DECODE,
    };

    // read BEFORE the rebuild empties the env, or every other pack gets dropped
    let packs_to_keep: Vec<&'static str> = if needs_rebuild && existing_python.is_some() {
        let before = installed_distributions(app, &python).unwrap_or_default();
        PACKS
            .iter()
            .filter(|p| {
                p.requires
                    .iter()
                    .all(|dist| before.contains_key(&dist.to_lowercase()))
            })
            .map(|p| p.extra)
            .collect()
    } else {
        Vec::new()
    };

    if needs_rebuild {
        if let Some(found) = existing_python.as_deref() {
            console_log(
                "DEPS|install",
                &format!("rebuilding env: on Python {found}, need {wanted_python}"),
            );
        }
        emit_progress(
            app,
            pack.id,
            "python",
            2,
            false,
            "Preparing the Python environment...",
        );
        let mut cmd = uv_command(app)?;
        cmd.arg("venv")
            .arg(&env_dir)
            .arg("--python")
            .arg(wanted_python);
        if existing_python.is_some() {
            cmd.arg("--clear");
        }
        run_uv_step(app, install_state, pack.id, cmd, "Environment setup")?;
    }
    if install_state.canceled() {
        return Err("Install canceled.".to_string());
    }

    // 2. pack and torch in ONE resolution: splitting them let PyPI win and install CPU torch
    let installed = installed_distributions(app, &python)?;
    let variant_matches = installed
        .get("torch")
        .map(|v| v.contains("+cu") == gpu)
        .unwrap_or(false);

    // install the target pack together with everything already installed as one spec
    let mut extras: Vec<&str> = PACKS
        .iter()
        .filter(|p| {
            p.requires
                .iter()
                .all(|dist| installed.contains_key(&dist.to_lowercase()))
        })
        .map(|p| p.extra)
        .collect();
    // whatever the rebuild wiped goes back in the same resolution
    for extra in &packs_to_keep {
        if !extras.contains(extra) {
            extras.push(extra);
        }
    }
    for extra in pack.extra.split(',') {
        if !extras.contains(&extra) {
            extras.push(extra);
        }
    }
    if want_nelux {
        extras.push("nelux");
    }

    // newest compatible patch, not just the bundled one, so a fresh install starts with every fix
    let spec = match bundled_cli_version(app) {
        Some(version) => format!("amverge[{}]{}", extras.join(","), super::cli_update::compatible_spec(&version)),
        None => format!("amverge[{}]", extras.join(",")),
    };

    emit_progress(
        app,
        pack.id,
        "packages",
        10,
        true,
        &format!(
            "Downloading {} and PyTorch ({})...",
            pack.id,
            if gpu { "GPU build, ~3 GB" } else { "CPU build, ~300 MB" }
        ),
    );

    let build_install = || -> Result<Command, String> {
        let mut cmd = uv_command(app)?;
        cmd.arg("pip")
            .arg("install")
            .arg("--python")
            .arg(&python)
            .arg(&spec);

        // always pin torch to the selected index; include torchvision only when depth is in the active extras
        cmd.arg("torch");
        if extras.contains(&"depth") {
            cmd.arg("torchvision");
        }

        if want_nelux {
            cmd.arg(TORCH_PIN_GPU_DECODE).arg(NELUX_PIN_GPU_DECODE);
        }

        if gpu {
            let on_cuda13 = installed
                .get("torch")
                .map(|v| v.contains("+cu13"))
                .unwrap_or(false);
            cmd.arg("--extra-index-url").arg(if want_nelux || on_cuda13 {
                TORCH_CUDA_INDEX_GPU_DECODE
            } else {
                TORCH_CUDA_INDEX
            });
        }

        // a CPU torch satisfies every constraint, so uv reports "no changes" without this
        if !variant_matches {
            for dist in TORCH_FAMILY {
                if installed.contains_key(*dist) {
                    cmd.arg("--reinstall-package").arg(dist);
                }
            }
        }
        Ok(cmd)
    };

    run_uv_step_with_lock_retry(app, install_state, pack.id, build_install, "Package install")?;

    // uv only warns about an extra the wheel lacks, so the step can "succeed" installing nothing; verify
    let after = installed_distributions(app, &python)?;
    let missing: Vec<&str> = pack
        .requires
        .iter()
        .copied()
        .filter(|dist| !after.contains_key(&dist.to_lowercase()))
        .collect();
    if !missing.is_empty() {
        return Err(format!(
            "The installed AMVerge CLI ({}) does not provide the [{}] extra, so {} could not be \
             installed. This feature needs a newer CLI release.",
            bundled_cli_version(app).unwrap_or_else(|| "unknown".to_string()),
            pack.extra,
            missing.join(", ")
        ));
    }

    // a CPU torch where GPU was asked for runs fine but far slower, so say so now
    if gpu {
        let torch_version = after.get("torch").cloned().unwrap_or_default();
        if !torch_version.contains("+cu") {
            return Err(format!(
                "PyTorch resolved to the CPU build ({torch_version}), so {} would run without GPU \
                 acceleration. This usually means no CUDA wheel exists for the version this \
                 pack requires.",
                pack.id
            ));
        }
    }

    // 4. drop the wheel cache, a second copy of every download (torch alone is gigabytes)
    emit_progress(app, pack.id, "cleanup", 95, false, "Cleaning up...");
    if let Ok(cache) = uv_cache_dir(app) {
        let _ = std::fs::remove_dir_all(cache);
    }

    emit_progress(app, pack.id, "cleanup", 100, false, "Done.");
    console_log("DEPS|install", &format!("pack={} ok", pack.id));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_transient_file_lock;

    #[test]
    fn retries_windows_file_locks_from_uv() {
        let colorama = r"Package install failed (exit code: 2):
error: Failed to download `colorama==0.4.6`
  Caused by: Failed to write to the distribution cache
  Caused by: failed to rename file from C:\Users\x\AppData\Local\AMVerge\runtime\uv-cache\.tmpGj0w7y to C:\Users\x\AppData\Local\AMVerge\runtime\uv-cache\archive-v0\oBKusLaeVd56XREc: The process cannot access the file because it is being used by another process. (os error 32)";
        let hf_xet = r"error: Failed to download `hf-xet==1.8.0`
  Caused by: failed to rename file from C:\a\uv-cache\.tmpGJX499 to C:\a\uv-cache\archive-v0\Tb1c1_f6XcneHE0g: The process cannot access the file because it is being used by another process. (os error 32)";
        let access_denied_rename = r"Caused by: failed to rename file from C:\a\.tmp1 to C:\a\archive-v0\b: Access is denied. (os error 5)";
        assert!(is_transient_file_lock(colorama));
        assert!(is_transient_file_lock(hf_xet));
        assert!(is_transient_file_lock(access_denied_rename));
    }

    #[test]
    fn does_not_retry_real_failures() {
        assert!(!is_transient_file_lock(r"error: Failed to fetch: `https://pypi.org/simple/torch/`
  Caused by: dns error: No such host is known. (os error 11001)"));
        assert!(!is_transient_file_lock("error: No solution found when resolving dependencies"));
        assert!(!is_transient_file_lock(r"error: failed to create directory C:\Program Files\x: Access is denied. (os error 5)"));
        assert!(!is_transient_file_lock("Install canceled."));
    }
}
