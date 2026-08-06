# AMVerge v1 — AI Agent Guide

> Target: `main` (Tauri v2 + React + embedded Python backend)
> Last updated: 2026-08-06

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (React + Zustand)                 │
│  frontend/src/                                                   │
│  ├── main.tsx → update check → ReactDOM.render(<App/>)          │
│  ├── App.tsx → store wiring, event listeners, HEVC check        │
│  ├── 3 pages: HomePage, Menu, Settings                          │
│  ├── 6-7 Zustand stores (some persisted, some runtime)          │
│  ├── 5 hooks (import/export, drag-drop, HEVC, Discord, etc.)    │
│  └── Components: sidebar, clipsGrid, previewPanel, settings     │
│                                                                  │
│  IPC: invoke() + listen() via @tauri-apps/api/core              │
│         + open()/save() via @tauri-apps/plugin-dialog           │
│         + convertFileSrc() via @tauri-apps/api/core             │
└──────────────────────┬──────────────────────────────────────────┘
                       │  Tauri IPC Bridge
┌──────────────────────▼──────────────────────────────────────────┐
│                    TAURI CORE (Rust)                             │
│  frontend/src-tauri/src/                                         │
│  main.rs                                                         │
│  ├── 3 plugins: shell, dialog, updater                           │
│  ├── 6+ managed state structs                                    │
│  ├── 30+ registered commands across 9 modules                    │
│  ├── 10+ event types emitted to frontend                         │
│  └── on_window_event CloseRequested → kill_all_child_processes   │
│                                                                  │
│  Key modules:                                                    │
│  ├── scenes.rs → Python child process, event streaming           │
│  ├── export.rs → export orchestration, GPU detection             │
│  ├── export/multi.rs, export/merge.rs → ffmpeg export workers    │
│  ├── preview.rs → proxy/HEVC/audio ops                           │
│  ├── settings.rs → file I/O, image crop, explorer integration    │
│  ├── cache.rs → episode disk cleanup                             │
│  ├── editor_import.rs → Windows automation (PS/Python)           │
│  ├── notifications.rs + bug_report.rs → HTTP API calls           │
│  └── discord.rs → Discord RPC subprocess management              │
└──────┬───────────────────────┬──────────────────────────────────┘
       │                       │
       │  process::Command     │  process::Command
       │  + Stdio::piped       │  + Stdio::piped
       ▼                       ▼
┌──────────────┐    ┌──────────────────┐
│  backend/    │    │  ffmpeg / ffprobe│
│  app.py      │    │  (bundled binary)│
│  (Python)    │    │                  │
│              │    │  Located via:    │
│  Dev: python │    │  backend/bin/    │
│  Prod:       │    │  or _internal/   │
│  PyInstaller │    │                  │
│  sidecar     │    │  Uses:           │
│              │    │  - libx264       │
│  Entry:      │    │  - nvenc/amf/qsv │
│  trim_scenes │    │  - concat demux  │
│  _at_keyfram │    │  - aac encoder   │
│  es()        │    │  - segment muxer │
│              │    │                  │
│  Utils:      │    │                  │
│  - keyframes │    │                  │
│  - scene     │    │                  │
│    detection │    │                  │
│  - pair      │    │                  │
│    similarity│    │                  │
│  - DiscordRPC│    │                  │
│  - thumbnails│    │                  │
└──────────────┘    └──────────────────┘
```

**Key difference from v2:** Python backend scripts are embedded in the repo under `backend/`. Scene detection, thumbnails, pair-merging, and Discord RPC all run in a single Python child process spawned by Rust.

---

## Directory Structure

```
backend/                           # Python sidecar (embedded in repo)
  app.py                            # Main entry: trim_scenes_at_keyframes()
  requirements.txt                  # PyAV, PIL, numpy, opencv-python, scenedetect
  backend_script.spec               # PyInstaller spec file
  bin/                              # Bundled ffmpeg.exe, ffprobe.exe (Windows only)
  utils/
    keyframes.py                    # Keyframe extraction via PyAV packet flags
    video_utils.py                  # Re-export tools, merge_short_scenes
    cs_scenedetect.py               # Cosine-similarity pair check for auto-merge
    binaries.py                     # Binary (ffmpeg/ffprobe) path resolution
    progress.py                     # PROGRESS| stderr protocol (print + flush)
    hevc_script.py                  # HEVC codec detection (standalone script)
    image_processor.py              # Crop/flip/rotate images (PIL)
  discordrpc/
    discord_rpc.py                  # Discord Rich Presence client library
    rpc_server.py                   # JSON-over-stdin RPC server process
  deprecated/
    scene_scanning.py               # Old frame-by-frame PyAV + cv2 algorithm

