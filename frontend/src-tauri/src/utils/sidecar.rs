use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Stdio};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager};

use crate::utils::process::{apply_no_window, bind_to_app_lifetime};

const AI_STORAGE_POINTER_FILE: &str = "ai_storage_path.txt";
pub(crate) const SIGLIP_CACHE_DIR_NAME: &str = "models--google--siglip2-so400m-patch16-naflex";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AiLocation {
    pub root: PathBuf,
    pub runtime_dir: PathBuf,
    pub config_dir: Option<PathBuf>,
    pub hf_home_dir: Option<PathBuf>,
    pub custom_path: Option<PathBuf>,
}

pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

pub fn load_custom_ai_root(app: &AppHandle) -> Option<PathBuf> {
    let pointer = app_data_dir(app).ok()?.join(AI_STORAGE_POINTER_FILE);
    let raw = std::fs::read_to_string(pointer).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(PathBuf::from(trimmed))
    }
}

pub fn save_custom_ai_root(app: &AppHandle, custom: Option<&Path>) -> Result<(), String> {
    let dir = app_data_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let pointer = dir.join(AI_STORAGE_POINTER_FILE);
    match custom {
        Some(p) => {
            let trimmed = p.to_string_lossy().trim().to_string();
            if trimmed.is_empty() {
                if pointer.is_file() {
                    let _ = std::fs::remove_file(pointer);
                }
            } else {
                let temp = dir.join(format!("ai_storage_path.{}.tmp", uuid::Uuid::new_v4().simple()));
                std::fs::write(&temp, trimmed).map_err(|e| e.to_string())?;
                std::fs::rename(&temp, &pointer).map_err(|e| e.to_string())?;
            }
        }
        None => {
            if pointer.is_file() {
                std::fs::remove_file(pointer).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
}

pub(crate) fn legacy_cli_config_dir() -> Option<PathBuf> {
    let config = match std::env::var_os("APPDATA").filter(|v| !v.is_empty()) {
        Some(appdata) => PathBuf::from(appdata).join("com.amverge.cli"),
        None => {
            let home = home_dir()?;
            if cfg!(windows) {
                home.join("AppData").join("Roaming").join("com.amverge.cli")
            } else if cfg!(target_os = "macos") {
                home.join("Library")
                    .join("Application Support")
                    .join("com.amverge.cli")
            } else {
                home.join(".config").join("com.amverge.cli")
            }
        }
    };
    Some(config)
}

pub(crate) fn legacy_cli_models_dir() -> Option<PathBuf> {
    Some(legacy_cli_config_dir()?.join("models"))
}

pub(crate) fn legacy_scout_model_dir() -> Option<PathBuf> {
    let env_dir = |key: &str| std::env::var_os(key).filter(|v| !v.is_empty()).map(PathBuf::from);
    let hub = env_dir("HF_HUB_CACHE")
        .or_else(|| env_dir("HF_HOME").map(|home| home.join("hub")))
        .or_else(|| env_dir("XDG_CACHE_HOME").map(|cache| cache.join("huggingface").join("hub")))
        .or_else(|| home_dir().map(|home| home.join(".cache").join("huggingface").join("hub")))?;
    Some(hub.join(SIGLIP_CACHE_DIR_NAME))
}

fn is_system_install_dir(dir: &Path) -> bool {
    let norm = dir.to_string_lossy().to_lowercase();
    if cfg!(windows) {
        let mut system_prefixes = vec![
            "\\program files\\".to_string(),
            "\\program files (x86)\\".to_string(),
            "\\windows\\".to_string(),
        ];
        for key in ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432", "SystemRoot"] {
            if let Ok(val) = std::env::var(key) {
                let low = val.trim().to_lowercase();
                if !low.is_empty() {
                    if norm == low || norm.starts_with(&(low.clone() + "\\")) {
                        return true;
                    }
                    system_prefixes.push(low);
                }
            }
        }
        system_prefixes.iter().any(|p| norm.contains(p))
    } else if cfg!(target_os = "macos") {
        norm.starts_with("/applications/") || norm.contains(".app/contents/")
    } else {
        norm.starts_with("/usr/") || norm.starts_with("/opt/") || norm.starts_with("/bin/")
    }
}

fn dir_is_writable(dir: &Path) -> bool {
    if !dir.is_dir() {
        return false;
    }
    let probe = dir.join(format!(".amverge-write-probe-{}", std::process::id()));
    match std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&probe)
    {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// Default AI root for release builds when installed outside protected system directories (e.g. `D:\AMVerge\ai`).
fn install_adjacent_ai_root() -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        return None;
    }
    let exe = std::env::current_exe().ok()?;
    let parent = exe.parent()?;
    if is_system_install_dir(parent) {
        return None;
    }
    let candidate = parent.join("ai");
    if candidate.is_dir() {
        if dir_is_writable(&candidate) {
            return Some(candidate);
        }
        return None;
    }
    if dir_is_writable(parent) {
        return Some(candidate);
    }
    None
}

/// Default AI root if no legacy AppData install or custom override exists (e.g. `D:\AMVerge\ai`).
pub fn default_ai_root(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(install_ai) = install_adjacent_ai_root() {
        return Ok(install_ai);
    }
    Ok(app
        .path()
        .local_data_dir()
        .map_err(|e| e.to_string())?
        .join("AMVerge"))
}

fn custom_ai_location(custom_root: PathBuf) -> AiLocation {
    AiLocation {
        runtime_dir: custom_root.join("runtime"),
        config_dir: Some(custom_root.join("config")),
        hf_home_dir: Some(custom_root.join("hf-cache")),
        custom_path: Some(custom_root.clone()),
        root: custom_root,
    }
}

pub fn resolve_ai_location_for_move(
    app: &AppHandle,
    custom_root: Option<&Path>,
) -> Result<AiLocation, String> {
    if let Some(root) = custom_root {
        return Ok(custom_ai_location(root.to_path_buf()));
    }
    resolve_default_ai_location(app)
}

/// Resolves the active AI storage root, keeping existing AppData/legacy installs working until moved.
pub fn resolve_ai_location(app: &AppHandle) -> Result<AiLocation, String> {
    if let Ok(dir) = std::env::var("AMVERGE_RUNTIME_DIR") {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            let runtime_dir = PathBuf::from(trimmed);
            let root = runtime_dir
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| runtime_dir.clone());
            return Ok(AiLocation {
                root,
                runtime_dir,
                config_dir: None,
                hf_home_dir: None,
                custom_path: None,
            });
        }
    }

    if let Some(custom_root) = load_custom_ai_root(app) {
        return Ok(custom_ai_location(custom_root));
    }

    resolve_default_ai_location(app)
}

