# AMVerge Tauri Layer

`frontend/src-tauri/` is the native Rust shell for AMVerge V2. It connects the React UI to the local filesystem, bundled `ffmpeg` / `ffprobe` binaries, the `AMVerge-CLI` Python backend, and OS integrations.

---

## Directory Layout

```text
src-tauri/
├── bin/                      # Bundled PyInstaller sidecar in production builds
├── capabilities/             # Tauri v2 capability permissions
├── icons/                    # App & installer icons
├── src/
│   ├── main.rs               # App setup, managed state, command registration, exit cleanup
│   ├── payloads.rs           # Event payload structs emitted to React
│   ├── state.rs              # Shared locks, active PIDs, abort flags
│   ├── commands/
│   │   ├── mod.rs
│   │   ├── auth.rs           # Discord OAuth login flow
│   │   ├── backend.rs        # Backend API URL helpers
│   │   ├── bug_report.rs     # Signed bug report submission
│   │   ├── cache.rs          # Episode cache deletion
│   │   ├── deps/             # Managed uv Python AI environment & CLI patch updates
│   │   ├── discord/          # Discord Rich Presence over local IPC
│   │   ├── editor_import/    # After Effects, Premiere Pro, DaVinci Resolve, CapCut bridges
│   │   ├── events.rs         # Community events API & submissions
│   │   ├── export/           # Clip export, GPU probing, fast merge/split, post passes
│   │   ├── extension_sync.rs # Theme & episode sync with extension
│   │   ├── github.rs         # Contributor fetch
│   │   ├── migration.rs      # AMVerge V1 -> V2 data migration
│   │   ├── models.rs         # Depth & upscale model weight management
│   │   ├── notifications.rs  # Startup announcements
│   │   ├── preview/          # Codec probing, 480p proxies, range cuts, animated WebPs
│   │   ├── scene_resume.rs   # Background/queue re-cutting of paused video episodes
│   │   ├── scene_scout/      # Scene Scout CLI & persistent search daemon
│   │   ├── scenepacks.rs     # Scenepack clip materialization & storage
│   │   ├── scenes.rs         # Scene detection sidecar launch & manifest loading
│   │   ├── settings.rs       # Storage relocation, custom backgrounds/icons, reveal in explorer
│   │   ├── system_specs.rs   # Hardware/GPU inspection
│   │   └── tools.rs          # Standalone Upscale & Depth preview/export helpers
│   └── utils/
│       ├── discord_ipc.rs    # Raw Discord IPC socket helper
│       ├── ffmpeg.rs         # Resolves bundled or PATH ffmpeg/ffprobe
│       ├── logging.rs        # Forwards Rust logs to the in-app Console
│       ├── paths.rs          # Owned storage dir constants & path helpers
│       ├── process.rs        # CREATE_NO_WINDOW, Windows Job Objects, process-tree cleanup
│       └── sidecar.rs        # Resolves dev CLI venv vs bundled release sidecar
├── Cargo.toml
├── build.rs
└── tauri.conf.json
```

---

## Sidecar Resolution (`utils/sidecar.rs`)

- **Development (`npm run tauri:dev`):** Runs `AMVerge-CLI` from the virtualenv configured by `AMVERGE_CLI_DIR` (falling back to `../AMVerge-CLI/.venv/{Scripts,bin}/amverge`).
- **Release (`npm run tauri:build`):** Runs the PyInstaller-packaged binary under `bin/amverge-<target-triple>/`.

All spawned `AMVerge-CLI`, `ffmpeg`, `ffprobe`, and `uv` processes are tracked in shared state and attached to a kill-on-close Job Object on Windows (or process group on Unix) so child trees never linger if the app closes or crashes.

---

## Storage & Caching

- **Managed storage folders (`utils/paths.rs`):** `episodes_storage`, `scene_packs`, and `amverge-scene-scout` move together when a user changes their storage root via `move_storage_to_new_dir`.
- **Preview range cache:** `scene_range_previews` in the app cache directory holds temporary 480p Scene Scout range cuts and prunes least-recently-used files down to a 1 GB cap.
- **Episode persistence:** The episode list is stored asynchronously in IndexedDB from the frontend (`utils/episodePersistStorage.ts`) to avoid `localStorage` size limits.