frontend/
  src/                              # React frontend
    main.tsx                        # Entry: console init, updater, ReactDOM
    App.tsx                         # Root component, routing, store wiring
    MainLayout.tsx                  # Layout wrapper

    components/
      AppLayout.tsx                 # Top-level chrome wrapper
      ImportTerminal.tsx            # Full-screen import terminal overlay
      Navbar.tsx                    # Top navigation bar

      sidebar/
        Sidebar.tsx                 # Sidebar root: tabs, episode panel, export
        episodePanel/               # Episode tree, context menus, modals

      clipsGrid/
        ClipsContainer.tsx          # Clip grid + export button integration
        LazyClip.tsx                # Individual clip tile

      common/
        Dropdown.tsx, ColorPicker.tsx, CropModal.tsx, SettingRow.tsx

      icons/ProfileIcons.tsx

      menu/
        About.tsx, BugReport.tsx, Console.tsx, Credits.tsx, PatchNotes.tsx

      previewPanel/
        PreviewContainer.tsx        # Video preview panel
        VideoPlayer.tsx             # HTML5 video player wrapper

      settings/
        GeneralSettings.tsx, AppearanceSection.tsx, DiscordRPCSection.tsx

    features/export/
      profiles.ts                   # Export profile definitions
      profileIconUtils.tsx          # Profile icon utilities

    features/theme/colorPresets.ts

    hooks/
      useDiscordRPC.ts              # Discord RPC lifecycle
      useDragDropImport.ts          # Tauri drag-drop file import
      useEpisodePanelState.ts       # Episode panel CRUD
      useHEVCSupport.ts             # Browser HEVC codec detection
      useImportExport.ts            # Core import/export pipeline
      useStartupUpdateNotification.ts # GitHub version check popup

    pages/
      HomePage.tsx                  # Home page: preview + clips grid
      Menu.tsx                      # Menu page
      Settings.tsx                  # Settings page

    stores/
      appStore.ts                   # AppState: clips, loading, progress
      episodeStore.ts               # EpisodePanel (persisted)
      scenePreviewStore.ts          # Animated WebP paths by clip ID
      settingsStore.ts              # User prefs + Theme (persisted)
      UIStore.ts                    # UI layout state

    types/domain.ts                 # ClipItem, EpisodeEntry, EpisodeFolder

    utils/
      appConsole.ts                 # In-app console log aggregator
      episodeUtils.ts               # Manifest loading, path remapping, cache clearing

    styles/                         # CSS files

  src-tauri/                        # Rust Tauri backend
    Cargo.toml                      # Tauri v2, tokio, serde, reqwest, image
    tauri.conf.json                 # App config + updater
    tauri.windows.conf.json         # NSIS installer config
    tauri.macos.conf.json           # macOS DMG config
    tauri.linux.conf.json           # Linux config

    capabilities/default.json       # Permissions

    src/
      main.rs                       # Tauri::Builder, plugins, state, commands, cleanup
      lib.rs                        # Placeholder lib (not used)
      state.rs                      # Managed state: sidecar, proxy locks, abort flags, PIDs
      payloads.rs                   # Event payload structs

      commands/
        scenes.rs                   # detect_scenes, abort, sidecar lifecycle
        export/                     # Export system (multi-file module)
          mod.rs                    # Public API re-exports
          multi.rs                  # Per-clip export worker (stream-copy or re-encode)
          merge.rs                  # Merge export worker (concat or filtergraph)
          ops.rs                    # fast_merge, fast_split (direct ffmpeg)
          hardware.rs               # GPU encoder detection (nvidia-smi + ffmpeg)
          probe.rs                  # Duration/codec probing via ffprobe
          types.rs                  # ExportOptionsPayload, ClipSpec
          progress.rs               # Export progress tracking
        preview.rs                  # HEVC check, audio probe, proxy transcode
        settings.rs                 # File I/O, image crop, profile icons, reveal
        cache.rs                    # Episode cache cleanup
        editor_import/              # Windows editor automation
          mod.rs
          after_effects.rs          # PowerShell UI automation for AE
          premier_pro.rs            # PowerShell UI automation for Premiere
          davinci_resolve.rs        # Python scripting bridge for Resolve
          capcut.rs                 # PowerShell UI automation for CapCut
        notifications.rs            # Startup notification fetch (HTTP GET)
        bug_report.rs               # Bug report submit (HTTP POST, HMAC signed)
        discord.rs                  # Discord RPC subprocess management

      utils/
        ffmpeg.rs                   # resolve_bundled_tool (ffmpeg/ffprobe path lookup)
        logging.rs                  # console_log emission
        paths.rs                    # Path sanitization helpers
        process.rs                  # CREATE_NO_WINDOW flag for Windows
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
| Python Backend | Embedded scripts (`backend/`) | Python 3.10+, PyAV, PIL, numpy |
| FFmpeg/FFprobe | Bundled binaries | Platform-specific |
| Python Packaging | PyInstaller | `--onedir` mode |
| CI/CD | GitHub Actions | Windows, Linux, macOS |