fn resolve_default_ai_location(app: &AppHandle) -> Result<AiLocation, String> {
    let local_root = app
        .path()
        .local_data_dir()
        .map_err(|e| e.to_string())?
        .join("AMVerge");
    let local_runtime = local_root.join("runtime");
    let legacy_appdata = app_data_dir(app).ok();

    // Preserve any existing legacy/local AppData AI venv untouched until the user moves it.
    let existing_legacy = pick_existing_legacy_runtime(&local_runtime, legacy_appdata.as_ref());
    if let Some(runtime_dir) = existing_legacy {
        let root = runtime_dir
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| runtime_dir.clone());
        return Ok(AiLocation {
            root,
            runtime_dir,
            config_dir: None,
            hf_home_dir: None,
            custom_path: None,
        });
    }

    if let Some(install_ai) = install_adjacent_ai_root() {
        return Ok(AiLocation {
            runtime_dir: install_ai.join("runtime"),
            config_dir: Some(install_ai.join("config")),
            hf_home_dir: Some(install_ai.join("hf-cache")),
            custom_path: None,
            root: install_ai,
        });
    }

    if cfg!(debug_assertions) {
        return Ok(AiLocation {
            root: local_root,
            runtime_dir: local_runtime,
            config_dir: None,
            hf_home_dir: None,
            custom_path: None,
        });
    }

    Ok(AiLocation {
        runtime_dir: local_runtime,
        config_dir: Some(local_root.join("config")),
        hf_home_dir: Some(local_root.join("hf-cache")),
        custom_path: None,
        root: local_root,
    })
}

fn pick_existing_legacy_runtime(
    local_runtime: &PathBuf,
    legacy_appdata: Option<&PathBuf>,
) -> Option<PathBuf> {
    if venv_python_in(local_runtime).is_file() {
        return Some(local_runtime.clone());
    }
    if let Some(legacy) = legacy_appdata {
        if venv_python_in(legacy).is_file() {
            return Some(legacy.clone());
        }
    }
    None
}

