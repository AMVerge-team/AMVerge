# AMVerge v2 — AI Agent Guide

> Target: `V2_BRANCH` (Tauri v2 + React + AMVerge-CLI)
> Last updated: 2026-08-06

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (React + Zustand)                 │
│  src/                                                            │
│  ├── main.tsx → update check → ReactDOM.render(<App/>)          │
│  ├── App.tsx → store wiring, event listeners, HEVC check        │
│  ├── 3 pages: HomePage, Menu, Settings                          │
│  ├── 7 Zustand stores (2 persisted, 5 runtime)                  │
│  ├── 6 hooks (import/export, drag-drop, HEVC, Discord, etc.)    │
│  └── Components: sidebar, clipsGrid, previewPanel, settings     │
│                                                                  │
│  IPC: invoke() + listen() via @tauri-apps/api/core              │
│         + open()/save() via @tauri-apps/plugin-dialog           │
│         + convertFileSrc() via @tauri-apps/api/core             │
│         + onDragDropEvent via @tauri-apps/api/webview           │
└──────────────────────┬──────────────────────────────────────────┘
                       │  Tauri IPC Bridge
┌──────────────────────▼──────────────────────────────────────────┐
│                    TAURI CORE (Rust)                             │
│  main.rs                                                         │
│  ├── 3 plugins: shell, dialog, updater                           │
│  ├── 7 managed state structs                                     │
│  ├── 46 registered commands across 12 modules                    │
│  ├── 13 event types emitted to frontend                          │
│  └── on_window_event CloseRequested → kill_all_child_processes   │
│                                                                  │
│  Key modules:                                                    │
│  ├── scenes.rs → sidecar lifecycle, event streaming, manifest    │
│  ├── export.rs → CLI invocation, GPU detection, fast merge/split │
│  ├── preview.rs → ffmpeg WebP/proxy/HEVC/audio ops               │
│  ├── settings.rs → file I/O, image crop, explorer integration    │
│  ├── cache.rs → episode disk cleanup                             │
│  ├── editor_import.rs → Windows automation (PS/Python)           │
│  ├── notifications.rs + bug_report.rs → HTTP API calls           │
│  ├── deps.rs → AI env (uv venv), pack install/status             │
│  ├── models.rs → AI model weights (list/download/delete)         │
│  └── discord.rs → RPC (currently disabled)                       │
└──────┬───────────────────────┬──────────────────────────────────┘
       │                       │
       │  process::Command     │  process::Command
       │  + Stdio::piped       │  + Stdio::piped
       ▼                       ▼
