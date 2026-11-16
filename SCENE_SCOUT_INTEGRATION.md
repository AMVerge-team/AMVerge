# Scene Scout integration

Scene Scout connects AMVerge V2's React UI and Rust Tauri commands to `AMVerge-CLI`'s SQLite + SigLIP 2 vector search and indexing backend. This document covers the cross-layer architecture, storage layout, and JSON/IPC contract.

---

## Integration shape

```
AMVerge V2 (React)                AMVerge V2 (Rust)              AMVerge-CLI (Python)
────────────────────              ─────────────────              ────────────────────
SceneScoutPage                    scene_scout/                   amverge scout ...
SceneScoutToolbar        invoke   - resolves --root      spawn   - core/scenescout/
SceneScoutPanel        ────────►  - parses JSON        ────────► - SQLite + SigLIP 2
sceneScoutStore                   - streams progress             - JSON on --json
```

The app owns the storage location, the CLI is told about it. Every command takes `--root`, and Rust always passes it (the AMVerge src-tauri folder). The CLI never guesses where the app put things, and the app never needs to know how a database is laid out.

That is also what keeps the CLI standalone. Omit `--root` and it falls back to
its own default under the user's data directory, so `amverge scout` is a
complete tool on its own with no AMVerge install involved.

---

## CLI status

The Scene Scout storage layout, path resolution, SQLite schema (including migrations), SigLIP 2 embedding/indexing pipeline, persistent daemon worker (`amverge scout daemon`), and similarity/flow search are implemented in `AMVerge-CLI` and wired end-to-end in AMVerge V2.

Standalone inspection commands:

```bash
amverge scout status
amverge scout create "My Series"
amverge scout databases
amverge scout videos "My Series"
amverge scout delete "My Series"
```

Inside the app, `SceneScoutPage` supports text search, **Flow / Match** visual similarity search (`flowFrom`), external `.scoutdb` opening/migration, `cutToLibrary` episode import integration, and 480p range preview caching (`ensure_scene_range_preview`).

### Indexing data pipeline

```
detect_scenes(video, method)  ->  [(start_ms, end_ms), ...]        N scenes
sample_frames(video, scenes)  ->  [uint8 (H, W, 3) RGB, ...]       N frames
embed_frames(frames)          ->  float32 (N, D), rows normalised  N vectors
encode_thumbnail(frame)       ->  JPEG bytes                       N thumbnails
```

All four stay the same length and order so `index_video` keeps scene rows aligned:

- **Frames must be RGB** (PyAV / PIL give RGB; OpenCV BGR embeds against swapped channels).
- **Embeddings must be L2-normalised.** `search.py` scores with a dot product and
  reads it as cosine similarity, which is only true for unit vectors.
- **`embed_text` and `embed_frames` must return the same `D`.** If they differ,
  `search.py` treats every row as a version mismatch and skips it, so searches
  return nothing with no error shown anywhere.

### Testing the two halves separately

You do not have to finish both before you can check either one.

Embedding, on its own, in a REPL:

```python
from amverge.core.scenescout import embedding
v = embedding.embed_text("a girl standing in the rain")
print(v.shape, v.dtype, (v ** 2).sum())   # (D,) float32, and ~1.0 if normalised
```

Indexing, once embedding works:

```bash
amverge scout create "Test"
amverge scout add ./episode01.mkv --db "Test"
amverge scout videos "Test"                       # should show the scene count
amverge scout search "whatever is in that episode" --db "Test"
```

That last search is the real end-to-end check, and it needs no AMVerge build at
all. Once it returns sensible results from the terminal, the app will too,
because the app runs exactly those commands.

---

## AMVerge-CLI

### Layout

```
amverge/
├── commands/scenescout/
│   ├── __init__.py
│   └── scout.py            Typer sub-app: the `amverge scout ...` verbs
└── core/scenescout/
    ├── __init__.py
    ├── paths.py            where databases live
    ├── types.py            SceneHit, DatabaseInfo, SearchOptions
    ├── db.py               SQLite schema and CRUD
    ├── search.py           similarity search
    ├── embedding.py        SigLIP 2 text/image/frame embeddings
    └── indexing.py         video → scenes → embeddings
```

