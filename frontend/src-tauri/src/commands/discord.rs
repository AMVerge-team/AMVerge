use std::io::Write;

use crate::state::DiscordRPCState;
use tauri::{AppHandle, State};

// NOTE: Discord Rich Presence is temporarily disabled during the backend -> CLI
// migration. The RPC helper previously ran backend/discordrpc/rpc_server.py via
// backend/venv; that folder is being removed, so the spawn is a no-op until RPC
// is reimplemented (planned: an AMVerge-CLI `[discord]` command invoked as the
// sidecar, or an in-app script under frontend/). start/update no-op so the UI's
// invoke() calls succeed silently instead of erroring.

#[tauri::command]
pub async fn start_discord_rpc(
    _app: AppHandle,
    _state: State<'_, DiscordRPCState>,
) -> Result<(), String> {
    println!("[Discord RPC] disabled (backend migration); start is a no-op");
    Ok(())
}

#[tauri::command]
pub async fn update_discord_rpc(
    _state: State<'_, DiscordRPCState>,
    _data: serde_json::Value,
) -> Result<(), String> {
    // No-op while Discord RPC is disabled (see start_discord_rpc).
    Ok(())
}

#[tauri::command]
pub async fn stop_discord_rpc(state: State<'_, DiscordRPCState>) -> Result<(), String> {
    let mut child_guard = state.child.lock().unwrap();
    if let Some(mut child) = child_guard.take() {
        // Try to send a graceful shutdown command first
        if let Some(stdin) = child.stdin.as_mut() {
            let _ = writeln!(stdin, "{{\"type\": \"shutdown\"}}");
            let _ = stdin.flush();
        }

        // Give it a tiny bit of time to clear the presence and exit
        let mut count = 0;
        while count < 5 {
            match child.try_wait() {
                Ok(Some(_)) => return Ok(()), // Exited gracefully
                _ => {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                    count += 1;
                }
            }
        }

        // If it's still alive, kill it forcefully
        let _ = child.kill();
        println!("[Discord RPC] Forcefully killed ghost process");
    }
    Ok(())
}