┌──────────────┐    ┌──────────────────┐
│  AMVerge-CLI │    │  ffmpeg / ffprobe│
│  (Python)    │    │  (bundled binary)│
│              │    │                  │
│  Dev: venv   │    │  Located via:    │
│  Prod:       │    │  resources/bin/  │
│  PyInstaller │    │  or _internal/   │
│  sidecar     │    │                  │
│              │    │  Uses:           │
│  Commands:   │    │  - libwebp       │
│  - backend   │    │  - libx264       │
│  - export    │    │  - nvenc/amf/qsv │
│  - depth-map │    │  - concat demux  │
│  - deadframes│    │  - aac encoder   │
│  -interpolate│    │                  │
└──────────────┘    └──────────────────┘
```

**Key difference from v1:** External Python CLI (AMVerge-CLI, separate repo) instead of embedded Python backend scripts.

---

## Directory Structure

```
frontend/
  src/                              # React frontend
    main.tsx                        # Entry: console init, updater, ReactDOM
    App.tsx                         # Root component, routing, store wiring
    MainLayout.tsx                  # Layout wrapper
    vite-env.d.ts

    components/
      AppLayout.tsx                 # Top-level chrome (sidebar, navbar, preview)
      BgProgressBar.tsx             # Persistent background progress bar
      ImportButtons.tsx             # Import file-picker buttons
      ImportTerminal.tsx            # Full-screen import terminal overlay
      Navbar.tsx                    # Top navigation bar
      PostExportPassesModal.tsx     # Post-export pass runner modal
      StartupNotificationModal.tsx  # Startup notification modal

      sidebar/
        Sidebar.tsx                 # Sidebar root: tabs, episode panel, export
        SidebarNav.tsx              # Tab navigation (Home/Menu/Settings)
        episodePanel/               # Episode tree, context menus, modals

      clipsGrid/
        ClipsContainer.tsx          # Clip grid + export button integration
        LazyClip.tsx                # Individual lazy clip tile (WebP/video/poster)
        useWebpPreview.ts           # Animated WebP preview hook
        proxyQueue.ts               # Proxy video queue manager
        webpQueue.ts                # Animated WebP generation queue

      common/
        Dropdown.tsx, ColorPicker.tsx, CropModal.tsx, SettingRow.tsx

      icons/ProfileIcons.tsx

      menu/
        About.tsx, BugReport.tsx, Console.tsx, Credits.tsx, PatchNotes.tsx

      previewPanel/
        PreviewContainer.tsx        # Video preview + how-to overlay
        VideoPlayer.tsx             # HTML5 video player wrapper

      settings/
        GeneralSettings.tsx, AppearanceSection.tsx, DiscordRPCSection.tsx
        DependenciesSection.tsx    # AI packs/models/storage categories
        AiModelsSection.tsx        # depth + interpolation model weights manager
        exportSettings/            # Export + PostExportPasses sections

    features/export/
      profiles.ts                   # Export profile definitions, codec/container logic
      postPasses.ts                 # Post-export pass types (depth, deadframes, interpolate)
      runPostExportPasses.ts        # Post-export pass runner

    features/theme/colorPresets.ts

    hooks/
      useDiscordRPC.ts              # Discord RPC lifecycle
      useDragDropImport.ts          # Tauri drag-drop file import
      useEpisodePanelState.ts       # Episode panel CRUD
      useHEVCSupport.ts             # Browser HEVC codec detection
      useImportExport.ts            # Core import/export pipeline (largest hook)
      useStartupUpdateNotification.ts # GitHub version check popup

    pages/
      HomePage.tsx                  # Home page: preview + clips grid
      Menu.tsx                      # Menu page (About/Console/BugReport/etc.)
      Settings.tsx                  # Settings page

    stores/
      appStore.ts                   # AppState (runtime): clips, loading, progress
      episodeStore.ts               # EpisodePanel + Metadata (persisted)
      passRunStore.ts               # Post-export pass UI state (runtime)
      scenePreviewStore.ts          # Animated WebP paths by clip ID (runtime)
      settingsStore.ts              # User prefs + Theme (persisted)
      UIStore.ts                    # UI layout state (persisted partial)
      webpLoadingStore.ts           # WebP generation counter (runtime)

    types/domain.ts                 # ClipItem, EpisodeEntry, EpisodeFolder

    utils/
      appConsole.ts                 # In-app console log aggregator
      episodeUtils.ts               # Manifest loading, path remapping, cache clearing
      idle.ts                       # requestIdleCallback/setTimeout polyfill

    styles/                         # 16+ CSS files

  src-tauri/                        # Rust Tauri backend
    Cargo.toml                      # Tauri v2, tokio, serde, reqwest, image
    tauri.conf.json                 # Base app config + updater (GitHub releases)
    tauri.windows.conf.json         # NSIS installer, sidecar resources
    tauri.macos.conf.json           # macOS DMG, sidecar resources
    tauri.linux.conf.json           # Linux config (no updater)

    capabilities/default.json       # Permissions: core, dialog, updater, shell

    src/
      main.rs                       # Tauri::Builder, plugins, state, commands, cleanup
      state.rs                      # ActiveSidecar, locks, abort flags, PID tracking
      payloads.rs                   # Event payload structs (Progress, Clip, Pair)

      commands/
        scenes.rs                   # detect_scenes, abort, load_manifest
        export.rs                   # export_clips, run_export_pass, GPU detection, ops
        preview.rs                  # WebP gen, proxy transcode, HEVC check, audio probe
        settings.rs                 # File I/O, image crop, profile icons, reveal
        cache.rs                    # Delete/clear episode caches
        editor_import.rs            # Windows: AE, Premiere, Resolve, CapCut import
        notifications.rs            # Startup notification fetch (HTTP GET)
        bug_report.rs               # Bug report submit (HTTP POST, HMAC signed)
        deps.rs                     # AI env (uv venv), pack install/status
        models.rs                   # AI model weights (list/download/delete)
        discord.rs                  # Discord RPC (currently no-op)

        export/                     # Export sub-modules
          types.rs                  # ExportOptionsPayload, GPU capability payloads
          hardware.rs               # nvidia-smi probe, ffmpeg encoder detection
          ops.rs                    # fast_merge, fast_split, abort_export

        editor_import/              # Windows editor automation
          after_effects.rs          # PowerShell UI automation for AE
          premier_pro.rs            # PowerShell UI automation for Premiere
          davinci_resolve.rs        # Python scripting bridge for Resolve
          capcut.rs                 # PowerShell UI automation for CapCut

      utils/
        ffmpeg.rs                   # resolve_bundled_tool (ffmpeg/ffprobe path lookup)
        logging.rs                  # console_log emission to frontend
        paths.rs                    # Path sanitization, cache ID helpers
        process.rs                  # CREATE_NO_WINDOW flag for Windows
        sidecar.rs                  # amverge_command — CLI resolution (dev/prod)
