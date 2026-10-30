// handoff to AMVerge 2. V2 has its own app identifier, so it cannot read this app's
// WebView storage; before installing it, V1 writes its settings and episode list to a
// file in its app data, which V2 imports on first launch (V2 `commands/migration.rs`).

use std::fs;

use tauri::{AppHandle, Manager};

/// name and location V2 reads; keep in sync with V2's `MIGRATION_FILE`
const MIGRATION_FILE: &str = "v2-migration.json";

#[tauri::command]
pub fn write_v2_migration(app: AppHandle, json: String) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // write then rename, so V2 never reads a half-written file
    let tmp = dir.join(format!("{MIGRATION_FILE}.tmp"));
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dir.join(MIGRATION_FILE)).map_err(|e| e.to_string())
}
