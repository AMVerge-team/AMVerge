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

/// ties a child's whole tree to the app's lifetime via a kill-on-close job object (windows), so even a crash kills it; never used for editors or the updater
pub fn bind_to_app_lifetime(pid: u32) {
    #[cfg(windows)]
    app_job::assign(pid);

    #[cfg(not(windows))]
    {
        let _ = pid;
    }
}

/// `Command::output()` with the child bound to the app's lifetime first, for short ffmpeg/ffprobe probes
pub fn output_bound(cmd: &mut Command) -> std::io::Result<std::process::Output> {
    use std::process::Stdio;
    let child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    bind_to_app_lifetime(child.id());
    child.wait_with_output()
}

#[cfg(windows)]
mod app_job {
    use std::sync::OnceLock;

    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE};

    /// never closed: windows closes it on exit, which kills the members
    struct Job(HANDLE);
    unsafe impl Send for Job {}
    unsafe impl Sync for Job {}

    fn job() -> Option<&'static Job> {
        static JOB: OnceLock<Option<Job>> = OnceLock::new();
        JOB.get_or_init(|| unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return None;
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const core::ffi::c_void,
                std::mem::size_of_val(&info) as u32,
            );
            if ok == 0 {
                CloseHandle(handle);
                return None;
            }
            Some(Job(handle))
        })
        .as_ref()
    }

    /// best effort; returns whether the child is now in the job
    pub fn assign(pid: u32) -> bool {
        let Some(job) = job() else { return false };
        unsafe {
            let process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
            if process.is_null() {
                return false;
            }
            let ok = AssignProcessToJobObject(job.0, process) != 0;
            CloseHandle(process);
            ok
        }
    }

    #[cfg(test)]
    mod tests {
        #[test]
        fn a_bound_child_joins_the_kill_on_close_job() {
            let mut child = std::process::Command::new("cmd")
                .args(["/C", "ping -n 3 127.0.0.1 >nul"])
                .spawn()
                .expect("spawn test child");
            let bound = super::assign(child.id());
            let _ = child.kill();
            assert!(bound, "child was not assigned to the app job");
        }
    }
}

/// name of the tool `kill_process_tree` runs, for error messages
#[cfg(windows)]
pub const KILL_TOOL: &str = "taskkill";
#[cfg(not(windows))]
pub const KILL_TOOL: &str = "kill";

/// force-kills `pid` and its tree (taskkill /F /T, or SIGKILL to the group); blocking
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
