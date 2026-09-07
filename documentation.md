# AMVerge Architecture

## Overview

AMVerge is a desktop app built for editors who need to quickly split videos into usable clips, preview scenes, and export selections without wasting time in a traditional editor.

The stack is:

- **Frontend:** React + TypeScript
- **Desktop App Runtime:** Tauri (Rust)
- **Backend Processing:** Python
- **Media Tools:** FFmpeg / FFprobe / PyAV

Each layer has a clear job. The frontend handles the UI, Rust bridges desktop features, and Python handles video processing.

---

# High Level Flow

```txt
React UI
   ↓
Tauri Commands (Rust)
   ↓
Python Backend
   ↓
FFmpeg / Filesystem
````

Example:

1. User imports a video
2. Frontend calls a Tauri command
3. Rust launches Python
4. Python processes the video and returns clip metadata
5. Frontend renders the clips

---

# Why It Uses Multiple Languages

## React + TypeScript

Used for the interface.

Good for:

* fast UI iteration
* reusable components
* state management
* responsive interactions

## Rust + Tauri

Used as the desktop bridge.

Good for:

* secure system access
* packaging desktop apps
* exposing native commands
* file access

## Python

Used for media workflows.

Good for:

* fast scripting
* FFmpeg orchestration
* video tooling
* easy iteration

---

# Frontend Structure


src/
├── App.tsx
├── pages/
├── hooks/
├── components/
├── styles/
├── types/
└── utils/


---

# Main Frontend Areas

## App.tsx

Main app entry.

Responsible for:

* top-level state
* page switching
* wiring components together
* global hooks

Most logic has been moved into hooks to keep this file readable.

---

## pages/

Contains screen-level pages.

Current examples:

* `HomePage.tsx`
* `Menu.tsx`

---

## hooks/

Shared app logic.

Examples:

* `useAppState.ts`
* `useImportExport.ts`
* `usePersistence.ts`
* `useDragDropImport.ts`
* `useHEVCSupport.ts`

Used to keep UI files cleaner.

---

## components/

UI modules split by responsibility.

### clipsGrid/

Main clip browser.

Handles:

* rendering scene clips
* hover previews
* lazy loading
* multi-select
* preview-all mode
* proxy generation for unsupported codecs

### previewPanel/

Focused preview + export controls.

Handles:

* selected clip preview
* export path
* merge selected clips
* export actions

### sidebar/

Navigation + project organization.

Handles:

* Home / Menu nav
* Episode Panel
* folders
* saved imports
* drag/drop organization
* rename / delete actions

---

# Sidebar Structure

```
sidebar/
├── Sidebar.tsx
├── SidebarNav.tsx
├── episodePanel/
│   ├── EpisodePanel.tsx
│   ├── EpisodePanelTree.tsx
│   ├── EpisodeRow.tsx
│   ├── FolderRow.tsx
│   ├── EpisodePanelHeader.tsx
│   ├── EpisodePanelModals.tsx
│   └── EpisodePanelContextMenus.tsx
└── hooks/
    ├── useEpisodePanelStructure.ts
    ├── useEpisodePanelMenus.ts
    └── useEpisodePanelDragDrop.ts
```

The sidebar was split up intentionally so the codebase stays maintainable as features grow.

---

# Backend Structure

The Python side is not a folder in this repo. It is a separate package,
[AMVerge-CLI](https://github.com/AMVerge-team/AMVerge-CLI), which the Rust layer
shells out to as a subprocess.

```
AMVerge-CLI/
└── amverge/
    ├── cli.py            Typer entry point (the `amverge` command)
    ├── pipeline.py       import pipeline: detect, cut, thumbnail
    ├── commands/         one module per CLI subcommand
    └── core/
        ├── detection/    keyframe + TransNetV2 scene detection
        ├── cutting/      smart cut, ffmpeg segment
        ├── export/       encode, remux, editor project files
        ├── codec/        probing, HEVC handling
        ├── depth/        depth maps
        ├── interpolation/ RIFE
        ├── deadframes/   duplicate frame trimming
        └── infra/        ffmpeg discovery, paths, process helpers
```

How the app finds it differs by build:

| Build | Resolves to |
| --- | --- |
| Dev (`tauri:dev`) | `<AMVERGE_CLI_DIR>/.venv/{Scripts,bin}/amverge` |
| Release | a PyInstaller sidecar bundled under the app's resources |

The dev path is why the setup script creates a virtualenv in the CLI checkout
rather than installing the package globally. See
`frontend/src-tauri/src/utils/sidecar.rs`.

---

# How Video Import Works

## Step 1

User imports a file.

## Step 2

Frontend calls Rust:

```ts
invoke("detect_scenes", ...)
```

## Step 3

Rust launches Python.

## Step 4

Python:

* reads video info
* finds keyframes
* splits clips
* generates thumbnails
* returns metadata

## Step 5

Frontend displays clips in the grid.

---

# Current Scene Splitting Approach

Older versions experimented with frame analysis and similarity detection.

The current version uses keyframes because it is much faster and more reliable in practice.

Workflow:

```txt
Read keyframes
→ Cut at keyframes
→ Generate previews
→ Let user merge if needed
```

This matches the actual goal of the product: helping editors move fast.

---

# Performance Notes

Most responsiveness comes from product decisions, not magic optimization.

Examples:

## Lazy Video Mounting

Videos only load when needed.

## Grid Preview Queueing

Preview-all mode avoids mounting everything at once.

## Metadata IPC

Only metadata is passed between frontend/backend, not raw video data.

## Keyframe Cutting

Avoids expensive re-encoding during import.

---

# Persistence

The app stores useful local state such as:

* imported episodes
* folders
* export directory
* panel organization

This makes reopening the app faster and smoother.

---

# If You’re Editing This Project

## Working on UI

Check:

* `components/`
* `pages/`

## Working on app state

Check:

* `hooks/`

## Working on scene splitting / exports

Check:

* the [AMVerge-CLI](https://github.com/AMVerge-team/AMVerge-CLI) checkout
* `src-tauri/src/commands/` (the Rust side that drives it)

## Working on sidebar behavior

Check:

* `components/sidebar/`

---

# General Code Style

The project is moving toward:

* smaller components
* hooks for logic
* typed props
* clear folder boundaries
* reusable modules

If adding something new, prefer extending an existing module before dumping logic into one large file.

---

# Summary

AMVerge is a desktop utility for fast clip extraction and previewing.

React handles the interface.
Rust handles desktop integration.
Python handles media processing.

Everything is structured around speed, usability, and keeping the workflow lightweight.