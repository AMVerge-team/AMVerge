# AMVerge v2: AI Agent Guide

> Target: `V2_BRANCH` (Tauri v2 + React + AMVerge-CLI)
> Last updated: 2026-08-11

## Cross-Repo Contracts

Sibling repos sit next to this one: `../AMVerge-CLI` (the Python backend this app spawns) and `../AMVerge-Extension` (After Effects CEP panel). Each repo has its own agent, and this agent owns this repo only.

- **Reading** sibling repos needs no prompt. **Editing** them asks the user every time (`.claude/hooks/sibling_edit_guard.py`, PreToolUse, reads `siblings` from `contracts.json`). The hook covers the file-editing tools, not shell commands, so never change a sibling repo through Bash. Path-based `Edit(../...)` permission rules were tried and do not work: they cannot match outside the project root. Only do it for trivial fixes the user approves. Anything else goes through `/handoff`.
- `.claude/contracts.json` lists the files here that call into or are mirrored by other repos. Keep it current.
- `.claude/hooks/contract_guard.py` (PostToolUse) reminds you, once per session per contract, when you edit one of those files.
- The CLI is upstream. If the app needs the CLI to behave differently (new flag, event, JSON field, extra), do not work around it in Rust or TS: run `/handoff AMVerge-CLI` with the request. When a CLI handoff arrives here, adapt the app to it.
- `/handoff <repo>` writes a brief to `.claude/handoffs/` (gitignored), runs that repo's agent headless in its own checkout (accept-edits, cannot edit other repos, does not commit), and relays its report.