Registered in `amverge/cli.py` as `app.add_typer(scout)`.

### Layering rule

Import torch and transformers lazily, inside functions. `paths`, `types`,
`db` and `search` are pure stdlib plus numpy, so listing databases and reporting
status work on a machine that has never installed the AI extra. A module-level
`import torch` in any of them makes the whole CLI unusable without it, including
`--help`.

`embedding.is_available()` is the cheap probe the status command uses.

### Storage

```
<storage root>/amverge-scene-scout/
├── My Series.scoutdb
└── Another Series.scoutdb
```

Resolution order, highest wins:

1. `--root` on the command line
2. `AMVERGE_SCENE_SCOUT_DIR` in the environment
3. the standalone default (`%APPDATA%/AMVerge/amverge-scene-scout` on Windows,
   `~/Library/Application Support/...` on macOS, `$XDG_DATA_HOME/...` on Linux)

The folder name is duplicated in exactly two places, and they must not drift:

- `amverge/core/scenescout/paths.py` → `STORAGE_DIR_NAME`
- `frontend/src-tauri/src/utils/paths.rs` → `SCENE_SCOUT_DIR_NAME`

### Schema

Deliberately identical to upstream, so a database opens in either tool. Keep it
that way: diverging means a user's existing databases stop working when they
move between the standalone app and AMVerge.

```sql
processed_videos (id, filepath UNIQUE, modified_at, model_version, status)
scene_embeddings (id, video_id FK, scene_index, start_time_ms, end_time_ms,
                  embedding BLOB, thumbnail BLOB)
image_embeddings (filepath PK, modified_at, embedding BLOB, ...)
index_queue      (id, path UNIQUE, is_directory, recursive, added_at)
```

Embeddings are raw float32 bytes, L2-normalised. `search.py` scores with a plain
dot product and reads it as cosine similarity, so an unnormalised vector
produces silently wrong rankings rather than an error. Rows carry
`model_version`; a row whose vector length does not match the query is skipped
rather than compared.

### Standalone use

```bash
# index an episode
amverge scout add ./episode01.mkv --db "My Series"

# search it
amverge scout search "two characters arguing on a rooftop" --db "My Series"

# machine-readable, for scripting
amverge scout search "sunset over water" --json --top-k 5
```

No `--root` anywhere, so it uses its own default. Nothing about this path
involves AMVerge.

### JSON contract

`--json` is the app's entire integration surface.

Single-document commands (`databases`, `create`, `delete`, `videos`, `search`,
`status`) print one compact object on stdout.

`add` is different: it prints **newline-delimited** objects, progress first and
a terminator last.

```json
{"stage":"detecting","done":0,"total":1}
{"stage":"embedding","done":40,"total":120}
{"done":true,"scenes":120,"video":"C:/media/ep01.mkv"}
```

Indexing an episode takes minutes, so the app reads line by line and drives a
real progress bar. A single document at the end would be a progress bar that
only fills once the work is over.

Errors surface as `{"error": "..."}` with a non-zero exit code.

---

## AMVerge V2

### Layout

```
frontend/src/
├── features/sceneScout/
│   ├── types.ts            wire types, mirroring the Rust structs
│   ├── api.ts              invoke wrappers
│   └── hitToClip.ts        ScoutHit → ClipItem
├── stores/sceneScoutStore.ts
├── components/sceneScout/
│   ├── SceneScoutPanel.tsx    sidebar: databases, indexed videos
│   └── SceneScoutToolbar.tsx  Add Episode, search bar, settings dropdown
├── pages/SceneScoutPage.tsx
└── styles/sceneScout.css

frontend/src-tauri/src/commands/scene_scout/
```

Everything Scene Scout owns is under a `sceneScout` folder in each layer.

### Why results are ClipItems

`hitToClip.ts` is the file to read first.

