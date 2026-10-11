use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn apply_no_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    #[cfg(not(windows))]
    {
        let _ = cmd;
    }
}

/// name of the tool `kill_process_tree` runs, for error messages
#[cfg(windows)]
pub const KILL_TOOL: &str = "taskkill";
#[cfg(not(windows))]
pub const KILL_TOOL: &str = "kill";

/// force-kills `pid` and everything it spawned: `taskkill /F /T` on windows, a
/// SIGKILL to the whole process group elsewhere. blocking; returns the tool's output
pub fn kill_process_tree(pid: u32) -> std::io::Result<std::process::Output> {
    #[cfg(windows)]
    {
        let mut cmd = Command::new(KILL_TOOL);
        apply_no_window(&mut cmd);
        cmd.args(["/F", "/T", "/PID", &pid.to_string()]).output()
    }

    #[cfg(not(windows))]
    {
        // negative pid targets the process group (the child plus ffmpeg etc.)
        Command::new(KILL_TOOL).args(["-9", &format!("-{pid}")]).output()
    }
}

/// `kill_process_tree` off the async runtime, for commands that report the result
pub async fn kill_process_tree_async(pid: u32) -> Result<std::process::Output, String> {
    tokio::task::spawn_blocking(move || kill_process_tree(pid))
        .await
        .map_err(|e| format!("{KILL_TOOL} task panicked: {e}"))?
        .map_err(|e| format!("Failed to run {KILL_TOOL}: {e}"))
}
