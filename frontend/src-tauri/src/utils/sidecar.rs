use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Command, ExitStatus, Stdio};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager};

use crate::utils::process::{apply_no_window, bind_to_app_lifetime};

pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

/// shared python runtime (uv cache, python, AI venv) under local data, named for the product so the extension finds it
pub fn shared_runtime_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var("AMVERGE_RUNTIME_DIR") {
        if !dir.trim().is_empty() {
            return Ok(PathBuf::from(dir));
        }
    }
    Ok(app
        .path()
        .local_data_dir()
        .map_err(|e| e.to_string())?
        .join("AMVerge")
        .join("runtime"))
}

/// the runtime in use: an existing legacy env stays where it is, since a venv can't be moved
pub fn runtime_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(pick_runtime_dir(
        shared_runtime_dir(app)?,
        app_data_dir(app).ok(),
        |root| venv_python_in(root).is_file(),
    ))
}

/// shared unless the legacy location already has an env; `has_env` is injected for tests
fn pick_runtime_dir<F>(shared: PathBuf, legacy: Option<PathBuf>, has_env: F) -> PathBuf
where
    F: Fn(&PathBuf) -> bool,
{
    if has_env(&shared) {
        return shared;
    }
    if let Some(legacy) = legacy {
        if has_env(&legacy) {
            return legacy;
        }
    }
    shared
}

fn venv_python_in(runtime_root: &PathBuf) -> PathBuf {
    venv_bin_dir(&runtime_root.join("pyenv")).join(exe_name("python"))
}

#[cfg(test)]
mod runtime_dir_tests {
    use super::*;

    fn shared() -> PathBuf {
        PathBuf::from("/local/AMVerge/runtime")
    }
    fn legacy() -> PathBuf {
        PathBuf::from("/roaming/app.amverge")
    }

    #[test]
    fn existing_legacy_env_is_used_where_it_stands() {
        // a venv hardcodes its own path, so moving one would break it
        let picked = pick_runtime_dir(shared(), Some(legacy()), |root| *root == legacy());
        assert_eq!(picked, legacy());
    }

    #[test]
    fn shared_wins_when_both_exist() {
        let picked = pick_runtime_dir(shared(), Some(legacy()), |_| true);
        assert_eq!(picked, shared());
    }

    #[test]
    fn new_installs_go_to_shared() {
        let picked = pick_runtime_dir(shared(), Some(legacy()), |_| false);
        assert_eq!(picked, shared());
    }

    #[test]
    fn missing_legacy_path_is_not_fatal() {
        let picked = pick_runtime_dir(shared(), None, |_| false);
        assert_eq!(picked, shared());
    }
}

pub fn ai_env_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_dir(app)?.join("pyenv"))
}

pub fn uv_python_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_dir(app)?.join("python"))
}

pub fn uv_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_dir(app)?.join("uv-cache"))
}

/// `Scripts` on Windows, `bin` everywhere else
fn venv_bin_dir(root: &PathBuf) -> PathBuf {
    if cfg!(windows) {
        root.join("Scripts")
    } else {
        root.join("bin")
    }
}

fn exe_name(stem: &str) -> String {
    if cfg!(windows) {
        format!("{stem}.exe")
    } else {
        stem.to_string()
    }
}

pub fn ai_env_python(app: &AppHandle) -> Result<PathBuf, String> {
    let root = ai_env_dir(app)?;
    Ok(venv_bin_dir(&root).join(exe_name("python")))
}

pub fn ai_env_amverge(app: &AppHandle) -> Result<PathBuf, String> {
    let root = ai_env_dir(app)?;
    Ok(venv_bin_dir(&root).join(exe_name("amverge")))
}

/// true once the AI venv has an interpreter; a half-provisioned one counts as missing
pub fn ai_env_ready(app: &AppHandle) -> bool {
    ai_env_python(app).map(|p| p.is_file()).unwrap_or(false)
}

/// the dev CLI checkout's editable venv, which already has every extra
fn dev_venv_dir() -> Result<PathBuf, String> {
    // current_dir is frontend/src-tauri during `tauri dev`; pop to the repo root
    let mut root = std::env::current_dir().map_err(|e| e.to_string())?;
    root.pop();
    root.pop();
    let cli_dir = std::env::var("AMVERGE_CLI_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::var("HOME").ok().map(|h| PathBuf::from(h).join("AMVerge-CLI")).unwrap_or_else(|| root.join("AMVerge-CLI")));
    Ok(cli_dir.join(".venv"))
}

fn dev_amverge_exe() -> Result<PathBuf, String> {
    Ok(venv_bin_dir(&dev_venv_dir()?).join(exe_name("amverge")))
}

pub fn dev_python_exe() -> Result<PathBuf, String> {
    Ok(venv_bin_dir(&dev_venv_dir()?).join(exe_name("python")))
}

fn sidecar_rel_dir() -> Result<&'static str, String> {
    if cfg!(windows) {
        Ok("bin/amverge-x86_64-pc-windows-msvc")
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Ok("bin/amverge-aarch64-apple-darwin")
    } else if cfg!(target_os = "macos") {
        Ok("bin/amverge-x86_64-apple-darwin")
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        Ok("bin/amverge-x86_64-unknown-linux-gnu")
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        Ok("bin/amverge-aarch64-unknown-linux-gnu")
    } else {
        Err("amverge sidecar: unsupported platform".to_string())
    }
}

/// directory holding the bundled sidecar (its `_internal` carries ffmpeg/ffprobe)
pub fn sidecar_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve(sidecar_rel_dir()?, tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())
}

fn prod_amverge_exe(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(sidecar_dir(app)?.join(exe_name("amverge")))
}