```

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Desktop Framework | Tauri | v2.x |
| Frontend | React + TypeScript | React 19, TS ~5.8 |
| Bundler | Vite | 7.x |
| State Management | Zustand | 5.x (with persist middleware) |
| UI Virtualization | @tanstack/react-virtual | 3.x |
| Rust | Edition 2021 | tokio, serde, reqwest |
| Python CLI | AMVerge-CLI (external) | PyInstaller sidecar |
| FFmpeg/FFprobe | Bundled binaries | Platform-specific |
| CI/CD | GitHub Actions | Windows, Linux, macOS |

---

## Zustand Stores (7 total)

| Store | Persisted? | Purpose |
|-------|-----------|---------|
| **useAppStateStore** | No (runtime) | Core: `clips`, `loading`, `progress`, `selectedClips`, `focusedClip`, `importToken` |
| **useAppPersistedStore** | Yes | `exportDir`, `dismissedNotificationIds` |
| **useGeneralSettingsStore** | Yes (`amverge.generalSettings.v2`) | All user settings, export profiles, paths |
| **useThemeSettingsStore** | Yes (`amverge.theme.v2`) | Accent color, background, clip tile settings |
| **useEpisodePanelRuntimeStore** | Yes | `episodes[]`, `selectedEpisodeId`, `openedEpisodeId` |
| **useEpisodePanelMetadataStore** | Yes | `episodeFolders`, `episodeNamesById`, folder assignments |
| **useUIStateStore** | Yes (partial) | `sidebarWidthPx`, `cols`, `sidebarEnabled`, `activePage` |

**Never persist:** `useScenePreviewStore`, `usePassRunStore`, `useWebpLoadingStore`

---

## All Tauri Commands

| Command | Module | Purpose |
|---------|--------|---------|
| `detect_scenes` | scenes.rs | Spawn CLI sidecar, stream progress events |
| `load_episode_manifest` | scenes.rs | Read cached `manifest.json` from disk |
| `abort_detect_scenes` | scenes.rs | Kill sidecar process group |
| `export_clips` | export.rs | Spawn CLI export, stream progress |
| `run_export_pass` | export.rs | Post-export passes (depth, deadframes, interpolate) |
| `abort_export` | export.rs | Kill export processes |
| `detect_nvidia_encoder_profile` | export.rs | nvidia-smi GPU profile detection |
| `detect_gpu_encoder_capabilities` | export.rs | ffmpeg encoder probing |
| `fast_merge` | export.rs | Direct ffmpeg concat (x264 CRF 17) |
| `fast_split` | export.rs | Direct ffmpeg split at timestamp |
| `import_media_to_editor` | editor_import.rs | Windows editor automation |
| `abort_editor_import` | editor_import.rs | Set abort flag |
| `check_hevc` | preview.rs | ffprobe codec detection |
| `get_audio_streams` | preview.rs | ffprobe audio stream listing |
| `hover_preview_error` | preview.rs | Log hover preview errors |
| `ensure_preview_proxy` | preview.rs | Transcode to x264 proxy (480p, CRF 32) |
| `ensure_merged_preview` | preview.rs | Concat multiple proxies |
| `generate_scene_webp` | preview.rs | Single animated/still WebP (libwebp) |
| `generate_scene_webp_batch` | preview.rs | Batch WebP (max 8 concurrent) |
| `lookup_scene_webp_cache_batch` | preview.rs | Disk cache check (no encode) |
| `delete_episode_cache` | cache.rs | Remove episode directory |
| `clear_episode_panel_cache` | cache.rs | Delete all episode folders |
| `save_background_image` | settings.rs | Copy image to app_data |
| `crop_and_save_image` | settings.rs | Crop image/video/gif |
| `crop_and_save_profile_icon` | settings.rs | Crop profile icon |
| `delete_profile_icon_file` | settings.rs | Delete icon (with path traversal check) |
| `reveal_in_file_manager` | settings.rs | Open Explorer/Finder at path |
| `move_episodes_to_new_dir` | settings.rs | Relocate episode cache folders |
| `get_default_episodes_dir` | settings.rs | Return app_data_dir/episodes |
| `start_discord_rpc` | discord.rs | **NO-OP** |
| `update_discord_rpc` | discord.rs | **NO-OP** |
| `stop_discord_rpc` | discord.rs | Kill RPC child process |
| `submit_bug_report` | bug_report.rs | HTTP POST (HMAC signed) |
| `fetch_startup_notification` | notifications.rs | HTTP GET startup notification |
| `ai_env_status` | deps.rs | AI env status: packs, torch variant, GPU, sizes |
| `install_ai_pack` | deps.rs | Install one AI pack (+ torch) into app venv |
| `abort_ai_install` | deps.rs | Kill in-flight uv install |
| `uninstall_ai_pack` | deps.rs | Remove one pack's packages (torch kept) |
| `remove_ai_env` | deps.rs | Delete the whole AI environment |
| `list_models` | models.rs | Spawn `amverge models --json` → depth + interpolation weights |
| `download_model` | models.rs | `amverge models --json --download <key>` |
| `delete_model` | models.rs | `amverge models --json --delete <key>` |

---

## Tauri Events (Rust → Frontend)

| Event | Payload | Source |
|-------|---------|--------|
| `scene_progress` | `{percent, message}` | scenes.rs, export.rs, editor_import.rs |
| `initial_clips_ready` | `{clips_json}` | scenes.rs (CLI INITIAL_CLIPS_READY) |
| `phase1_complete` | `()` | scenes.rs (CLI PHASE1_COMPLETE) |
| `clip_ready` | `{scene_index, clip_path, clip_mode}` | scenes.rs (CLI CLIP_READY) |
| `thumbnail_ready` | `{position}` | scenes.rs (CLI THUMBNAIL_READY) |
| `pair_result` | `{pos_a, pos_b, should_merge}` | scenes.rs (CLI PAIR_RESULT) |
| `reencode_progress` | `{done, total}` | scenes.rs (CLI REENCODE_PROGRESS) |
| `processing_complete` | `()` | scenes.rs (CLI PROCESSING_COMPLETE) |
| `scene_webp_ready` | `{scene_id, path}` | preview.rs |
| `pass_progress` | `{pass, percent, message}` | export.rs |
| `pass_preview` | `{pass, path, seq}` | export.rs |
| `pass_log` | `{pass, line}` | export.rs |
| `console_log` | `{source, level, message}` | logging.rs |

---

## IPC Protocol: CLI ↔ Rust

AMVerge-CLI communicates with Rust via:

| Channel | Direction | Format |
|---------|-----------|--------|
| **Arguments** | Rust → CLI | `backend <video> <outdir> <method> <importMethod>` |
| **Stderr** | CLI → Rust | Line-delimited protocol events |
| **Stdout** | CLI → Rust | Final JSON payload (scenes array, error) |
| **Exit code** | CLI → Rust | 0 = success, non-zero = failure |

**Stderr protocol events (in order of appearance):**
```
PROGRESS|<pct>|<message>
INITIAL_CLIPS_READY|<json_array>
CLIP_READY|<index>|<path>|<mode>
THUMBNAIL_READY|<index>
PAIR_RESULT|<pos_a>|<pos_b>|<0 or 1>
REENCODE_PROGRESS|<done>|<total>
PHASE1_COMPLETE
PROCESSING_COMPLETE
```

---

## Data Flow: Import

```
User drags video / clicks Import
  │
  ▼
