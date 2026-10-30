//! one-click PC specs for bug reports (OS, CPU, RAM, GPU, nothing identifying); Windows reads the registry since WMI is too slow

#[cfg(target_os = "macos")]
use std::process::Command;

#[cfg(windows)]
use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ};
#[cfg(windows)]
use winreg::RegKey;

/// where Windows keeps the display adapters, one subkey per driver
#[cfg(windows)]
const DISPLAY_CLASS_KEY: &str =
    r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";

/// the build that made Windows 11; ProductName still says 10
#[cfg(windows)]
const FIRST_WINDOWS_11_BUILD: u32 = 22000;

/// strips trademark noise and padding from hardware names
fn tidy(value: &str) -> String {
    value
        .replace("(R)", "")
        .replace("(r)", "")
        .replace("(TM)", "")
        .replace("(tm)", "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn join_summary(parts: Vec<String>) -> Result<String, String> {
    let parts: Vec<String> = parts
        .into_iter()
        .map(|part| tidy(&part))
        .filter(|part| !part.is_empty())
        .collect();

    if parts.is_empty() {
        return Err("Could not read this machine's specs.".to_string());
    }

    Ok(parts.join(" | "))
}

/// bytes as the whole gigabytes a user would say out loud, empty when unknown
#[cfg(any(windows, target_os = "macos"))]
fn format_ram_gb(gb: f64) -> String {
    let rounded = gb.round() as u64;
    if rounded == 0 {
        String::new()
    } else {
        format!("{rounded} GB RAM")
    }
}

#[cfg(windows)]
fn reg_key(path: &str) -> Option<RegKey> {
    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey_with_flags(path, KEY_READ)
        .ok()
}

#[cfg(windows)]
fn reg_string(key: &RegKey, name: &str) -> Option<String> {
    key.get_value::<String, _>(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

/// "Windows 11 Pro 25H2 (build 26200.9168)", as far as the registry can tell
#[cfg(windows)]
fn windows_edition() -> String {
    let Some(key) = reg_key(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion") else {
        return String::new();
    };

    let build = reg_string(&key, "CurrentBuildNumber").unwrap_or_default();
    let build_number = build.parse::<u32>().unwrap_or(0);

    let mut name = reg_string(&key, "ProductName").unwrap_or_default();
    if build_number >= FIRST_WINDOWS_11_BUILD {
        name = name.replace("Windows 10", "Windows 11");
    }
    if name.is_empty() {
        return String::new();
    }

    // "25H2": the name users and changelogs actually use for a release
    if let Some(release) =
        reg_string(&key, "DisplayVersion").or_else(|| reg_string(&key, "ReleaseId"))
    {
        name = format!("{name} {release}");
    }

    if build.is_empty() {
        return name;
    }

    // UBR is the patch level: 26200.9168 pins the exact Windows the bug hit
    match key.get_value::<u32, _>("UBR") {
        Ok(ubr) => format!("{name} (build {build}.{ubr})"),
        Err(_) => format!("{name} (build {build})"),
    }
}

#[cfg(windows)]
fn windows_cpu() -> String {
    reg_key(r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
        .and_then(|key| reg_string(&key, "ProcessorNameString"))
        .unwrap_or_default()
}

/// installed memory, not the visible total, which hides hardware reservations
#[cfg(windows)]
fn windows_ram() -> String {
    let mut kilobytes: u64 = 0;
    // SAFETY: the call only writes the u64 we hand it, and reports failure
    // through its return value rather than the buffer
    let ok = unsafe {
        windows_sys::Win32::System::SystemInformation::GetPhysicallyInstalledSystemMemory(
            &mut kilobytes,
        )
    };
    if ok == 0 || kilobytes == 0 {
        return String::new();
    }

    format_ram_gb(kilobytes as f64 / 1024.0 / 1024.0)
}

/// every display adapter with a driver, minus microsoft's software fallback
#[cfg(windows)]
fn windows_gpus() -> String {
    let Some(class_key) = reg_key(DISPLAY_CLASS_KEY) else {
        return String::new();
    };

    let mut names: Vec<String> = Vec::new();
    for subkey_name in class_key.enum_keys().flatten() {
        let Ok(subkey) = class_key.open_subkey_with_flags(&subkey_name, KEY_READ) else {
            continue;
        };
        let Some(name) = reg_string(&subkey, "DriverDesc") else {
            continue;
        };
        if name.contains("Microsoft") || names.contains(&name) {
            continue;
        }
        names.push(name);
    }

    names.join(", ")
}

#[cfg(windows)]
fn collect_specs() -> Result<String, String> {
    join_summary(vec![
        windows_edition(),
        windows_cpu(),
        windows_ram(),
        windows_gpus(),
    ])
}

/// a command's trimmed stdout, or nothing when it fails or says nothing
#[cfg(target_os = "macos")]
fn read_command(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }

    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

/// macOS lists GPUs as "Chipset Model" lines in `system_profiler`
#[cfg(target_os = "macos")]
fn macos_gpu_names() -> String {
    let Some(report) = read_command("system_profiler", &["SPDisplaysDataType"]) else {
        return String::new();
    };

    let mut names: Vec<String> = Vec::new();
    for line in report.lines() {
        let Some(name) = line.trim().strip_prefix("Chipset Model:") else {
            continue;
        };
        let name = name.trim().to_string();
        if !name.is_empty() && !names.contains(&name) {
            names.push(name);
        }
    }

    names.join(", ")
}

#[cfg(target_os = "macos")]
fn collect_specs() -> Result<String, String> {
    let product = read_command("sw_vers", &["-productName"]).unwrap_or_default();
    let version = read_command("sw_vers", &["-productVersion"]).unwrap_or_default();
    let build = read_command("sw_vers", &["-buildVersion"]).unwrap_or_default();

    let mut os = format!("{product} {version}").trim().to_string();
    if !os.is_empty() && !build.is_empty() {
        os = format!("{os} (build {build})");
    }

    let cpu = read_command("sysctl", &["-n", "machdep.cpu.brand_string"]).unwrap_or_default();

    let ram = read_command("sysctl", &["-n", "hw.memsize"])
        .and_then(|bytes| bytes.parse::<u64>().ok())
        .map(|bytes| format_ram_gb(bytes as f64 / 1024.0_f64.powi(3)))
        .unwrap_or_default();

    join_summary(vec![os, cpu, ram, macos_gpu_names()])
}

#[cfg(not(any(windows, target_os = "macos")))]
fn collect_specs() -> Result<String, String> {
    join_summary(vec![format!(
        "{} ({})",
        std::env::consts::OS,
        std::env::consts::ARCH
    )])
}

/// fills the bug report's PC Specs field, still editable
#[tauri::command]
pub async fn detect_pc_specs() -> Result<String, String> {
    tokio::task::spawn_blocking(collect_specs)
        .await
        .map_err(|e| format!("Spec detection task panicked: {e}"))?
}