---

## Zustand Stores (v1)

| Store | Persisted? | Purpose |
|-------|-----------|---------|
| **useAppStateStore** | No (runtime) | Core: `clips`, `loading`, `progress`, `selectedClips`, `focusedClip`, `batchImports` |
| **useAppPersistedStore** | Yes (`localStorage`) | `exportDir`, `dismissedNotificationIds` |
| **useGeneralSettingsStore** | Yes (`localStorage`) | All user settings: export profiles, codec, hardware, audio, theme, RPC, episodesPath |
| **useEpisodePanelRuntimeStore** | Yes (`episodePersistStorage`) | `episodes[]`, `selectedEpisodeId`, `openedEpisodeId` |
| **useEpisodePanelMetadataStore** | Yes (`localStorage`) | `episodeFolders`, `episodeNamesById`, folder assignments |
| **useScenePreviewStore** | No (runtime) | Animated WebP paths by clip ID |
| **useUIStateStore** | Yes (partial) | Theme colors, scale, border radius, sidebar width, columns |

---

## Python Backend Entry Point: `backend/app.py`

### Main function: `trim_scenes_at_keyframes(input_file, output_dir)`

```
trim_scenes_at_keyframes():
  │
  ├── [10%] generate_keyframes(input_file)
  │   ├── Fast path: packet.is_keyframe flags from container.demux()
  │   ├── Fallback: decode only keyframes (skip_frame="NONKEY")
  │   └── Pathological guard: >10 kfps → fallback to segment-based
  │
  ├── merge_short_scenes(cut_points, min_duration=0.25)
  │   → removes boundaries creating sub-250ms segments
  │
  ├── [50%] run_ffmpeg_segment(input_file, output_dir, cut_points)
  │   ├── ffmpeg -i video -c:v copy -c:a aac -f segment -segment_times <cuts>
  │   ├── Chunks into 1500-cut batches (avoids Windows cmd-line 32767 limit)
  │   └── Output: {file_name}_{0000..NNNN}.mp4
  │
  ├── [75%] collect_scenes()
  │   → builds ClipItem-like dicts with paths, timestamps, duration
  │
  ├── [90%] generate_thumbnails_streaming(scenes, output_dir)
  │   ├── ThreadPoolExecutor (max 4 workers)
  │   ├── make_thumbnail(): PyAV decode first keyframe → PIL resize (960w) → JPEG
  │   └── Streams results via stderr protocol
  │
  └── [100%] stdout: JSON array of scene dicts
```

---

## IPC Protocol: Python → Rust

Python sidecar communicates with Rust via:

| Channel | Direction | Format |
|---------|-----------|--------|
| **Arguments** | Rust → Python | `<video_path> <output_dir>` |
| **Stderr** | Python → Rust | Line-delimited protocol events |
| **Stdout** | Python → Rust | Final JSON array of scene dicts |
| **Exit code** | Python → Rust | 0 = success, non-zero = failure |

**Stderr protocol events:**
```
PROGRESS|<pct>|<message>
INITIAL_CLIPS_READY|<json_array>
THUMBNAIL_READY|<position>
PAIR_RESULT|<pos_a>|<pos_b>|<0 or 1>
PROCESSING_COMPLETE
```

---

## Scene Detection Algorithm (v1)

**Strategy: Keyframe-based splitting** — NOT frame-by-frame analysis.

1. Extract keyframe timestamps via PyAV `packet.is_keyframe` on demuxed packets
2. Skip timestamp 0.0 (first keyframe)
3. Remove sub-250ms segments (`merge_short_scenes`)
4. Split video at keyframes using ffmpeg segment muxer (`-c:v copy` — no re-encode)
5. Generate thumbnails for each clip (PyAV decode + PIL resize)
6. Run cosine-similarity pair check on adjacent thumbnails
7. Auto-merge near-identical adjacent clips (dissimilarity < 0.10)

