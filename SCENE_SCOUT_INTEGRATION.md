# Scene Scout Integration Guide

Scene Scout lets editors search across indexed anime/video episodes using natural-language queries (such as *"two characters arguing on a rooftop"*) or find visually matching shots from a reference clip (**Flow / Match**).

Rather than storing clips as separate video files, Scene Scout indexes scene timestamps and SigLIP 2 vector embeddings into portable SQLite database files (`.scoutdb`). This guide walks through how the feature works across the UI, Rust, and Python CLI layers so any contributor can follow or extend it.

---

## How the Layers Connect

```text
React UI (AMVerge)             Rust / Tauri Bridge           AMVerge-CLI (Python)
──────────────────             ───────────────────           ────────────────────
SceneScoutPage                 commands/scene_scout/         amverge scout ...
SceneScoutPanel       invoke   - passes --root path   spawn  - core/scenescout/
SceneScoutToolbar   ────────>  - manages daemon     ───────> - SQLite + SigLIP 2
sceneScoutStore                - streams progress            - JSON stdout / stderr
```

1. **The desktop app owns the storage location.** Rust always passes `--root` pointing to the user's configured storage folder so the CLI never has to guess where databases live.
2. **The CLI stays standalone.** If you run `amverge scout ...` directly in a terminal without `--root`, it falls back to its own OS data directory (`%APPDATA%/AMVerge/amverge-scene-scout` on Windows, `~/Library/Application Support/...` on macOS, `$XDG_DATA_HOME/...` on Linux).
3. **All communication uses JSON.** Commands like `databases`, `create`, `delete`, `videos`, and `search` print a single JSON object to stdout; `add` streams newline-delimited JSON progress updates so the UI can drive progress bars in real time.

---

## Indexing Pipeline

When you index a video into a Scene Scout database, four steps run in sequence inside `AMVerge-CLI`:

```text
detect_scenes(video, method)  ->  [(start_ms, end_ms), ...]        N scenes
sample_scene_frames(video)    ->  [uint8 (H, W, 3) RGB, ...]       N frames
embed_frames(frames)          ->  float32 (N, D), L2-normalised    N vectors
encode_thumbnail(frame)       ->  JPEG bytes                       N thumbnails
```

Every list stays the same length and order so each scene row lines up with the right timestamp, embedding, and thumbnail:

- **Scene detection matches library imports.** Indexing uses AMVerge's own `keyframe_detection` or `transnetv2_gpu` detectors (configured in Settings or picked per import). If `transnetv2_gpu` is selected without the `ml` pack installed, it falls back cleanly to `keyframe_detection`.
- **Frames stay in RGB.** PyAV and PIL output RGB, while OpenCV outputs BGR. Passing BGR frames into SigLIP 2 silently produces misaligned color embeddings, so frames are kept in RGB throughout sampling.
- **Embeddings are L2-normalised.** `search.py` scores matches with a dot product and treats that score as cosine similarity, which relies on unit-length vectors. Rows store a `model_version` tag so mismatched vector dimensions are safely skipped.

---

## SQLite Database Format (`.scoutdb`)

Databases live under `<storage root>/amverge-scene-scout/<Name>.scoutdb` (and users can also open external `.scoutdb` / `.db` / `.scdb` files from anywhere on disk, which are automatically migrated if needed).

Core tables:

```sql
processed_videos (id, filepath UNIQUE, modified_at, model_version, status)
scene_embeddings (id, video_id FK, scene_index, start_time_ms, end_time_ms,
                  embedding BLOB, thumbnail BLOB)
image_embeddings (filepath PK, modified_at, embedding BLOB, ...)
index_queue      (id, path UNIQUE, is_directory, recursive, added_at)
```

Because the schema matches the standalone `scene-scout` format, databases can be shared or moved between tools without conversion.

---

## How Search Results Plug Into the Clip Grid

AMVerge renders all clip grids—Home episodes, Scenepacks, and Scene Scout results—through one shared grid component (`ClipsContainer` / `LazyClip`). Instead of maintaining a separate grid implementation for Scene Scout, `frontend/src/features/sceneScout/hitToClip.ts` maps each search result into the app's standard clip record (`ClipItem` in `frontend/src/types/domain.ts`).

That mapping lets Scene Scout reuse the grid's virtualization, column sizing, multi-select, hover playback, preview-all queueing, and export bar automatically. A few conventions keep search results behaving properly inside that shared grid:

- **Source range instead of a pre-cut file:** A search hit points to the original video (`src`) plus `startSec` and `endSec` boundaries, leaving `clipPath` unset unless the episode was already cut into the Library. When a hit is hovered or previewed, `ensure_scene_range_preview` generates a small 480p H.264 clip of just that range (cached in an LRU 1 GB `scene_range_previews` folder) so raw 10-bit HEVC source files never stall the webview.
- **Separate preview cache namespace:** Each hit sets its `episodeId` via `scoutCacheId(database)` so generated animated WebPs are grouped under that database rather than mixed into whichever Home episode was open last.
- **Base64 thumbnails:** Database thumbnails are returned as base64 data URLs and loaded with `mediaSrc()`, rather than `convertFileSrc()` (which is only for local file paths).
- **Grid state restoration:** Entering `SceneScoutPage` saves the active Home grid selection and restores it when you leave.

---

## Storage Relocation & Daemon Lifecycle

- **Moving storage folders:** `OWNED_STORAGE_DIRS` in `frontend/src-tauri/src/utils/paths.rs` lists the folders AMVerge manages (`episodes_storage`, `scene_packs`, and `amverge-scene-scout`). Changing the storage location in Settings moves all three together without touching unrelated user files in the parent folder.
- **In-memory search daemon:** When *Keep model in memory* is enabled, `commands/scene_scout/worker.rs` keeps a persistent `amverge scout daemon` worker alive with SigLIP 2 loaded for fast repeat queries, offloads to CPU after inactivity, and shuts down cleanly when the app exits.
- **Library integration (`cutToLibrary`):** When enabled, importing a full episode through Scene Scout first imports it into a Library folder matching the database name, waits for the fast initial split, and indexes those exact scene boundaries.

---

## Testing Standalone from the Terminal

You can test the CLI side of Scene Scout directly without launching the desktop UI:

```bash
# Check model and environment status
amverge scout status

# Create a database and index an episode
amverge scout create "Test"
amverge scout add ./episode01.mkv --db "Test"
amverge scout videos "Test"

# Run a semantic search
amverge scout search "sunset over water" --db "Test" --json --top-k 5
```

Inside the app, Scene Scout requires the `scout` AI pack (managed in **Settings -> Features**). In development builds (`tauri:dev`), AI extras run directly out of your local `AMVerge-CLI` virtualenv.
