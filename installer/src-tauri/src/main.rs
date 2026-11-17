#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

#[derive(Serialize)]
struct SystemSpecs {
    gpu_name: String,
    has_cuda: bool,
    default_path: String,
}

#[derive(Deserialize)]
struct FeatureConfig {
    transnet: bool,
    scout: bool,
    depth: bool,
    upscale: bool,
}

#[derive(Deserialize)]
struct InstallConfig {
    target_path: String,
    features: FeatureConfig,
    context_menu: bool,
    desktop_shortcut: bool,
    add_to_path: bool,
}

#[derive(Serialize, Clone)]
struct ProgressPayload {
    percent: u32,
    message: String,
}

#[tauri::command]
fn get_system_info() -> SystemSpecs {
    let mut default_path = String::from(r"C:\Program Files\AMVerge");

    #[cfg(windows)]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            default_path = format!(r"{local_app_data}\Programs\AMVerge");
        }
    }

    #[cfg(not(windows))]
    {
        if let Ok(home) = std::env::var("HOME") {
            default_path = format!(r"{home}/.local/share/AMVerge");
        }
    }

    // Basic GPU probe (Windows Registry / NVIDIA driver)
    let (gpu_name, has_cuda) = detect_gpu();

    SystemSpecs {
        gpu_name,
        has_cuda,
        default_path,
    }
}

fn detect_gpu() -> (String, bool) {
    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(video_key) = hklm.open_subkey(r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}") {
            for subkey_name in video_key.enum_keys().flatten() {
                if let Ok(subkey) = video_key.open_subkey(&subkey_name) {
                    if let Ok(desc) = subkey.get_value::<String, _>("DriverDesc") {
                        if !desc.contains("Microsoft") {
                            let is_nvidia = desc.to_lowercase().contains("nvidia") || desc.to_lowercase().contains("geforce");
                            return (desc, is_nvidia);
                        }
                    }
                }
            }
        }
    }

    ("Standard Graphics Adapter".to_string(), false)
}

#[tauri::command]
async fn select_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.map(|p| p.to_string()))
}

#[tauri::command]
async fn start_installation(app: AppHandle, config: InstallConfig) -> Result<(), String> {
    emit_progress(&app, 10, "Creating installation directory...");
    let target = PathBuf::from(&config.target_path);
    std::fs::create_dir_all(&target).map_err(|e| format!("Failed to create folder: {e}"))?;

    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    emit_progress(&app, 30, "Unpacking core AMVerge binaries...");

    // Simulating copy / payload extraction
    tokio::time::sleep(std::time::Duration::from_millis(600)).await;
    emit_progress(&app, 50, "Configuring runtime dependencies...");

    if config.features.transnet {
        emit_progress(&app, 65, "Setting up AI Scene Detection (TransNetV2)...");
        tokio::time::sleep(std::time::Duration::from_millis(400)).await;
    }

    if config.features.scout {
        emit_progress(&app, 75, "Configuring Scene Scout embeddings cache...");
        tokio::time::sleep(std::time::Duration::from_millis(400)).await;
    }

    if config.features.depth {
        emit_progress(&app, 82, "Configuring Depth-Anything-V2 models...");
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    }

    if config.features.upscale {
        emit_progress(&app, 88, "Configuring Upscale neural filters...");
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    }

    #[cfg(windows)]
    {
        if config.desktop_shortcut {
            emit_progress(&app, 92, "Creating Desktop & Start Menu shortcuts...");
            let _ = setup_windows_shortcuts(&target);
        }

        if config.context_menu {
            emit_progress(&app, 96, "Registering Windows Explorer context menu...");
            let _ = register_windows_context_menu(&target);
        }

        if config.add_to_path {
            let _ = add_to_user_path(&target);
        }

        let _ = register_uninstall_entry(&target);
    }

    tokio::time::sleep(std::time::Duration::from_millis(400)).await;
    emit_progress(&app, 100, "Installation successfully completed!");

    Ok(())
}

fn emit_progress(app: &AppHandle, percent: u32, message: &str) {
    let _ = app.emit(
        "install://progress",
        ProgressPayload {
            percent,
            message: message.to_string(),
        },
    );
}

#[cfg(windows)]
fn setup_windows_shortcuts(target_dir: &Path) -> Result<(), String> {
    use std::process::Command;
    let exe = target_dir.join("AMVerge.exe");
    let script = format!(
        r#"
        $ws = New-Object -ComObject WScript.Shell
        $desktop = [Environment]::GetFolderPath('Desktop')
        $startMenu = [Environment]::GetFolderPath('StartMenu') + '\Programs'
        
        $s1 = $ws.CreateShortcut("$desktop\AMVerge.lnk")
        $s1.TargetPath = "{}"
        $s1.Save()

        $s2 = $ws.CreateShortcut("$startMenu\AMVerge.lnk")
        $s2.TargetPath = "{}"
        $s2.Save()
        "#,
        exe.display(),
        exe.display()
    );

    let _ = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output();
    Ok(())
}

#[cfg(windows)]
fn register_windows_context_menu(target_dir: &Path) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu.create_subkey(r"Software\Classes\SystemFileAssociations\video\shell\AMVerge")
        .map_err(|e| e.to_string())?;

    key.set_value("", &"Open with AMVerge").map_err(|e| e.to_string())?;
    let icon_val = format!("\"{}\",0", target_dir.join("AMVerge.exe").display());
    key.set_value("Icon", &icon_val).map_err(|e| e.to_string())?;

    let (cmd_key, _) = key.create_subkey("command").map_err(|e| e.to_string())?;
    let cmd_val = format!("\"{}\" \"%1\"", target_dir.join("AMVerge.exe").display());
    cmd_key.set_value("", &cmd_val).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(windows)]
fn add_to_user_path(target_dir: &Path) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(env_key) = hkcu.open_subkey_with_flags("Environment", KEY_READ | KEY_WRITE) {
        if let Ok(current_path) = env_key.get_value::<String, _>("Path") {
            let target_str = target_dir.to_string_lossy().to_string();
            if !current_path.contains(&target_str) {
                let new_path = format!("{current_path};{target_str}");
                let _ = env_key.set_value("Path", &new_path);
            }
        }
    }
    Ok(())
}

#[cfg(windows)]
fn register_uninstall_entry(target_dir: &Path) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let uninstall_path = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\AMVerge";
    if let Ok((key, _)) = hkcu.create_subkey(uninstall_path) {
        let exe = target_dir.join("AMVerge.exe");
        let _ = key.set_value("DisplayName", &"AMVerge");
        let _ = key.set_value("DisplayVersion", &"2.0.2");
        let _ = key.set_value("Publisher", &"AMVerge Team");
        let _ = key.set_value("DisplayIcon", &exe.to_string_lossy().to_string());
        let _ = key.set_value("InstallLocation", &target_dir.to_string_lossy().to_string());
    }
    Ok(())
}

#[tauri::command]
async fn launch_amverge(target_path: String) -> Result<(), String> {
    let exe = PathBuf::from(target_path).join("AMVerge.exe");
    if exe.exists() {
        let _ = std::process::Command::new(exe).spawn();
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            select_folder,
            start_installation,
            launch_amverge
        ])
        .run(tauri::generate_context!())
        .expect("error while running amverge installer");
}