/// shared python runtime (uv cache, python, AI venv) under the resolved AI location
#[allow(dead_code)]
pub fn shared_runtime_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resolve_ai_location(app)?.runtime_dir)
}

/// the runtime in use: an existing legacy env stays where it is until moved
pub fn runtime_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resolve_ai_location(app)?.runtime_dir)
}

/// shared unless the legacy location already has an env; `has_env` is injected for tests
#[allow(dead_code)]
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

fn venv_python_in(runtime_root: &Path) -> PathBuf {
    venv_bin_dir(&runtime_root.join("pyenv")).join(exe_name("python"))
}

pub(crate) fn cli_models_dir_for_app(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(loc) = resolve_ai_location(app) {
        if let Some(config) = loc.config_dir {
            let candidate = config.join("models");
            if candidate.is_dir() || loc.custom_path.is_some() {
                return Some(candidate);
            }
            if let Some(legacy) = legacy_cli_models_dir().filter(|p| p.is_dir()) {
                return Some(legacy);
            }
            return Some(candidate);
        }
    }
    legacy_cli_models_dir()
}

pub(crate) fn scout_model_dir_for_app(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(loc) = resolve_ai_location(app) {
        if let Some(hf) = loc.hf_home_dir {
            let candidate = hf.join("hub").join(SIGLIP_CACHE_DIR_NAME);
            if candidate.is_dir() || loc.custom_path.is_some() {
                return Some(candidate);
            }
            if let Some(legacy) = legacy_scout_model_dir().filter(|p| p.is_dir()) {
                return Some(legacy);
            }
            return Some(candidate);
        }
    }
    legacy_scout_model_dir()
}

pub(crate) fn apply_ai_env_vars(app: &AppHandle, cmd: &mut Command) {
    cmd.env("AMVERGE_CALLER_APP", "amverge")
        .env("AMVERGE_CALLER_VERSION", app.package_info().version.to_string());
    if let Ok(loc) = resolve_ai_location(app) {
        if let Some(config) = loc.config_dir {
            cmd.env("AMVERGE_CONFIG_DIR", config);
        }
        if let Some(hf) = loc.hf_home_dir {
            cmd.env("HF_HOME", &hf)
                .env("HF_HUB_CACHE", hf.join("hub"))
                .env_remove("TRANSFORMERS_CACHE");
        }
    }
}

