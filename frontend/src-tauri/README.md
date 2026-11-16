# AMVerge Tauri Layer

Native desktop layer for AMVerge V2. React/TypeScript handles the UI, `AMVerge-CLI` (Python) handles video processing, and Tauri/Rust bridges filesystem, process management, sidecar invocation, FFmpeg tools, and native integrations.

## What this layer handles

- Scene detection, streaming clip imports, and paused resume jobs (`scenes.rs`, `scene_resume.rs`)
- Clip exports, remuxing, post-export passes, and GPU capability probing (`export.rs`, `export/`)
- Upscale & depth tool pipelines (`tools.rs`)
- Scene Scout CLI + persistent daemon indexing/search (`scene_scout/`)
- Scenepack materialization & storage (`scenepacks.rs`)
- Codec checks, proxy transcodes, range previews, and animated WebP generation (`preview.rs`, `preview/`)
- Managed AI environment (`uv` venv) and model weight downloads (`deps.rs`, `deps/`, `models.rs`)
- Storage relocation, cache cleanup, V1 migration, and profile/background media (`settings.rs`, `cache.rs`, `migration.rs`)
- Editor automation (`editor_import.rs`, `editor_import/`), Discord auth/RPC (`auth.rs`, `discord/`), Events (`events.rs`), Extension theme sync (`extension_sync.rs`), Bug reports (`bug_report.rs`), and Startup notifications (`notifications.rs`)

---

## Folder structure

```txt
src-tauri/
├── bin/                   # Staged PyInstaller sidecar in release builds
├── capabilities/
├── icons/
├── src/
│   ├── main.rs            # Tauri bootstrap, state, command registration, shutdown cleanup
│   ├── payloads.rs        # Event payload structs
│   ├── state.rs           # Shared mutexes, PID tracking, abort flags
│   ├── commands/
│   │   ├── mod.rs
│   │   ├── auth.rs
│   │   ├── backend.rs
│   │   ├── bug_report.rs
│   │   ├── cache.rs
│   │   ├── deps.rs        # + deps/ (status, progress, packs, install, cli_update)
│   │   ├── discord.rs     # + discord/ (app_info, activity, worker)
│   │   ├── editor_import.rs # + editor_import/ (AE, Premiere, Resolve, CapCut, staging)
│   │   ├── events.rs
│   │   ├── export.rs      # + export/ (types, hardware, ops)
│   │   ├── extension_sync.rs
│   │   ├── github.rs
│   │   ├── migration.rs
│   │   ├── models.rs
│   │   ├── notifications.rs
│   │   ├── preview.rs     # + preview/ (types, proxy, scene_webp, fingerprint, cache, audio)
│   │   ├── scene_resume.rs
│   │   ├── scene_scout/   # mod.rs, cli.rs, worker.rs, types.rs
│   │   ├── scenepacks.rs
│   │   ├── scenes.rs
│   │   ├── settings.rs
│   │   ├── system_specs.rs
│   │   └── tools.rs
│   └── utils/
│       ├── mod.rs
│       ├── discord_ipc.rs
│       ├── ffmpeg.rs      # Resolves bundled ffmpeg / ffprobe
│       ├── logging.rs     # Console event forwarding
│       ├── paths.rs       # Owned storage dir names & path sanitization
│       ├── process.rs     # CREATE_NO_WINDOW, Windows Job Object binding, process tree kill
│       └── sidecar.rs     # Resolves dev CLI venv vs bundled PyInstaller sidecar
├── Cargo.toml
├── Cargo.lock
├── build.rs
└── tauri.conf.json
```

---

## Sidecar & process lifecycle

- **Development (`tauri:dev`)**: Resolves `AMVerge-CLI` from `AMVERGE_CLI_DIR` (or sibling `../AMVerge-CLI/.venv/{Scripts,bin}/amverge`).
- **Production (`tauri:build`)**: Resolves the bundled PyInstaller sidecar under `bin/amverge-{target}/`.
- **Clean shutdown**: All spawned FFmpeg, FFprobe, CLI, and `uv` child processes are tracked in shared state and bound to the app lifetime (`bind_to_app_lifetime` Job Objects on Windows, process groups on Unix) so closing or terminating the app tears down child process trees cleanly.

---

## Storage & persistence

- **Owned storage directories** (`utils/paths.rs`): `episodes_storage`, `scene_packs`, and `amverge-scene-scout` move together on storage relocation (`move_storage_to_new_dir`).
- **Frontend state**: Episode lists persist asynchronously in IndexedDB (`utils/episodePersistStorage.ts`), while settings and UI preferences persist via Zustand stores.
