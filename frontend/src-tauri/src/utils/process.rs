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

/// ties a child, and everything it starts after this call, to the app's lifetime.
///
/// windows: the child joins a kill-on-close job object that only this process holds a
/// handle to, so however the app ends (normal close, crash, task manager) windows kills
/// the whole tree. the close-time cleanup in main.rs only runs on a normal close, which
/// is how stray ffmpeg and cli processes were outliving the app. used for ffmpeg, the
/// cli and uv only: editors, explorer and the updater's installer must outlive the app,
/// so the app itself is never put in the job.
///
/// elsewhere this is a no-op; the process-group kill on close is what there is
pub fn bind_to_app_lifetime(pid: u32) {
    #[cfg(windows)]
    app_job::assign(pid);

    #[cfg(not(windows))]
    {
        let _ = pid;
    }
}

/// `Command::output()` (stdin closed, stdout and stderr captured), with the child bound
/// to the app's lifetime before it is waited on. for short ffmpeg / ffprobe probes
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

    /// the job handle is deliberately never closed: windows closes it when the app
    /// exits, and closing it is what kills the members
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

    /// best effort: a child that already exited, or a failed call, just stays unbound.
    /// returns whether the child is now in the job
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