useDragDropImport.ts → onDragDropEvent → filter video extensions
  │
  ▼
useImportExport.ts: handleImport(file)
  ├─ buildEpisodeCacheId(file) → "VidName_a1b2c3d4"
  ├─ Loading=true, activeOperation="import"
  │
  ├─ IF importMethod === "video_files" (streaming):
  │   ├─ startVideoStreamingListeners()
  │   ├─ invoke("detect_scenes", ...)
  │   │     │
  │   │     ▼ Rust scenes.rs
  │   │     ├─ Spawn CLI sidecar: amverge backend <video> <outdir> <method>
  │   │     ├─ Read stderr → emit Tauri events
  │   │     ├─ Read stdout → build final manifest.json
  │   │     └─ On exit: write manifest.json to disk
  │   │
  │   └─ Resolves on phase1_complete OR process end
  │
  └─ IF importMethod === "webp_files" (blocking):
      └─ await invoke("detect_scenes", ...) → blocks
      └─ loadEpisodeManifest() → invoke("load_episode_manifest")
```

---

## Data Flow: Export

```
User selects clips + clicks Export
  │
  ▼
useImportExport.ts: handleExport(selectedClips, mergeEnabled)
  ├─ buildExportOptionsPayload(profileId)
  ├─ clipExportSpecs(clip) → { input, start_sec?, end_sec? }
  ├─ invoke("export_clips", { clips, savePath, mergeEnabled, exportOptions })
  │     │
  │     ▼ Rust export.rs
  │     ├─ Write input clips JSON to temp file
  │     ├─ Spawn CLI: amverge export --inputs-json ... --ipc
  │     ├─ Stream stderr → scene_progress events
  │     ├─ Read stdout → { outputs: [...], error?: {message} }
  │     └─ Return output file paths
  │
  ├─ reveal_in_file_manager(exportedFiles[0])
  │
  └─ IF postExportPasses enabled:
      └─ runPostExportPasses(producedFiles, passesSnapshot)
           ├─ For each pass: invoke("run_export_pass", { pass, inputPath, outputPath, args })
           └─ Drive passRunStore (modal UI with progress/preview/logs)