| Contract | Here | Other side |
|---|---|---|
| `amverge backend` / `materialize-clips` + IPC events | `commands/scenes.rs`, `commands/scenepacks.rs` | CLI `commands/sidecar/*`, `core/infra/ipc.py` |
| `amverge export` + `--ipc` post passes | `commands/export.rs`, `commands/export/*` | CLI `commands/export/export.py`, `core/export/engine.py`, `core/infra/preview.py` |
| `amverge models --json` | `commands/models.rs` | CLI `commands/upscaling/models.py` |
| Export encoder settings (Tools' live frames are encoded with them) | `commands/tools.rs` `export_encoder` | CLI `core/upscaling/registry.json` `presets`, `core/depth/depth_map.py` crf/preset |
| `amverge[extras]` install | `commands/deps/*` | CLI `pyproject.toml` |
| `extension_sync/` dir | `commands/extension_sync.rs`, `src/hooks/useExtensionSync.ts` | Extension (writer not found on `mac-support-v0`) |
| UI design tokens | `src/styles/*` | Extension `AMVERGE_APP_UI_REFERENCE.md`, `AMVerge/css/*` |

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
│  - upscale   │    │  - aac encoder   │
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
        AiModelsSection.tsx        # depth + upscale model weights manager
        exportSettings/            # Export + PostExportPasses sections

    features/export/
      profiles.ts                   # Export profile definitions, codec/container logic
      postPasses.ts                 # Post-export pass types (depth, upscale)
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
        scene_resume.rs             # resume/abort a paused video-mode episode (materialize-clips)
        export.rs                   # export_clips, run_export_pass, GPU detection, ops
        preview.rs                  # WebP gen, proxy transcode, HEVC check, audio probe
        settings.rs                 # File I/O, image crop, profile icons, reveal
        cache.rs                    # Delete/clear episode caches
        editor_import.rs            # Windows: AE, Premiere, Resolve, CapCut import
        notifications.rs            # Startup notification fetch (HTTP GET)
        bug_report.rs               # Bug report submit (HTTP POST, HMAC signed)
        deps.rs                     # AI env (uv venv), pack install/status
        models.rs                   # AI model weights (list/download/delete)
        scene_scout/                # Scene Scout: mod.rs commands, cli.rs one-shot runs, worker.rs daemon, types.rs wire types
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
        process.rs                  # CREATE_NO_WINDOW flag, kill_process_tree (taskkill /T or process-group kill)
        sidecar.rs                  # amverge_command: CLI resolution (dev/prod)
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
| **useEpisodePanelRuntimeStore** | Yes (IndexedDB) | `episodes[]`, `selectedEpisodeId`, `openedEpisodeId`. Only `episodes` persists, in IndexedDB (`utils/episodePersistStorage.ts`, same db as V1), so there is no localStorage size cap. `coalescedPersistStorage` keeps one key per episode plus an ordered id list under V1's key, writes only episodes whose object changed (one write at a time, 300ms apart), and converts V1's whole-list value on the first save. Keep unchanged episodes' objects when updating the list, or every save rewrites them. It loads async, so `main.tsx` awaits `waitForEpisodes()` before rendering |
| **useEpisodePanelMetadataStore** | Yes | `episodeFolders`, `episodeNamesById`, folder assignments |
| **useUIStateStore** | Yes (partial) | `sidebarWidthPx`, `cols`, `sidebarEnabled`, `activePage`, `episodeScrollTops` (each episode's grid offset, saved by `ClipsContainer` and restored when it reopens) |

**Never persist:** `useScenePreviewStore`, `usePassRunStore`, `useWebpLoadingStore`

---

## All Tauri Commands

| Command | Module | Purpose |
|---------|--------|---------|
| `detect_scenes` | scenes.rs | Spawn CLI sidecar, stream progress events |
| `load_episode_manifest` | scenes.rs | Read cached `manifest.json` from disk |
| `abort_detect_scenes` | scenes.rs | Kill sidecar process groups: one episode's (`episodeCacheId`) or all. `ActiveSidecar` tracks every running backend by pid, since a batch can overlap two |
| `resume_episode_clips` | scene_resume.rs | Resume a paused video-mode episode (import stopped by closing the CLI mini window or the app): re-cuts missing clips/posters in one `materialize-clips --cut-mode copy|auto` run (mode from the manifest's detection method, so keyframe-exact scenes stream-copy like the import did; CLI streams `MATERIALIZED|<json>` per item), streams `clip_ready`/`thumbnail_ready`. Only the re-encode queue (`features/import/reencodeQueue.ts`) starts it: an import's handed-off re-encodes and the episode row's resume button both go through it, so one runs at a time. "Paused" is derived from unfinished clips (never stored) and excludes queued episodes |
| `abort_resume_episode` | scene_resume.rs | Pause a running resume (kills its cutter; remaining clips stay unfinished, not failed) |
| `unique_export_base_name` | export.rs | First free `name`, `name (1)`, ... in the export folder so merged exports never overwrite |
| `export_clips` | export.rs | Spawn CLI export, stream progress |
| `run_export_pass` | export.rs | Post-export passes (depth, upscale). Upscale needs CLI ≥ 1.2.0's `upscale --ipc`; the app only offers torch models at their native scale (`UPSCALE_MODEL_OPTIONS`), since the CLI's other scales are a plain resize and its ArtCNN models run on onnxruntime's CPU build |
| `abort_export` | export.rs | Kill export processes (also a Tools run: its input conversion and pass) |
| `tools_prepare_input` | tools.rs | Tools' input: the file itself when OpenCV reads its codec and container (`DIRECT_CODECS`/`DIRECT_CONTAINERS`), else, or for a `[start, end]` range, a CRF 12 H.264 copy in `app_cache_dir/tools_inputs` (cleared each run). `features/tools/runTool.ts` then runs `run_export_pass` once, retrying through a forced conversion if a direct run fails. Tools (Esc menu, or a clip's right-click "Open in Tools") is one clip in, one upscale or depth map out, never both or a batch. `ToolsViewer` is two players side by side, kept in sync (the left video leads, the right follows within 60 ms), with the settings in a bar under them. While a run renders, the right shows each CLI live frame and the left holds the original on that same frame: `runTool` places it from the "n/total" in the progress line around it (upscale sends a frame's preview before its count, depth after, `PREVIEW_FRAME_OFFSET`), since `PREVIEW_FRAME` carries no frame number and the app's parser takes exactly three fields. The CLI's live JPEG (full resolution) is not shown as an image: Chromium scales images smoother than video and the export converts colors through a bgr24 pipe, so it looked softer and shifted. `tools_snapshot_live_frame` copies it before the CLI overwrites it, `tools_encode_live_frame` encodes it with the export's exact x264 settings and the input's color tags, and the viewer plays that in a `<video>` (newest frame wins, double-buffered); it matches the exported frame at 43-45 dB PSNR. "Generate" renders into `app_cache_dir/tools_results` (`tools_generated_output`, cleared each time) and saves nothing; "Export" copies that file to the Save to folder under a free name (`tools_export_result`, never overwrites), and a changed setting clears the result so a stale one can't be exported. The sizes under the players come from `tools_video_size` (the source's real size, times the model's scale for an upscale). When it finishes, the whole result plays beside the original. Its players use `useToolsPlayable`: the file itself when the webview plays it, else a 1080p CRF 16 copy, never the grid's 480p proxy; it claims the `tools` process kind, its choices persist in `amverge.tools.v1`, and a drop while it is open becomes its clip instead of an import |
| `detect_nvidia_encoder_profile` | export.rs | nvidia-smi GPU profile detection |
| `detect_gpu_encoder_capabilities` | export.rs | ffmpeg encoder probing |
| `fast_merge` | export.rs | Direct ffmpeg concat (x264 CRF 17) |
| `fast_split` | export.rs | Direct ffmpeg split at timestamp |
| `import_media_to_editor` | editor_import.rs | Windows editor automation |
| `abort_editor_import` | editor_import.rs | Set abort flag |
| `detect_davinci_resolve` | editor_import.rs | Is DaVinci Resolve installed (path lookup) |
| `import_clips_to_davinci` | editor_import.rs | Media Pool + append to Resolve timeline |
| `check_video_codec` | preview/proxy.rs | ffprobe the episode's video codec: `{hevc, browserPlayable}`. HEVC proxies only without the system decoder; codecs no webview decodes (XviD, MPEG-2, ProRes...) always get the h264 proxy (`videoNeedsProxy`). Importable types are one list, `utils/videoExtensions.ts` |
| `get_audio_streams` | preview.rs | ffprobe audio stream listing |
| `hover_preview_error` | preview.rs | Log hover preview errors |
| `ensure_preview_proxy` | preview.rs | Transcode to x264 proxy (480p, CRF 32), beside the clip for app-owned clips; `inCache: true` (Flow's picked files) writes it to the preview cache instead, never into the user's folder |
| `ensure_merged_preview` | preview.rs | Concat multiple proxies |
| `ensure_scene_range_preview` | preview/proxy.rs | 480p x264 cut of one `[start, end]` range of a source video, cached in app cache (Scene Scout tiles). Hardware decode (`-hwaccel auto`, software retry on failure) + `ultrafast`, gop 12: decoding the 10-bit HEVC source is the cost on weak CPUs. `useScoutPreviewPrefetch` cuts the top 8 results one at a time after a search with the tiles' exact args, so a hover hits the cache or joins the in-flight encode via the per-path lock |
| `preview_cache_size` / `clear_preview_cache` | preview/cache.rs | The preview cache (`app_cache_dir/scene_range_previews`): capped at 1 GB, least recently used pruned on launch and after each new preview (a cache hit refreshes the file's mtime); Settings › Features › Storage shows it with a Clear button |
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
| `v1_migration_source` / `import_v1_files` | migration.rs | First launch after AMVerge 1 (`features/migration/importV1.ts`, awaited in `main.tsx` before render). V1 (`com.amiri.amverge`) 1.3.3 writes `v2-migration.json` (its localStorage + IndexedDB episode list) on every launch; V2 rehydrates its stores from it (feature switches forced off), moves V1 episode folders into `episodes_storage/` with a written manifest, copies backgrounds/profile icons, then writes the `v1-imported` marker. With no `v2-migration.json` at all (user skipped 1.3.3), a fresh V2 rebuilds episodes from V1's default `episodes/` folders (`Name_NNNN.mp4` + `.jpg`): clips play and export, but there are no scene times or source video, so no Scene Scout. On a later launch (release builds only), `remove_v1_data_in_background` deletes V1's roaming and local `com.amiri.amverge` folders, unless V1's `episodes/` still holds any file. Release flow: `RELEASING.md` |
| `path_exists` | settings.rs | Is a file still there. Clicking a Scene Scout hit whose source episode is gone (e.g. an imported database from another PC) opens `MissingEpisodePrompt`, which offers to remove that episode from the database (`removeMissingVideo`) |
| `move_storage_to_new_dir` | settings.rs | Move the owned storage folders (`episodes_storage`, `scene_packs`, Scene Scout) to a new root, each folder whole (merged when the new root already has one, the emptied old folder removed). `move_entry` copies a folder's contents across drives (`content_only`), never `copy_inside` into an existing folder, which nested it as `<dest>/<name>`. Stored paths are then rewritten by `features/storage/rebaseStoragePaths.ts` from each path's place inside those folders, never the old root, so it also repairs paths an earlier move broke; it runs after a move, after a reset, and once at startup |
| `get_default_episodes_dir` | settings.rs | Return app_data_dir/episodes |
| `start_discord_rpc` | discord.rs | **NO-OP** |
| `update_discord_rpc` | discord.rs | **NO-OP** |
| `stop_discord_rpc` | discord.rs | Kill RPC child process |
| `fetch_hyetta_events` | events.rs | GET `hyetta.net/api/events` (raw). `components/events/hyetta.ts` drops events whose submission deadline passed over a month ago (mirrors the server's `PUBLIC_PAST_EVENT_RETENTION`, change both together) and maps the rest to grid events (always HC, id `hyetta-<id>`, group as host); they join Active & Upcoming or Past from their own store slice, so either source can fail alone. Polled every 5 minutes, since it is a third party's API. Hosts can also link their own event's page (`hyettaUrl`, optional, `hyetta.net/event/<id>` only, changes without review like the invite); the same event can then show twice, deliberately not deduped |
| `submit_bug_report` | bug_report.rs | HTTP POST (HMAC signed) |
| `fetch_startup_notification` | notifications.rs | HTTP GET startup notification |
| `ai_env_status` | deps.rs | AI env status: packs, torch variant, GPU, sizes |
| `install_ai_pack` | deps.rs | Install one AI pack (+ torch) into app venv |
| `abort_ai_install` | deps.rs | Kill in-flight uv install |
| `uninstall_ai_pack` | deps.rs | Remove one pack's packages (torch kept) |
| `remove_ai_env` | deps.rs | Delete the whole AI environment |
| `update_ai_cli` | deps.rs | Upgrade the AI env's amverge to the newest PyPI patch in the bundled major.minor series (silent, ~20s after launch, prod only) |
| `list_models` | models.rs | Spawn `amverge models --json` → depth + upscale weights |
| `download_model` | models.rs | `amverge models --json --download <key>` |
| `delete_model` | models.rs | `amverge models --json --delete <key>` |
| `scout_list_databases` | scene_scout/ | List all databases in root |
| `scout_database_info` | scene_scout/ | Fetch info for a single database |
| `scout_create_database` | scene_scout/ | Create a new database |
| `scout_open_database` | scene_scout/ | Open external database with validation and migration |
| `scout_delete_database` | scene_scout/ | Delete database file |
| `scout_list_videos` | scene_scout/ | List videos in a database |
| `scout_status` | scene_scout/ | Get Scene Scout model and root status |
| `scout_search` | scene_scout/ | Query scenes with SigLIP 2 embeddings (daemon or one-shot). `skipEdgesMs` (search settings' "Skip openings and endings", 2:30, CLI ≥ 1.2.0) leaves out scenes that close to their episode's start or end, measured from its last indexed scene, before ranking so the result count holds |
| `scout_add_video` | scene_scout/ | Index video scenes into a database. Optional `scenes` (`[start_ms, end_ms]` pairs from a home episode's manifest) skips detection: sent as `scenes` to the daemon, as `--scenes-json <tmp file>` to the CLI (CLI ≥ 0.9.0). AI detection's stderr `PROGRESS|` lines become `scout_progress` stage `detecting` (`cli.rs: forward_stderr`), since detection is most of the time; a batch shows Overall and Current bars |
| `abort_scout_index` | scene_scout/ | Kill active indexing process tree |
| `scout_unload_model` | scene_scout/ | Unload model weights from memory |

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
  │   └─ Resolves on phase1_complete OR process end. Clips still uncut then (AI re-encodes) are handed off: the episode's CLI is killed (`abort_detect_scenes` with its `episodeCacheId`) and the episode joins the re-encode queue (`features/import/reencodeQueue.ts`), which finishes one episode at a time through `resume_episode_clips`: the opened episode first (switching the moment another queued one is opened), the rest in queue order
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
  ├─ clipExportSpecs(clip) → episode source range, or a Scenepack's materialized clip
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
      ├─ before export, 2+ clips: PassTargetsModal (`features/export/passTargets.ts`) picks which clips get each pass (default all; cancel drops the export)
      ├─ merge on: each pass runs on the merge itself when every clip is picked for it, else on a staged merge of its picks (`exportMergedWithPasses`)
      └─ runPostExportPasses(targets: PassTarget[], passesSnapshot)
           ├─ For each pass: invoke("run_export_pass", { pass, inputPath, outputPath, args })
           └─ Drive passRunStore (modal UI with progress/preview/logs)
```

---

## AI Models Manager

Settings → Features (Model weights) manages the model weights for the depth-map and upscale passes. Thin bridge over the CLI `amverge models --json` command:

```
AiModelsSection.tsx → invoke("list_models") → Rust models.rs → amverge models --json
  → CLI prints {"depth":[{key,name,method,file,sizeBytes,downloaded}],
                 "upscale":[...]}
  → parsed into ModelInfo[] → rendered with Download/Delete buttons

Download/Delete → invoke("download_model"|"delete_model", { key })
  → amverge models --json --download <key> | --delete <key>
  → CLI prints {"result":{ok, action, key, message}} → surfaced, list refreshed
```

Each category is gated on its AI pack (`depth`, `upscale`) being installed in the AI env. Model files live under `%APPDATA%/com.amverge.cli/models/`.

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
| `transnetv2_gpu` | PyTorch ML model (GPU accelerated); previews of scenes whose start and end sit exactly on closed keyframes are stream-copied (MP4-muxable sources with AAC/MP3 audio only), the rest re-encoded at detected boundaries |
| `pyscenedetect_cpu` | PySceneDetect library (CPU, adaptive) |
| `keyframe_detection` | Fast stream-copy split at keyframes (no ML) |

---

## Export: Codecs & Hardware Acceleration

**Codecs:** h264, h265, AV1, ProRes (LT/422/HQ/4444/XQ), CineForm, DNxHR, uncompressed

**Hardware encoders (auto-detect):**
- NVIDIA NVENC (h264_nvenc, hevc_nvenc, av1_nvenc): up to 12 parallel
- AMD AMF, Intel QSV, VideoToolbox, VAAPI: parallel limit 1

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

## Key Things to Remember

1. **CLI sidecar is external**: `AMVerge-CLI` is a separate Git repo. Dev mode expects it at `../AMVerge-CLI/`. Prod bundles it via PyInstaller.

2. **Discord RPC is disabled**: `start_discord_rpc` and `update_discord_rpc` are no-ops. Only `stop_discord_rpc` actually works (kills old process).

3. **Episode cache is immutable after import**: clips are generated once and cached. To re-detect scenes, delete the episode cache first.

4. **Stderr protocol is the primary IPC**: all real-time progress from the CLI comes via stderr. Stdout is only for final JSON result.

5. **Manifest.json written twice**: preliminary after `INITIAL_CLIPS_READY`, final after process exit. Both contain full state snapshots.

6. **Windows path length**: editor import copies files from deep cache dirs to flat temp dirs to avoid 260-char path limits.

7. **Preview proxy locks**: per-clip `AsyncMutex` prevents duplicate transcodes of the same file.

8. **Export modes**: encode profiles always re-encode source ranges. Remux merges stream-copy each contiguous run snapped outward to source keyframes. Separate remux exports pass `--exact-copy`: scenes exactly on keyframes stream-copy, the rest re-encode in the source's codec and bit depth, because snapping made neighbours inside one keyframe interval export identical files (AVI is copy only, so it still snaps). GPU contention can fall back from GPU to CPU encoding, but never changes a copy into an encode.

9. **Animated WebP cache**: fingerprinted by SHA-256 of file head/mid/tail bytes. Cache invalidated if source changes.

10. **All child processes killed on close**: `on_window_event(CloseRequested)` walks all PID lists and kills every subprocess. That only runs on a normal close, so on Windows every ffmpeg / ffprobe / CLI / uv child also joins a kill-on-close Job Object right after spawning (`utils/process.rs`: `bind_to_app_lifetime`, or `output_bound` in place of `.output()`); a crash or Task Manager kill still takes the whole tree down. Any new ffmpeg or CLI spawn must do the same. Editors, Explorer and the updater are never bound, so they outlive the app.

10a. **Export leaves the grid usable**: `loading` is global, but `ClipsContainer` only swaps in skeletons when it is not an export (`loadingReplacesGrid`). Searching stays possible during an export: `withModelLoadingCard` opens no card while another job holds `activeOperation`, since closing it would close that job's window.

10b. **One long job at a time**: import, export, resume, Scene Scout add-episode and thumbnail generation each `await claimProcess(kind)` (the re-encode queue is the one exception: it runs beside the import that fed it) (`features/processes/singleProcess.ts`) before starting. If another job runs, `ProcessConflictModal` (the shared `ConfirmModal`) asks to stop it (App's abort, same as the progress window's ✕, then waits until idle) or keep it and drop the new one. Their buttons stay enabled so the question can be asked. A new long job must claim too.

10c. **Settings > Features** (`FeaturesSection.tsx`, was Dependencies): one switch per major feature (`features/featureToggles.ts`: AI Scene Detection, Scene Scout, Scenepacks, Depth / Upscale pass), persisted as `*Enabled` in general settings. Switching an AI feature on installs its pack; off keeps the files ("Free up space" removes them) and resets settings that pointed at it. A switched-off feature is greyed out wherever it appears, or left out when `hideDisabledFeatures` is on: read it with `useFeature(id)` (`isFeatureEnabled` outside components). GPU decode (Nelux) is its own switch in Settings > General under Scene Detection Method (`aiDepsStore.setGpuDecode` → `install_ai_pack` with `gpuDecode`), shown only while AI Scene Detection is on and installed; installing a pack leaves it as it is. Fresh installs start with every feature off; settings saved before the switches existed keep them on (`settingsStore` merge). Storage lists every byte: venv + uv Python, the CLI's `models` folder, and SigLIP 2 in the shared Hugging Face cache (counted, never deleted by the app).

11. **Dev builds never install AI**: `ai_env_status` reports `managed: false`, and `ensurePack`/`install_ai_pack` short-circuit in dev. AI runs from the CLI checkout's venv; install extras there with `pip install -e .[all]`. A `managed`-mode (production) build shows the real install dialog.

12. **Be sure to keep comments concise**: Use lowercase for all comments and they should all only be one line long. Only add comments where needed.

13. **Scene Scout databases are keyed by absolute path, never name**: `openedDatabase`, `deleteDatabase`, the "Search in" chips, and every `scout*` call pass `database.path`. The CLI's `db_path` sanitizes bare names (spaces become underscores), so passing a name like "My Series" would resolve to `My_Series.scoutdb`, a different file. Names are display-only labels (`displayNames[path]`); the row's open state compares with `samePath`, and `loadDatabases` dedupes the root listing against external paths by normalized path.

14. **Scene Scout in-memory daemon worker**: `scout_search` uses a persistent `amverge scout daemon` process when `keepModelInMemory` is enabled (default: true). Holds SigLIP 2 in CUDA VRAM for sub-50ms searches, automatically offloading to CPU after 300s of inactivity (`gpuStandby`), and terminated on app close via `kill_all_child_processes`.

15. **Scene Scout external databases & migrations**: Users can open external database files (`.scoutdb`, `.db`, `.scdb`) from anywhere via `scout_open_database`. Validates schema structure (`processed_videos`, `scene_embeddings`, `image_embeddings`), automatically migrates legacy schema versions (v0-v2 to v3) with `PRAGMA user_version = 3` for two-way compatibility with `scene-scout-dev`, and tracks external paths in `externalPaths` (persisted in `amverge.scenescout.v1`).

16. **Scene Scout video previews**: Search results are uncut scenes bounded by `[startSec, endSec]` inside the full source episode (`clip.database` set). On hover or a preview-all stagger turn, `useClipVideoSource` requests `ensure_scene_range_preview`, a short 480p x264 cut of just that range, and `LazyClip` plays it like any cut clip. The preview pane (`PreviewContainer`) plays the same cut, same height/crf so it shares the cache, never the source (a 10-bit HEVC MKV renders black). Never mount a `<video>` on the raw source for preview-all: one full-episode decoder per tile (often 10-bit HEVC MKV) freezes the app. Seeking into the source (`handleTimeUpdate`/`handleEnded`) is only a hover fallback when the range preview fails, and for home clips still mid-cut. WebP-mode episodes' clips also have `src` = the source with no cut, so `LazyClip`'s `isUncutScene` only applies in video-mode episodes and to scout results: without that gate every visible WebP tile mounted the full episode and the app crashed out of memory (`0xe0000008`). Closing the progress card while WebP previews are still encoding pauses that episode's WebP queue (`webpLoadingStore.pausedEpisodeId`, no new batches start); its episode row shows the resume button, and switching episodes clears the pause.

18. **CLI patch auto-update (AI env only)**: the AI env's `amverge` follows PyPI within the bundled CLI's major.minor (`deps/cli_update.rs`). New pack installs use `>=bundled,<next minor`; `update_ai_cli` upgrades in place on launch, stopping the scout daemon first and keeping installed packs. **A CLI release that changes the app contract (commands, flags, JSON, IPC events) must bump the minor version**, or installed apps pull it in automatically and break. The bundled sidecar (keyframe import, export) still only changes with an app update.

17. **Scene Scout first-visit layout**: until the first search *or flow* of an app session, both tabs render `SceneScoutHero` (logo, Add Episode, tabs, database picker, plus the search bar on the Search tab or `flow/FlowHeroClip`, a dashed "Input a file" bar the same size as the search bar, on the Flow tab). `heroDismissed` in `sceneScoutStore` is runtime only, never persisted, and shared by both tabs (`startFlowSearch` sets it too). The first search records the search bar's rect (`features/sceneScout/heroTransition.ts`) and the Search view slides its own bar from there on mount (`playHeroFlip`); picking a flow file just switches layouts. Search, Add Episode and database creation are shared pieces. Add Episode (`useAddEpisodes`) first offers home episodes on the left ("Import a pre-cut episode": their manifest scene times via `features/sceneScout/precutEpisodes.ts`, indexed against the original video, never the cached clips, so detection is skipped) and a file picker on the right ("Import a full episode", then the per-run scene detection popup, remembered in `settings.lastIndexDetection`, separate from the home import default); with no home episodes it goes straight to the picker. The shared pieces: `ScoutSearchField`, `useAddEpisodes`, `useCreateScoutDatabase`. The first time Scene Scout opens, `SceneScoutTour` walks through it step by step, highlighting `data-scout-tour` anchors (database buttons, All databases vs Searching, Import, search bar, tabs). It shows until finished or skipped (`sceneScoutTourSeen`, persisted in the UI store), and How to use replays it.

19. **Scene Scout motion tags and flow search** (experimental, `v2_flow_feature_test`; a video dropped on the Flow tab becomes its clip, anywhere else a drop imports into the Library): SigLIP sees one frame per scene (its first, or its midpoint if that's blank). Scenes indexed with CLI ≥ 1.2.0 have no motion data, since indexing no longer decodes scene ends; older databases and `amverge scout motion` still give hits `motion: {start, end}` tags (`ScoutHit.motion` → `ClipItem.motion`), shown only in the tile tooltip, hidden when absent. Motion never ranks or filters anything. Scene Scout has two tabs (`sceneScoutStore.mode`, `ScoutModeTabs`), each with its own results: **Search** (`results`, `runSearch`, search bar in `SceneScoutSearchView` above the grid) and **Flow** (`flowResults`, `runFlowSearch`). Once used, Flow renders `flow/SceneScoutFlowToolbar` + `flow/SceneScoutFlowView`: the inputted clip on top (`FlowPlayer`, previewed via `ensure_scene_range_preview` for ranges or `ensure_preview_proxy` for files, `useFlowPreviewSrc`) and the matches grid below; the regular preview pane stays, plays the clicked match and exports it exactly as on Search. Entry points: "Input a file" (Flow toolbar's import icon or the first-visit dashed bar, `features/sceneScout/pickFlowClip.ts`) and "Find flowing clips" (selection bar, one clip, Home or Scene Scout) → `startFlowSearch(FlowSource)` (the right-click entry always, and any entry with nothing in the Searching list, first opens `FlowDatabasePrompt`, mounted in App: a multi-select of databases that become the Searching list, then it runs. A text search with nothing selected opens the same prompt, `dbPrompt.kind` "search". `loadDatabases` drops Searching paths that no longer exist, which used to count but show nothing) → `scout_search` with `flowFrom` and no text: results ranked purely by SigLIP similarity to the clip's last frame (a blind round showed direction-ranked picks flowing less often than random, visually similar ones most often). Both searches show the "Loading SigLIP 2 model weights…" card through `withModelLoadingCard` when the model has to load. `flowSourceForClip` maps a grid clip to its file: a cut clip's `clipPath`, else `[startSec, endSec]` inside the source. All flow state is runtime only. Every Scene Scout toolbar (and an empty strip on the first-visit layout) is one `grid-toolbar` row, the same height as home's import row, so the preview pane never moves between pages; errors sit inline in that row.