**Pair similarity check** (`backend/utils/cs_scenedetect.py`):
```
check_pair_similar(thumb_a, thumb_b):
  1. Load both JPEGs as RGB numpy arrays
  2. Average-pool to 8x8 blocks (blur)
  3. Cosine similarity between pooled images
  4. If dissimilarity < 0.10 → should_merge = true
```

**Deprecated** (`backend/deprecated/scene_scanning.py`):
- Frame-by-frame PyAV + cv2 Canny edge detection
- Too slow, abandoned in favor of keyframe-based approach

---

## FFmpeg Integration

FFmpeg/ffprobe resolution (`utils/ffmpeg.rs: resolve_bundled_tool`):
1. Tauri resource path: `bin/{tool}.exe`
2. Sidecar `_internal` directory (bundled with PyInstaller)
3. Dev fallback: walk up ancestor dirs looking for `bin/` or `_internal/`

All ffmpeg processes:
- `CREATE_NO_WINDOW` on Windows
- PID tracked for cleanup on app close

**FFmpeg operations in v1:**

| Operation | Location | Technique |
|-----------|----------|-----------|
| Scene cutting (import) | `backend/app.py` | `-c:v copy -f segment` |
| Clip export | `export/multi.rs` | Stream copy or re-encode per clip |
| Merge export | `export/merge.rs` | Concat demuxer (copy) or filtergraph (re-encode) |
| Fast merge | `export/ops.rs` | Concat filter with PTS reset |
| Fast split | `export/ops.rs` | Two-pass: -t / -ss, libx264 CRF 17 |
| Preview proxy | `preview.rs` | libx264 480p, g=1 (all keyframes), CRF 32 |
| Merged preview | `preview.rs` | Concat copy with optional audio transcode |
| Background crop | `settings.rs` | libx264, crop filter, optional palettegen for GIF |
| HEVC detection | `preview.rs` | ffprobe stream=codec_name |
| Audio streams | `preview.rs` | ffprobe stream_tags=language,title |

---

## Export System

**Export workflows:**
- `remux` → stream-copy when source is h264+AAC, re-encode fallback
- `video_encode` → always re-encode with chosen codec
- `editor_import` → generate editor project files (XML, DRT, TSV, JSON)

**Codecs:** h264, h265, AV1, ProRes (LT/422/HQ/4444/XQ), CineForm, DNxHR, uncompressed

**Hardware acceleration (auto-detect):**
- NVIDIA NVENC (h264_nvenc, hevc_nvenc, av1_nvenc) — up to 12 parallel
- AMD AMF, Intel QSV, VideoToolbox, VAAPI — parallel limit 1
- Detected via `ffmpeg -hide_banner -encoders` + live encoder probe

**Export resilience:**
1. Try stream-copy first (fastest, lossless)
2. If fail → re-encode with CPU (libx264/x265/SVT-AV1)
3. If GPU encoder init fails → CPU fallback
4. GPU contention → reduce parallel workers by 1, retry

---

## Rust Managed State

| State Struct | Contents | Purpose |
|-------------|----------|---------|
| **ActiveSidecar** | `pid: Mutex<Option<u32>>`, `child: Mutex<Option<Child>>` | Python sidecar lifecycle |
| **PreviewProxyLocks** | `Arc<AsyncMutex<HashMap<String, ...>>>` | Per-clip proxy lock |
| **DiscordRPCState** | `child: Mutex<Option<Child>>` | Discord RPC subprocess |
| **EditorImportAbortState** | `abort_requested: AtomicBool` | Editor import cancel |
| **ExportAbortState** | `abort_requested: Arc<AtomicBool>`, `pids: Arc<Mutex<Vec<u32>>>` | Export cancel |
| **ActiveFfmpegPids** | `pids: Arc<Mutex<Vec<u32>>>` | PIDs for cleanup on close |

---

## Discord RPC (v1)

**Active** in v1 — disabled in v2.

Python subprocess (`backend/discordrpc/rpc_server.py`):
- stdin: JSON commands `{ type: "update", details, state, ... }` or `{ type: "shutdown" }`
- Managed via Rust `discord.rs` — spawn at app start, writeln JSON commands, kill on close

---

## Data Flow: Import