```

---

## AI Models Manager

Settings → Dependencies tab (categories: **AI Packs**, **AI Models**, **Storage**) manages the model weights for the depth-map and interpolation passes. Thin bridge over the CLI `amverge models --json` command:

```
AiModelsSection.tsx → invoke("list_models") → Rust models.rs → amverge models --json
  → CLI prints {"depth":[{key,name,method,file,sizeBytes,downloaded}],
                 "interpolation":[...]}
  → parsed into ModelInfo[] → rendered with Download/Delete buttons

Download/Delete → invoke("download_model"|"delete_model", { key })
  → amverge models --json --download <key> | --delete <key>
  → CLI prints {"result":{ok, action, key, message}} → surfaced, list refreshed
```

Each category is gated on its AI pack (`depth`, `interpolation`) being installed in the AI env. Model files live under `%APPDATA%/com.amverge.cli/models/{depth|interpolation}/`.

---

## Preview/WebP Pipeline

### Proxy transcoding (browser-playable):
```
ensure_preview_proxy(clipPath, audioStreamIndex, transcode_video, height, crf)
  → ffmpeg: libx264 480p, CRF 32, g=1 (all keyframes)
  → Cached at: {clip}.{audio}.{mode}.preview.mp4
  → Concurrency: semaphore-limited per clip
```

### Animated WebP generation:
```
generate_scene_webp_batch(jobs)
  → Pre-fingerprint sources (SHA-256 of file head/mid/tail)
  → Cache keyed by fingerprint + params
  → ffmpeg libwebp: 240px, 8fps, compression_level=0, q:v 48
  → Concurrency: max(2, cpu_cores/2).min(8) parallel
  → Events: scene_webp_ready per finished job