pub(crate) fn patch_pyvenv_home(
    pyvenv_cfg: &Path,
    old_python_root: &Path,
    new_python_root: &Path,
) -> Result<(), String> {
    if !pyvenv_cfg.is_file() {
        return Ok(());
    }
    let content = std::fs::read_to_string(pyvenv_cfg).map_err(|e| e.to_string())?;
    let old_prefix = old_python_root.to_string_lossy().to_string();
    let new_prefix = new_python_root.to_string_lossy().to_string();
    let old_prefix_lower = old_prefix.to_lowercase();

    let mut changed = false;
    let mut out_lines = Vec::new();
    for line in content.lines() {
        if let Some((key, val)) = line.split_once('=') {
            let k_trim = key.trim();
            if k_trim.eq_ignore_ascii_case("home") || k_trim.eq_ignore_ascii_case("executable") {
                let v_trim = val.trim();
                let v_lower = v_trim.to_lowercase();
                if v_lower.starts_with(&old_prefix_lower) {
                    let suffix = &v_trim[old_prefix.len()..];
                    out_lines.push(format!("{k_trim} = {new_prefix}{suffix}"));
                    changed = true;
                    continue;
                }
            }
        }
        out_lines.push(line.to_string());
    }
    if changed {
        let mut updated = out_lines.join("\n");
        if content.ends_with('\n') {
            updated.push('\n');
        }
        std::fs::write(pyvenv_cfg, updated).map_err(|e| e.to_string())?;
    }
    Ok(())
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

    #[test]
    fn system_install_dirs_are_detected() {
        if cfg!(windows) {
            assert!(is_system_install_dir(Path::new("C:\\Program Files\\AMVerge")));
            assert!(is_system_install_dir(Path::new("C:\\Program Files (x86)\\AMVerge")));
            assert!(!is_system_install_dir(Path::new("D:\\AMVerge")));
        }
    }

    #[test]
    fn patch_pyvenv_home_updates_prefix_preserving_cpython_subdir() {
        let temp = std::env::temp_dir().join(format!("amverge-pyvenv-test-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp);
        let cfg = temp.join("pyvenv.cfg");
        let old_py = PathBuf::from("C:\\Users\\alex\\AppData\\Local\\AMVerge\\runtime\\python");
        let new_py = PathBuf::from("D:\\AMVerge\\ai\\runtime\\python");
        std::fs::write(
            &cfg,
            "home = C:\\Users\\alex\\AppData\\Local\\AMVerge\\runtime\\python\\cpython-3.12.9-windows-x86_64-none\nimplementation = CPython\n",
        )
        .unwrap();

        patch_pyvenv_home(&cfg, &old_py, &new_py).unwrap();
        let written = std::fs::read_to_string(&cfg).unwrap();
        assert!(written.contains("home = D:\\AMVerge\\ai\\runtime\\python\\cpython-3.12.9-windows-x86_64-none"));
        let _ = std::fs::remove_dir_all(&temp);
    }

    #[test]
    fn dev_cli_prefers_the_sibling_checkout() {
        let root = tempfile::tempdir().unwrap();
        let sibling = root.path().join("sibling");
        let home = root.path().join("home");
        std::fs::create_dir(&sibling).unwrap();
        std::fs::create_dir(&home).unwrap();
        for override_dir in [None, Some(""), Some("  ")] {
            assert_eq!(dev_cli_dir(override_dir, sibling.clone(), Some(home.clone())), sibling);
        }
    }

    #[test]
    fn explicit_dev_cli_checkout_is_preserved() {
        let custom = PathBuf::from("/custom/AMVerge-CLI");
        assert_eq!(dev_cli_dir(custom.to_str(), PathBuf::from("/sibling"), None), custom);
    }

    #[test]
    fn dev_cli_uses_home_when_the_sibling_checkout_is_missing() {
        let root = tempfile::tempdir().unwrap();
        let home = root.path().join("home");
        std::fs::create_dir(&home).unwrap();
        assert_eq!(dev_cli_dir(None, root.path().join("missing"), Some(home.clone())), home);
    }

    #[test]
    fn missing_dev_checkouts_keep_the_expected_sibling_path() {
        let root = tempfile::tempdir().unwrap();
        let sibling = root.path().join("sibling");
        assert_eq!(dev_cli_dir(None, sibling.clone(), None), sibling);
        assert_eq!(dev_cli_dir(None, sibling.clone(), Some(root.path().join("missing"))), sibling);
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
fn venv_bin_dir(root: &Path) -> PathBuf {
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
    let sibling = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .unwrap()
        .join("AMVerge-CLI");
    let home = std::env::var_os("HOME").map(|dir| PathBuf::from(dir).join("AMVerge-CLI"));
    let cli_dir = dev_cli_dir(std::env::var("AMVERGE_CLI_DIR").ok().as_deref(), sibling, home);
    Ok(cli_dir.join(".venv"))
}

fn dev_cli_dir(override_dir: Option<&str>, sibling: PathBuf, home: Option<PathBuf>) -> PathBuf {
    if let Some(dir) = override_dir.filter(|dir| !dir.trim().is_empty()) {
        return PathBuf::from(dir);
    }
    if sibling.is_dir() {
        return sibling;
    }
    home.filter(|dir| dir.is_dir()).unwrap_or(sibling)
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
    if cfg!(debug_assertions) && !exe.is_file() {
        return Err(format!(
            "AMVerge CLI executable not found at '{}'. Run setup.sh / setup.ps1 or set AMVERGE_CLI_DIR to the CLI checkout.",
            exe.display()
        ));
    }
    let mut cmd = base_command(exe);
    apply_ai_env_vars(app, &mut cmd);
    Ok(cmd)
}

/// like [`amverge_command`] but from the AI venv via `python -m amverge` (safe across relocated venvs, with sidecar `_internal` on PATH for ffmpeg)
pub fn amverge_ai_command(app: &AppHandle) -> Result<Command, String> {
    if cfg!(debug_assertions) {
        let mut cmd = base_command(dev_amverge_exe()?);
        apply_ai_env_vars(app, &mut cmd);
        return Ok(cmd);
    }

    // a venv without its amverge script (install interrupted) must not be launched
    let ai_exe = ai_env_amverge(app)?;
    let ai_py = ai_env_python(app)?;
    if !ai_env_ready(app) || !ai_exe.is_file() {
        return amverge_command(app);
    }

    let mut cmd = base_command(ai_py);
    cmd.arg("-m").arg("amverge");
    apply_ai_env_vars(app, &mut cmd);
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