```
User drags video / clicks Import
  │
  ▼
useImportExport.ts: handleImport(file)
  ├─ buildEpisodeCacheId(file) → "VidName_a1b2c3d4"
  ├─ Loading=true, activeOperation="import"
  │
  ├─ IF importMethod === "video_files" (streaming):
  │   ├─ startVideoStreamingListeners()
  │   │   ├─ listen("initial_clips_ready")  → parse, add clips
  │   │   ├─ listen("clip_ready")           → patch clip paths
  │   │   ├─ listen("thumbnail_ready")      → thumbnailReady=true
  │   │   ├─ listen("pair_result")          → auto-merge adjacent clips
  │   │   └─ listen("processing_complete")  → loading=false
  │   │
  │   ├─ invoke("detect_scenes", { videoPath, episodeCacheId, customPath })
  │   │     │
  │   │     ▼ Rust scenes.rs
  │   │     ├─ Resolve output_dir = app_data/episodes/{cacheId}
  │   │     ├─ Clear old files in output_dir
  │   │     ├─ DEV: spawn Python → `python backend/app.py <video> <outdir>`
  │   │     ├─ PROD: spawn PyInstaller sidecar → `backend_script.exe <video> <outdir>`
  │   │     ├─ Read stderr line-by-line → emit Tauri events
  │   │     ├─ Read stdout → final JSON array of scenes
  │   │     └─ Write manifest.json to output_dir
  │   │
  │   └─ Resolves on processing_complete
  │
  └─ IF importMethod === "webp_files" (blocking):
      └─ await invoke("detect_scenes", ...) → blocks
      └─ loadEpisodeManifest(episodeId)
          └─ invoke("load_episode_manifest") → read manifest.json
```

---

## Data Flow: Export

```
User selects clips + clicks Export
  │
  ▼
useImportExport.ts: handleExport(selectedClips, mergeEnabled)
  ├─ buildExportOptionsPayload(activeProfileId)
  ├─ invoke("export_clips", { clips, savePath, mergeEnabled, exportOptions, audioTrack })
  │     │
  │     ▼ Rust export.rs (dispatches to multi.rs or merge.rs)
  │     ├─ Per-clip: stream-copy with ffmpeg, re-encode on failure
  │     ├─ Merge: concat demuxer or filtergraph
  │     ├─ Track progress via scene_progress events
  │     └─ Return output file paths
  │
  └─ reveal_in_file_manager(exportedFiles[0])
```

---

## Sidecar Build & Bundling

### Dev mode:
- Rust spawns: `python backend/app.py <video> <outdir>`
- FFmpeg/ffprobe resolved from `backend/bin/` or system PATH

### Prod mode (PyInstaller):
- Build script: `frontend/scripts/build-sidecar.mjs`
  1. Detect target triple (`x86_64-pc-windows-msvc`, etc.)
  2. Run PyInstaller on `backend/app.py` with `--onedir --clean --noconfirm`
  3. Bundle ffmpeg/ffprobe as `--add-binary` data files
  4. Copy `dist/backend_script/` → `src-tauri/bin/backend_script-{triple}/`
- Tauri bundles resources from `src-tauri/bin/` at build time
- At runtime: `resolve_bundled_tool()` finds binaries

---

## Build Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server (frontend only) |
| `npm run tauri:dev` | Full Tauri dev (with `.env`) |
| `npm run build:sidecar` | PyInstaller build of Python backend |
| `npm run tauri:build` | Full production build |
| `npm run tauri:build:linux` | Linux community build |

---

## Key Gotchas (v1)

1. **Python backend is embedded** — `backend/app.py` is in the repo. Modifications to scene detection require Python changes, not CLI changes.

2. **Discord RPC is active** — manages a persistent Python child process for RPC. Must clean up on app close.

3. **Scene detection is keyframe-based only** — no ML models. TransNetv2 and PySceneDetect are NOT available in v1. No re-encode phase.

4. **No animated WebP previews** — v1 uses static JPEG thumbnails only. No libwebp integration.

5. **No post-export passes** — depth maps, deadframe detection, and interpolation are v2-only features.

6. **Export is all Rust-side** — no external CLI for export. All ffmpeg export logic is in `export/multi.rs` and `export/merge.rs`.

7. **No batch WebP generation** — thumbnails are generated in the Python sidecar during import, not as a separate Rust-driven pipeline.

8. **Episode cache is immutable after import** — same as v2.

9. **All child processes killed on close** — `on_window_event(CloseRequested)` walks all PID lists.

10. **Windows path length** — editor import copies files to flat temp dirs to avoid 260-char limits (same as v2).
