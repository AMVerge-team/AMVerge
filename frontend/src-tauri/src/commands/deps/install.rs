use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};

use tauri::AppHandle;

use crate::state::ActiveInstall;
use crate::utils::logging::{console_log, sanitize_for_console};
use crate::utils::sidecar::{
    ai_env_dir, ai_env_python, ai_env_ready, app_data_dir, bundled_cli_version, uv_cache_dir,
};

use super::packs::{Pack, AI_ENV_PYTHON_VERSION, PACKS, TORCH_CUDA_INDEX, TORCH_FAMILY};
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
        // uv redraws its progress in place with \r rather than one line per
        // update, so read to the newline and split on both terminators to catch
        // those intermediate redraws
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
) -> Result<(), String> {
    let env_dir = ai_env_dir(app)?;
    let python = ai_env_python(app)?;
    std::fs::create_dir_all(app_data_dir(app)?).map_err(|e| e.to_string())?;

    console_log("DEPS|install", &format!("pack={} gpu={gpu}", pack.id));

    // 1. provision the venv (uv downloads a standalone CPython the first time)
    if !ai_env_ready(app) {
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
            .arg(AI_ENV_PYTHON_VERSION);
        run_uv_step(app, install_state, pack.id, cmd, "Environment setup")?;
    }
    if install_state.canceled() {
        return Err("Install canceled.".to_string());
    }

    // 2. the pack and torch in ONE resolution. splitting them was the bug behind
    //    CPU-only depth maps: the pack resolution ran against plain PyPI, and
    //    depth-anything-v2's `torchvision<0.23` ceiling forced torch down to a
    //    version it then satisfied with the CPU wheel, silently replacing the
    //    CUDA build installed moments earlier
    let installed = installed_distributions(app, &python)?;
    let variant_matches = installed
        .get("torch")
        .map(|v| v.contains("+cu") == gpu)
        .unwrap_or(false);

    // install the target pack together with everything already installed, as one
    // spec. installing packs one at a time let each re-resolve torch on its own
    // terms: `interpolation` has no torchvision ceiling, so it would happily
    // upgrade torch to a version with no CUDA wheel and undo `depth`'s install.
    // a single resolution has to satisfy every pack at once
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
    extras.push(pack.extra);

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

    // torch AND torchvision, even for a pack that only needs torch. torchvision
    // is ABI-locked to one torch build, so a later pack pulling it in (depth,
    // via depth-anything-v2) would make uv replace the torch already on disk.
    // on Windows that replace fails outright if any process has torch's
    // _C.*.pyd loaded, and the half-finished swap leaves the env with no torch
    // metadata - unusable, and not recoverable by retrying. laying both down in
    // the first resolution means later packs find a matched pair already there
    for dist in TORCH_FAMILY {
        cmd.arg(dist);
    }

    if gpu {
        // uv gives an extra index priority over the default one and, under the
        // default first-index strategy, resolves a package exclusively from the
        // first index that carries it. so torch/torchvision come only from the
        // CUDA index (which never serves a CPU wheel), while av, opencv and the
        // rest (absent there) fall through to PyPI.
        //
        // do NOT add --index-strategy unsafe-best-match here: it picks the
        // highest version across all indexes, and PyPI ships newer torch
        // releases than the CUDA index does, so it silently selects a CPU wheel
        cmd.arg("--extra-index-url").arg(TORCH_CUDA_INDEX);
    }

    // an already-installed CPU torch satisfies every constraint, so uv would
    // report "no changes" and leave it in place. force the swap when the variant
    // on disk isn't the one being asked for
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

    // a CPU torch where a GPU one was asked for means the feature will run, but
    // at a fraction of the speed; the failure this whole single-resolution
    // change exists to prevent. say so instead of leaving it to be discovered
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