Scene Scout has no grid of its own. A search gives back time ranges inside source videos, and each one is turned into a `ClipItem` and dropped into the app store. From there the normal `ClipsContainer` and `LazyClip` draw it, the same way the Scenepacks page works.

That is the whole reason preview-all, hover playback, preview speed, clip timestamps, the download button and the columns slider already work here. None of them have any Scene Scout code behind them.

A result is shaped like a WebP-mode clip. `src` is the source video, and`startSec` and `endSec` mark the scene inside it.

Three details make that work. Each one looks harmless to change, so they are worth knowing before you touch this file:

**Set `episodeId` to `scoutCacheId(database)`.**
This is the key for the animated preview cache. If you leave it out, `buildWebpJob` uses whichever episode happens to be open instead, and Scene Scout previews get written into that episode's folder.

**Leave `clipPath` unset.**
Setting it switches the tile to video mode. Video mode expects a pre-cut file, which Scene Scout never makes, and it plays from the start of the video rather than from the scene.

**Thumbnails come back as base64, not file paths.**
Use `mediaSrc()` for them, not `convertFileSrc()`. `convertFileSrc()` turns a `data:` URL into a path that points at nothing, so every tile goes blank.

One related thing worth knowing: `ClipsContainer` sets `episodeVideoPreview = false` for this page on purpose. It could have worked that out on its own from there being no open episode, but saying it outright means a single result carrying a `clipPath` cannot flip the whole grid into video mode by accident.

Last thing: the grid is shared with the episode pages, so `SceneScoutPage` saves what was in it on the way in and puts it back on the way out. Without that, leaving Scene Scout would blank the Home grid.

### Storage relocation

`amverge-scene-scout/` sits beside `episodes_storage/` and `scene_packs/` under the storage root the user picks in Settings.

`utils/paths.rs` has a list called `OWNED_STORAGE_DIRS` naming every folder the app owns under that root. `move_storage_to_new_dir` in `commands/settings.rs` walks that list, so all three kinds of storage follow the user when they change the location. If you ever add a fourth kind, put its name in that list and the move picks it up on its own.

This is already done and needs nothing from you. Worth knowing about for two reasons though.

The first is that it used to be broken. The command was called `move_episodes_to_new_dir` and only ever moved `episodes_storage/`, so scene packs were being left behind whenever someone changed their storage location. Scene Scout databases would have been left behind the same way. It is fixed now, but if you see the old name anywhere it is out of date.

The second is that the move is a whitelist on purpose, and it should stay one. The storage root is a folder the user picks themselves, and they often keep their own unrelated files in it. Moving everything under that folder would drag their stuff along with ours.

---

## Detector dispatch & preview cache notes

### The AI pack

Scene Scout is an installable pack, registered in the `scout` extra in `pyproject.toml`, `Pack { id: "scout" }` in `deps/packs.rs`, and `AI_PACKS.scout` in `features/aiDeps/packs.ts`.

### Preview cache notes

Animated previews for results are generated into `episodes_storage/scoutcache_<database>/scenes/`, reusing the episode preview machinery, while hovered/played video ranges use `ensure_scene_range_preview` in the LRU-pruned `scene_range_previews` cache (capped at 1 GB).

### Which scene detector to use

Scene Scout uses AMVerge's own detectors so indexed boundaries line up with imported library cuts. Indexing follows whatever detector the user picked in Settings (or per-run in the Add Episode prompt):

| Setting | Use | Module |
| --- | --- | --- |
| AI Scene Detection | `transnetv2_gpu` | `amverge.core.detection.ai_scene_detection`, via `decode_and_detect_scenes` |
| Keyframe Detection | `keyframe_detection` | `amverge.core.detection.keyframe`, via `detect_scenes_by_keyframe` |

If `transnetv2_gpu` is selected when the `ml` pack is not installed (or an unrecognised detector is passed), `detect_scenes` falls back to `keyframe_detection`. Timestamps are converted from seconds to integer milliseconds `(start_ms, end_ms)` to match the SQLite schema.