/// the `uv` binary shipped as a resource, used to provision the AI env
pub fn uv_binary(app: &AppHandle) -> Result<PathBuf, String> {
    let triple = if cfg!(windows) {
        "x86_64-pc-windows-msvc"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(target_os = "macos") {
        "x86_64-apple-darwin"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "x86_64-unknown-linux-gnu"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "aarch64-unknown-linux-gnu"
    } else {
        return Err("uv: unsupported platform".to_string());
    };
    let rel = format!("bin/uv/{triple}/{}", exe_name("uv"));

    if cfg!(debug_assertions) {
        // staged by `npm run fetch:uv`; current_dir is frontend/src-tauri under `tauri dev`
        let dir = std::env::current_dir().map_err(|e| e.to_string())?;
        return Ok(dir.join("bin").join("uv").join(triple).join(exe_name("uv")));
    }

    app.path()
        .resolve(&rel, tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())
}

/// the CLI version baked into the sidecar, which the AI env installs so they never drift
pub fn bundled_cli_version(app: &AppHandle) -> Option<String> {
    let path = sidecar_dir(app).ok()?.join("_internal").join("cli-version.txt");
    let raw = std::fs::read_to_string(path).ok()?;
    let trimmed = raw.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

/// the AMVerge CLI as a ready `Command`: the dev checkout's venv in debug, the bundled sidecar in release
pub fn amverge_command(app: &AppHandle) -> Result<Command, String> {
    let exe = if cfg!(debug_assertions) {
        dev_amverge_exe()?
    } else {
        prod_amverge_exe(app)?
    };
    Ok(base_command(exe))
}

/// like [`amverge_command`] but from the AI venv (sidecar `_internal` on PATH for ffmpeg); falls back to the sidecar so the CLI explains a missing pack
pub fn amverge_ai_command(app: &AppHandle) -> Result<Command, String> {
    if cfg!(debug_assertions) {
        // the dev venv already has every extra installed
        return Ok(base_command(dev_amverge_exe()?));
    }

    // a venv without its amverge script (install interrupted) must not be launched
    let ai_exe = ai_env_amverge(app)?;
    if !ai_env_ready(app) || !ai_exe.is_file() {
        return amverge_command(app);
    }

    let mut cmd = base_command(ai_exe);
    if let Ok(dir) = sidecar_dir(app) {
        let internal = dir.join("_internal");
        let existing = std::env::var_os("PATH").unwrap_or_default();
        let mut paths = vec![internal];
        paths.extend(std::env::split_paths(&existing));
        if let Ok(joined) = std::env::join_paths(paths) {
            cmd.env("PATH", joined);
        }
    }
    Ok(cmd)
}

fn base_command(exe: PathBuf) -> Command {
    let mut cmd = Command::new(exe);
    apply_no_window(&mut cmd);
    // utf-8 pipes and files: windows python otherwise decodes stdin as cp1252, so the daemon read "C³" as "CÂ³"
    cmd.env("PYTHONUTF8", "1");
    // a user's own PYTHONIOENCODING would override utf-8 mode for the pipes
    cmd.env("PYTHONIOENCODING", "utf-8");
    #[cfg(not(windows))]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    cmd
}

/// the CLI executable name for logging
pub fn amverge_exe_name() -> &'static str {
    if cfg!(windows) {
        "amverge.exe"
    } else {
        "amverge"
    }
}

pub struct CliOutput {
    pub stdout: String,
    pub stderr: String,
    pub status: ExitStatus,
}

pub fn parse_progress_line(line: &str) -> Option<(u8, String)> {
    let rest = line.strip_prefix("PROGRESS|")?;
    let mut parts = rest.splitn(2, '|');
    let pct = parts.next()?.trim().parse::<u8>().ok()?;
    let msg = parts.next().unwrap_or("").to_string();
    Some((pct, msg))
}

pub async fn run_cli_process<F>(
    mut cmd: Command,
    label: &str,
    pid_tracker: Option<&Arc<Mutex<Vec<u32>>>>,
    mut on_stderr_line: F,
) -> Result<CliOutput, String>
where
    F: FnMut(&str) + Send + 'static,
{
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn {label}: {e}"))?;
    let child_pid = child.id();
    bind_to_app_lifetime(child_pid);
    if let Some(pids) = pid_tracker {
        if let Ok(mut lock) = pids.lock() {
            lock.push(child_pid);
        }
    }

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let stderr_accum = Arc::new(Mutex::new(String::new()));
    let stderr_accum_thread = Arc::clone(&stderr_accum);
    let stderr_handle = tokio::task::spawn_blocking(move || {
        for line in BufReader::new(stderr).lines().flatten() {
            if let Ok(mut acc) = stderr_accum_thread.lock() {
                acc.push_str(&line);
                acc.push('\n');
            }
            on_stderr_line(&line);
        }
    });

    let stdout_string = tokio::task::spawn_blocking(move || {
        let mut buf = String::new();
        BufReader::new(stdout).read_to_string(&mut buf).map(|_| buf)
    })
    .await
    .map_err(|e| format!("stdout thread panicked: {e}"))?
    .map_err(|e| format!("Failed reading stdout: {e}"))?;

    let _ = stderr_handle.await;
    let status = tokio::task::spawn_blocking(move || child.wait())
        .await
        .map_err(|e| format!("wait thread panicked: {e}"))?
        .map_err(|e| format!("Failed waiting for {label}: {e}"))?;

    if let Some(pids) = pid_tracker {
        if let Ok(mut lock) = pids.lock() {
            lock.retain(|p| *p != child_pid);
        }
    }

    let stderr_string = stderr_accum
        .lock()
        .map(|s| s.clone())
        .unwrap_or_default();

    Ok(CliOutput {
        stdout: stdout_string,
        stderr: stderr_string,
        status,
    })
}