```

---

## FFmpeg Integration

FFmpeg/ffprobe resolution (`utils/ffmpeg.rs: resolve_bundled_tool`):
1. `resources/bin/{tool}.exe` (direct bundle)
2. `resources/bin/amverge-{target}/_internal/{tool}` (PyInstaller internal)
3. Dev fallback: walk up 5 levels looking in `bin/` or `_internal/`

All ffmpeg processes:
- `CREATE_NO_WINDOW` on Windows (`process.rs: apply_no_window`)
- PID tracked in `ActiveFfmpegPids` for cleanup on app close
- Unix: `process_group(0)` for group kill

---

## Scene Detection Methods

| Method | Description |
|--------|-------------|
| `transnetv2_gpu` | PyTorch ML model (GPU accelerated) |
| `pyscenedetect_cpu` | PySceneDetect library (CPU, adaptive) |
| `keyframe_detection` | Fast keyframe-based split (no ML) |

---

## Export: Codecs & Hardware Acceleration

**Codecs:** h264, h265, AV1, ProRes (LT/422/HQ/4444/XQ), CineForm, DNxHR, uncompressed

**Hardware encoders (auto-detect):**
- NVIDIA NVENC (h264_nvenc, hevc_nvenc, av1_nvenc) — up to 12 parallel
- AMD AMF, Intel QSV, VideoToolbox, VAAPI — parallel limit 1

**Export workflows:**
- `remux` → stream-copy, fallback to re-encode
- `video_encode` → always re-encode with chosen codec
- `editor_import` → generate DAW project files

---

## Build System

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server (frontend only) |
| `npm run tauri:dev` | Full Tauri dev (with `.env`) |
| `npm run build:sidecar` | PyInstaller build of AMVerge-CLI |
| `npm run tauri:build` | Full production build |
| `npm run tauri:build:linux` | Linux community build |

**Sidecar resolution:**
- Dev mode: `{repo_root}/AMVerge-CLI/.venv/{Scripts|bin}/amverge[.exe]`
- Prod mode: Bundled as `bin/amverge-{target-triple}/amverge[.exe]`
- Override: `AMVERGE_CLI_DIR` env var

---

## Configuration & Environment Variables

### Build-time env vars:
| Variable | Purpose |
|----------|---------|
| `AMVERGE_NOTIFICATIONS_API_URL` / `VITE_ADMIN_API_URL` | Notifications endpoint |
| `AMVERGE_NOTIFICATIONS_API_KEY` | API key |
| `AMVERGE_BUG_REPORT_API_URL` | Bug report endpoint |
| `AMVERGE_BUG_REPORT_API_KEY` / `KEY_ID` / `SIGNING_SECRET` | HMAC signing |
| `AMVERGE_CLI_DIR` | Dev CLI checkout location override |
| `AMVERGE_AFTERFX_PATH` / `PREMIERE_PATH` / `RESOLVE_PATH` | Editor exe overrides |

### Filesystem paths:
| Path | Purpose |
|------|---------|
| `{app_data_dir}/episodes/{cacheId}/` | Per-episode cache (clips, thumbs, proxies, manifest.json) |
| `{app_data_dir}/backgrounds/` | Background images |
| `{app_data_dir}/profile_icons/` | Profile icons |
| `{episodesPath}/` | Custom episode storage (from settings) |

---

## Updater Flow

```
App starts → main.tsx: maybeCheckForUpdatesOnStartup()
  ├─ Skips if not Tauri or Linux
  ├─ check() from @tauri-apps/plugin-updater
  ├─ User confirm dialog
  ├─ downloadAndInstall()
  │   ├─ Windows: NSIS passive install, kills + relaunches
  │   └─ macOS: replaces .app bundle
  ├─ macOS: relaunch() from @tauri-apps/plugin-process
  └─ Other: message prompt to manually restart
```

---

## Key Gotchas

1. **CLI sidecar is external** — `AMVerge-CLI` is a separate Git repo. Dev mode expects it at `../AMVerge-CLI/`. Prod bundles it via PyInstaller.

2. **Discord RPC is disabled** — `start_discord_rpc` and `update_discord_rpc` are no-ops. Only `stop_discord_rpc` actually works (kills old process).

3. **Episode cache is immutable after import** — clips are generated once and cached. To re-detect scenes, delete the episode cache first.

4. **Stderr protocol is the primary IPC** — all real-time progress from the CLI comes via stderr. Stdout is only for final JSON result.

5. **Manifest.json written twice** — preliminary after `INITIAL_CLIPS_READY`, final after process exit. Both contain full state snapshots.

6. **Windows path length** — editor import copies files from deep cache dirs to flat temp dirs to avoid 260-char path limits.

7. **Preview proxy locks** — per-clip `AsyncMutex` prevents duplicate transcodes of the same file.

8. **Export resilience** — stream-copy first, re-encode on failure. GPU contention → reduce workers by 1 and retry.

9. **Animated WebP cache** — fingerprinted by SHA-256 of file head/mid/tail bytes. Cache invalidated if source changes.

10. **All child processes killed on close** — `on_window_event(CloseRequested)` walks all PID lists and kills every subprocess.

11. **Dev builds never install AI** — `ai_env_status` reports `managed: false`, and `ensurePack`/`install_ai_pack` short-circuit in dev. AI runs from the CLI checkout's venv; install extras there with `pip install -e .[all]`. A `managed`-mode (production) build shows the real install dialog.
