# Scene Scout integration

I created the commands of the feature like the database creation, deletion, etc (basically the design aspects), but I left the frame sampling, scene detection, model loading open since those things I'm kinda unsure of on how to do. This document outlines in detail what's already finished, and what needs to be done.

---

## Integration shape

```
AMVerge V2 (React)                AMVerge V2 (Rust)              AMVerge-CLI (Python)
────────────────────              ─────────────────              ────────────────────
SceneScoutPage                    scene_scout.rs                 amverge scout ...
SceneScoutToolbar        invoke   - resolves --root      spawn   - core/scenescout/
SceneScoutPanel        ────────►  - parses JSON        ────────► - SQLite + SigLIP 2
sceneScoutStore                   - streams progress             - JSON on --json
```

The app owns the storage location, the CLI is told about it. Every command takes `--root`, and Rust always passes it (the AMVerge src-tauri folder). The CLI never guesses where the app put things, and the app never needs to know how a database is laid out.

That is also what keeps the CLI standalone. Omit `--root` and it falls back to
its own default under the user's data directory, so `amverge scout` is a
complete tool on its own with no AMVerge install involved.

---

## What already works

Feel free to run these:

```bash
amverge scout status
amverge scout create "My Series"
amverge scout databases
amverge scout videos "My Series"
amverge scout delete "My Series"
```

Everything above is finished: storage layout, path resolution, the SQLite
schema, database lifecycle, listing, and the JSON contract. Search scoring is
finished too. `--json` on any of them emits exactly what the Rust layer parses. If there's anything you need to change with the existing stuff I have to make things work, feel free.

Inside the app itself, the sidebar button, the page, the panel, the search bar, the
settings dropdown, the store, and the Rust commands are all wired and compile.
The grid renders results through the ordinary clip grid once the logic in the CLI are in and connected

## What needs to be done

Two files, both raising `NotImplementedError` with a pointer to the upstream
source:

| File | Port from | What it needs |
| --- | --- | --- |
| `amverge/core/scenescout/embedding.py` | `src/model_loader.py`, `src/processing.py` | load SigLIP 2, embed text / images / frames |
| `amverge/core/scenescout/indexing.py` | `src/processing.py` | scene detection, frame sampling |

Nothing else is a stub. Fill those in and the feature works end to end.

### The data, start to finish

Only four functions matter, and they hand results straight to each other:

```
detect_scenes(video, method)  ->  [(start_ms, end_ms), ...]        N scenes
sample_frames(video, scenes)  ->  [uint8 (H, W, 3) RGB, ...]       N frames
embed_frames(frames)          ->  float32 (N, D), rows normalised  N vectors
encode_thumbnail(frame)       ->  JPEG bytes                       N thumbnails
```

All four stay the same length and the same order. `index_video` zips them
together and writes one database row per scene, so a single dropped frame shifts
every scene after it onto the wrong timestamp and nothing catches it.

`index_video` is already written. It does all the database work, so read it
first to see exactly what it expects back from you.

Three details that produce a working-looking system that returns nonsense, which
is worse than a crash:

- **Frames must be RGB.** PyAV and PIL give RGB. OpenCV gives BGR. Embedding BGR
  still produces vectors and still ranks them, just against the wrong colours.
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
    ├── paths.py            where databases live                    DONE
    ├── types.py            SceneHit, DatabaseInfo, SearchOptions   DONE
    ├── db.py               SQLite schema and CRUD                  DONE
    ├── search.py           similarity search                       DONE
    ├── embedding.py        SigLIP 2                                STUB
    └── indexing.py         video → scenes → embeddings             STUB
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

frontend/src-tauri/src/commands/scene_scout.rs
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

## Task list

**CLI**

1. Port `embedding.py` from `src/model_loader.py` and `src/processing.py`.
   Keep the lazy imports. Return L2-normalised float32.
2. Port `indexing.py`'s `detect_scenes` and `sample_frames`.
   - `detect_scenes` dispatches on the user's Settings choice, see below.
   - `sample_frames` should use PyAV, which both projects already depend on.
**App**

3. Reveal-in-explorer and rename on the panel's context menu, mirroring
   `components/sidebar/episodePanel/`.
4. Decide whether Scene Scout gets a Settings toggle like Scenepacks
   (`scenepacksEnabled`). Given it needs a multi-GB model, defaulting it off is
   probably right.
5. Check the pack size estimate. `AI_PACKS.scout.extraSizeMb` is a guess at
   900 MB for transformers plus the SigLIP 2 weights; measure a real install
   and correct it, since it is what the download confirmation shows.

### The AI pack

Scene Scout is an installable pack, registered in all three places the install
chain reads: the `scout` extra in `pyproject.toml`, `Pack { id: "scout" }` in
`deps/packs.rs`, and `AI_PACKS.scout` in `features/aiDeps/packs.ts`. It is in
`VISIBLE_PACK_IDS`, so it appears in Settings > Dependencies.

Both entry points call `ensurePack("scout")` first, so a user without the model
gets the install prompt rather than a failure several seconds into a search.

### A note on the preview cache

Animated previews for results are generated into
`episodes_storage/scoutcache_<database>/scenes/`, reusing the episode preview
machinery. Those folders carry no `manifest.json`, so `is_episode_cache_dir`
does not claim them and a storage relocation leaves them behind. That is
harmless (they regenerate on demand) but it does leave stale folders in the old
location. Worth tidying if it ever becomes noticeable.

**Which scene detector to use**

Use AMVerge's own detectors. Do not port PySceneDetect from upstream.

The reason is that Scene Scout should find the same cuts that importing the episode would find. If it uses its own detector, a search result points at a scene boundary the user has never seen and cannot line up with anything in their grid.

Which detector runs follows whatever the user picked in Settings under scene detection. There is no separate Scene Scout setting for this:

| Setting | Use | Module |
| --- | --- | --- |
| AI Scene Detection | `transnetv2_gpu` | `amverge.core.detection.ai_scene_detection`, via `decode_and_detect_scenes` |
| Keyframe Detection | `keyframe_detection` | `amverge.core.detection.keyframe`, via `detect_scenes_by_keyframe` |

The plumbing for this is already done. The setting is read in `sceneScoutStore.addVideo`, passed to Rust, and reaches the CLI as `amverge scout add --detector <value>`. It arrives in `detect_scenes` as the `method` argument, using the same spelling the app uses, so nothing has to be translated on the way. All you have to write is the branch inside `detect_scenes` that calls the right module.

Two things to handle in that branch:

**Fall back to keyframe** for an unrecognised value, and also when `transnetv2_gpu` is selected but the `ml` pack turns out not to be installed. Indexing should still work in that case rather than fail, since keyframe detection needs nothing extra.

**Convert to milliseconds.** Both AMVerge detectors work in seconds, but `detect_scenes` returns `(start_ms, end_ms)` because that is what the database columns hold and what the upstream schema expects.

---

## Verified so far

- `amverge scout status | create | databases | videos | delete` run, in both table and `--json` form
- `create` → `databases` → `delete` round-trips against a temp `--root`
- `search` with no model returns `{"results":[],"error":...}` and exit 1, rather than a traceback
- The CLI core imports with no torch installed
- `cargo check` clean, `tsc --noEmit` clean, `vite build` clean

Not verified, because it needs the stubs: indexing a real video, any search that returns actual results, and therefore the grid rendering path end to end. The three constraints listed under *Why results are ClipItems* were traced through the code rather than observed running, so they are the first thing to check once indexing works.
