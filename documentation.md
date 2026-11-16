# AMVerge Architecture Guide

AMVerge is a desktop utility built for video editors who want to split long footage into usable clips, search scenes visually or by description, organize scenepacks, and export or import straight into editing software.

This guide gives a clear walkthrough of how the project is structured so anyone opening the repo for the first time can find their way around.

---

## Tech Stack

| Layer | Technology | Role |
| --- | --- | --- |
| UI | React 19 + TypeScript + Zustand | Pages, virtualized clip grid, previews, state & settings |
| Desktop shell | Tauri v2 (Rust) | Native dialogs, filesystem access, child-process management, FFmpeg & CLI orchestration |
| Media backend | [AMVerge-CLI](https://github.com/AMVerge-team/AMVerge-CLI) (Python) | Scene detection, clip cutting, exporting, Scene Scout indexing/search, AI passes |
| Media tools | FFmpeg / FFprobe / PyAV | Codec probing, frame extraction, proxy transcodes, WebP previews |

```text
React Frontend (frontend/src/)
       │  Tauri invoke() / listen()
       ▼
Rust Core (frontend/src-tauri/src/)
       ├──► AMVerge-CLI (Python subprocess / sidecar)
       └──► FFmpeg / FFprobe (bundled binaries)
```

---

## How the Codebase Is Organized

### Frontend (`frontend/src/`)

- **`pages/`** — Top-level screens:
  - `HomePage.tsx` — Preview pane and clip grid for imported episodes
  - `SceneScoutPage.tsx` — Semantic text search and Flow / Match visual search
  - `ScenepacksPage.tsx` — Custom curated clip collections
  - `EventsPage.tsx` — Community editing events feed and submissions
  - `Menu.tsx` — Tools (standalone depth/upscale), Patch Notes, Console, Bug Report, About
  - `Settings.tsx` — General, Appearance, Features/AI packs, Model weights, Export profiles
- **`components/`** — Modular UI organized by area:
  - `clipsGrid/` — Virtualized clip tiles, hover/grid playback, multi-selection, WebP & proxy queues
  - `previewPanel/` — Focused video preview player and export bar
  - `sidebar/` — App navigation, `episodePanel/` tree (folders, sorting, drag-and-drop), and `scenepacks/` panel
  - `sceneScout/` — Database sidebar, search/flow toolbars, guided tour, and add-episode modals
  - `tools/` — Side-by-side preview and controls for standalone Upscale and Depth passes
  - `settings/` — Settings panels and export profile editors
- **`features/`** — Domain workflows kept outside React components (`import/`, `export/`, `sceneScout/`, `tools/`, `storage/`, `migration/`, `aiDeps/`, `processes/`).
- **`stores/`** — Zustand stores separating persisted user data (IndexedDB for episodes, localStorage for settings/themes) from runtime state (grid loading, progress, preview caches).
- **`hooks/`** — Shared lifecycle and action hooks (`useImportPipeline`, `useExport`, `useDragDropImport`, `useHEVCSupport`, `useDiscordAuth`, `useDiscordRPC`, etc.).

### Rust / Tauri Core (`frontend/src-tauri/src/`)

- **`main.rs`** — App bootstrap, plugin setup (`shell`, `dialog`, `updater`), managed state, command registration, and child-process cleanup on exit.
- **`commands/`** — Frontend-callable handlers split by domain (`scenes.rs`, `scene_resume.rs`, `export/`, `tools.rs`, `scene_scout/`, `scenepacks.rs`, `preview/`, `deps/`, `models.rs`, `editor_import/`, `settings.rs`, `cache.rs`, `migration.rs`, `auth.rs`, `discord/`, `events.rs`, `notifications.rs`, `bug_report.rs`).
- **`utils/`** — Sidecar resolution (`sidecar.rs`), FFmpeg discovery (`ffmpeg.rs`), Windows Job-Object & process-tree termination (`process.rs`), storage paths (`paths.rs`), and logging.

### Python Backend (`AMVerge-CLI`)

`AMVerge-CLI` lives in a sibling repository rather than inside this folder:

- In **development (`npm run tauri:dev`)**, Rust executes `<AMVERGE_CLI_DIR>/.venv/{Scripts,bin}/amverge`.
- In **release builds (`npm run tauri:build`)**, `frontend/scripts/build-sidecar.mjs` packages the published CLI into a PyInstaller sidecar alongside `ffmpeg` and `ffprobe`.

---

## Core Workflows

### 1. Importing & Scene Splitting

1. A user drops a video or clicks Import on `HomePage`.
2. `useImportPipeline` claims the active process lock and calls `detect_scenes` in Rust.
3. Rust spawns `amverge backend <video> <outdir> <method> <importMethod>`:
   - **Keyframe Detection** splits directly on source keyframes via stream copy (zero re-encoding).
   - **AI Scene Detection (`TransNetV2`)** detects shot boundaries on GPU (with CPU fallback), stream-copies scenes aligned to closed keyframes, and queues remaining re-encodes through the background resume queue (`scene_resume.rs`).
4. As the CLI prints line-delimited progress and scene events to `stderr`, Rust forwards them as Tauri events (`initial_clips_ready`, `clip_ready`, `thumbnail_ready`, `scene_progress`), populating the grid before the full job finishes.

### 2. Previewing Clips Smoothly

Mounting dozens of full-resolution `<video>` elements at once—especially 10-bit HEVC MKV files—stalls browsers and GPUs. AMVerge avoids this in three ways:

- **Viewport virtualization & staggered mounting:** Only visible tiles mount active players, and Preview All mounts them incrementally.
- **Animated WebP & companion thumbnails:** Hovering or scrolling shows lightweight thumbnails or cached 240p animated WebPs (`preview/scene_webp.rs`).
- **On-demand H.264 proxies:** When a codec isn't natively playable in the webview (checked via `check_video_codec`), `ensure_preview_proxy` or `ensure_scene_range_preview` transcodes a lightweight 480p H.264 preview using per-path locks to prevent duplicate work.

### 3. Exporting & Editor Handoff

- **Clip export (`export_clips`):** Supports remuxing (exact-copy stream copy with automatic re-encode only for non-keyframe cuts), full re-encoding across H.264/H.265/AV1/ProRes/CineForm/DNxHR with hardware encoder probing (`NVENC`, `AMF`, `QSV`, `VideoToolbox`, `VAAPI`), and optional post-export Depth or Upscale passes.
- **Editor import (`editor_import/`):** Sends selected clips directly into After Effects, Premiere Pro, DaVinci Resolve, or CapCut.

---

## Where to Start Making Changes

- **UI layout, grid tiles, or sidebar behavior:** `frontend/src/components/` and `frontend/src/pages/`
- **Import, export, or Scene Scout state logic:** `frontend/src/features/` and `frontend/src/stores/`
- **Desktop commands, FFmpeg calls, or sidecar orchestration:** `frontend/src-tauri/src/commands/`
- **Video detection, cutting, embeddings, or encoding algorithms:** the sibling `AMVerge-CLI` repository
