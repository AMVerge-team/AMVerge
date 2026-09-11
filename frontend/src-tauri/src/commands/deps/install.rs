use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};

use tauri::AppHandle;

use crate::state::ActiveInstall;
use crate::utils::logging::{console_log, sanitize_for_console};
use crate::utils::sidecar::{
    ai_env_dir, ai_env_python, ai_env_ready, app_data_dir, bundled_cli_version, uv_cache_dir,
};

use super::packs::{
    Pack, AI_ENV_PYTHON_VERSION, AI_ENV_PYTHON_VERSION_GPU_DECODE, PACKS, TORCH_CUDA_INDEX,
    TORCH_CUDA_INDEX_GPU_DECODE, TORCH_FAMILY, TORCH_PIN_GPU_DECODE,
};
use super::status::env_python_version_of;
use super::progress::{emit_log, emit_progress, report_uv_progress};
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
    if let Ok(mut lock) = install_state.pid.lock() {
        *lock = Some(child.id());
    }

    // uv writes its progress to stderr and command output to stdout. drain
    // stdout on its own thread so a full pipe can never deadlock the reader
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
    let mut total_packages = 0usize;
    let mut downloaded = 0usize;
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
                    report_uv_progress(
                        app,
                        pack,
                        &sanitized,
                        &mut total_packages,
                        &mut downloaded,
                    );
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

pub(crate) fn install_ai_pack_inner(
    app: &AppHandle,
    install_state: &ActiveInstall,
    pack: &Pack,
    gpu: bool,
    gpu_decode: bool,
) -> Result<(), String> {
    let env_dir = ai_env_dir(app)?;
    let python = ai_env_python(app)?;
    std::fs::create_dir_all(app_data_dir(app)?).map_err(|e| e.to_string())?;

    console_log(
        "DEPS|install",
        &format!("pack={} gpu={gpu} gpu_decode={gpu_decode}", pack.id),
    );

    // GPU decode needs its own interpreter and CUDA index, so switching between
    // the two profiles means rebuilding the environment rather than adding to it
    let wanted_python = if gpu_decode {
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
    let needs_rebuild = match existing_python.as_deref() {
        None => true,
        Some(found) => found != wanted_python,
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
            p.id != pack.id
                && p.requires
                    .iter()
                    .all(|dist| installed.contains_key(&dist.to_lowercase()))
        })
        .map(|p| p.extra)
        .collect();
    // whatever the rebuild wiped goes back in the same resolution
    for extra in &packs_to_keep {
        if *extra != pack.extra && !extras.contains(extra) {
            extras.push(extra);
        }
    }
    extras.push(pack.extra);
    if gpu_decode {
        extras.push("nelux");
    }

    let spec = match bundled_cli_version(app) {
        Some(version) => format!("amverge[{}]=={version}", extras.join(",")),
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

    let mut cmd = uv_command(app)?;
    cmd.arg("pip")
        .arg("install")
        .arg("--python")
        .arg(&python)
        .arg(&spec);

    // both, always: torchvision is ABI-locked to torch, so a later pack would swap it
    for dist in TORCH_FAMILY {
        cmd.arg(dist);
    }

    if gpu_decode {
        cmd.arg(TORCH_PIN_GPU_DECODE);
    }

    if gpu {
        // do NOT add --index-strategy unsafe-best-match: it would pick PyPI's newer
        // torch over the CUDA index and silently land a CPU wheel
        cmd.arg("--extra-index-url").arg(if gpu_decode {
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

    run_uv_step(app, install_state, pack.id, cmd, "Package install")?;

    // uv only warns about an extra the published wheel doesn't define, so the
    // step "succeeds" while installing none of the pack's packages. verify
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

    // 4. the wheel cache holds a second copy of every download (torch alone is
    //    gigabytes), so drop it once the env is built
    emit_progress(app, pack.id, "cleanup", 95, false, "Cleaning up...");
    if let Ok(cache) = uv_cache_dir(app) {
        let _ = std::fs::remove_dir_all(cache);
    }

    emit_progress(app, pack.id, "cleanup", 100, false, "Done.");
    console_log("DEPS|install", &format!("pack={} ok", pack.id));
    Ok(())
}
