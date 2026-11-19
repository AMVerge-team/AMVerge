# v2.0.3

- Added native Linux desktop support (`AppImage`, `.deb`, `.rpm`) with Linux sidecar/`uv`/FFmpeg packaging, GStreamer codecs, blob-URL preview streaming, WebKit DMA-BUF fallback, Linux file-manager & system-specs support, and dynamic OS labels across Settings & How to Use
- Added a dedicated **Storage** settings tab next to Export with Episodes & App/AI location pickers, a live breakdown across Episodes, Scenepacks, Scene Scout indexes, AI packages/models, and caches, plus safe cross-drive AI relocation (and defaulted new non-system installs to keep AI packages & models beside the install folder)
- Fixed **Free up space** on **Depth Map** not uninstalling `torchvision` (and stopped unrelated pack installs from pulling it in), and renamed **Depth Map Pass** / **Upscale Pass** to **Depth Map** and **Upscaling**
- Hardened storage relocation and **Clear Episode Storage** against same-path casing/trailing-slash self-overwrites, overlapping AI folders, Hugging Face symlink ordering, Windows file locks, and leftover partial episode folders
- Fixed storage moves leaving stale absolute paths in episode manifests, WebP sync metadata, Scene Scout database state/SQLite rows, and extension pointers; relocation is now staged with rollback protection and active-process guards, AI moves carry the full CLI config (including FFmpeg, presets, and model weights), and standalone CLI launches discover moved storage
- Added custom runtime/episodes discovery and manual fallbacks to the After Effects extension, with WebP-mode episode preview sync and source-range AE imports
- Added an AI install destination picker before the first download, plus automatic retries for transient Windows file-lock failures during UV package installs
- Fixed Scene Scout failing on incomplete SigLIP 2 caches by repairing missing snapshot files before model loading
- Fixed WebP companion `.jpg` posters capturing up to `0.5s` before the scene start (`-ss` now applies to both WebP and JPG outputs)
- Disabled the auto-updater during development runs, enabled RAM formatting on all platforms, and added a multi-platform downloads table to `README.md` and release workflows

## v2.0.2

- Added an interactive first-time Getting Started tour covering pages, detection/preview methods, Features, and a final wrap-up back in Library (replayable anytime from "How to use" in Library)
- Enabled the preview audio language selector in WebP mode so you can pick the export audio track
- Added "Show in episode" to Scene Scout's clip right-click menu to jump straight to that clip in Library
- Added Import video and Remove controls in the Tools viewer, and replaced the drop zone with clickable "isn't installed yet" install prompts when Upscaling or Depth Map packs aren't installed
- Made disabled Scenepacks and Scene Scout sidebar buttons clickable so clicking them prompts to enable or install the feature instead of being locked
- Replaced "Run in background" on feature installs with Minimize to the draggable floating card with a cancel button, and kept active installs running visibly if you click another dependency (with an option to keep or cancel the active install)
- Added an "Install all AI features" button in Settings › Features right below "Hide disabled features" (greyed out once all packs are installed)
- Kept AI Scene Detection visible and greyed out in Scene Detection Method even when disabled/hidden, opening the download prompt on click
- Fixed "Show end time" in Appearance so it works across Library and Scenepacks clips as well as Scene Scout, and enabled it by default
- Added "Show clip duration" in Appearance to display clip duration in the bottom-left corner on Library and Scene Scout
- Updated Credits to pull contributors dynamically from GitHub's `main` branch instead of a hardcoded list
- Fixed broken thumbnails on Requested / In-Review event cards and missing "Your event has been approved!" notifications on refresh/focus
- Updated bundled CLI runtime to `v1.3.3` (fixes Windows UTF-8 FFmpeg pipe crashes on WebP exports and a Scene Scout concurrent `AutoModel` import race on daemon startup)

## v2.0.1

- Fixed Windows V1 -> V2 upgrades deleting Start Menu and Desktop shortcuts so AMVerge stays visible in Start Menu Search
- Automatically restores missing Start Menu shortcuts when updating from v2.0.0

## v2.0.0

- Complete ground-up rebuild on the standalone `amverge` CLI engine for faster performance and lower memory usage
- Added AI Scene Detection (TransNetV2 with GPU acceleration) and a non-blocking background AI installer with live speed/ETA stats
- Added Scene Scout natural-language search across indexed episodes with opening/ending skip, library integration, and fast batched DB checks
- Added Scenepacks to collect and manage favorite clips across episodes
- Added Depth Maps export and post-export AI upscaling passes
- Added Exact-Copy & GPU smart merge exports with windowed keyframe checks, zero neighbor-scene bleed, live segment progress, and black-bar aspect fitting
- Raised hover previews to 15s animated WebP clips with JPG posters, bounded caches, and fixed V1 RAM buildup
- Redesigned UI chrome with animated icons, floating tooltips, AI/GPU navbar status badge, Discord Events/RPC, and Extension theme/cache sync
- Added universal macOS DMG support and automatic V1 -> V2 episode & settings migration

## v2.0.0-beta.2

- Added interactive Show in Folder button on episode items with rounded border styling
- Added Show in File Explorer option to the episode right-click context menu
- Added dedicated Show in Folder button to the Episode Panel top toolbar
- Fixed Windows File Explorer reveal commands for paths with extended UNC prefixes
- Added non-blocking background AI downloads with a minimized task bar widget
- Added real-time transfer speed, downloaded bytes, elapsed timer, and ETA statistics to the AI installer
- Configured concurrent download throughput optimization for uv package installation
- Added AI Detection and GPU status pill badge in the top navigation bar
- Added live clip selection counter and active episode breadcrumb in navbar
- Added modern pill-style window control buttons (minimize, maximize, close)
- Replaced native browser tooltips across the app with collision-aware custom floating tooltips
- Redesigned Menu tabs (About, Credits, Console, Update Logs, Bug Report) with vector icons and unified layout
- Redesigned Bug Report form with 2-column card layout and streamlined dropdown selection
- Added log severity filters and search bar to the Console tab
- Added collapsible release accordion cards to Update Logs
- Added contributor avatars and profile links in Credits

## v2.0.0-beta.1

- Complete recode of the app backend into a standalone CLI for better performance and memory management
- Added AI Scene detection (TransNetV2, ~90% accuracy)
- Added Depth maps export
- Added Dead frames removal + RIFE frame interpolation passes
- Added Scenepack feature to collect favorite clips into custom packs
- Added WebP animated previews in the grid for huge performance gains on all PCs
- Fixed memory build-up bug from V1 where clips accumulated in RAM
- Smoother and more optimized UI rendering
- Added Esc keybind navigation for menu and overlays

## v1.2.1
- Fixed hovered videos sometimes not displaying full clip content

## v1.2.0
- Added audio stream change for previewing
- Added an "Update Available!" notification in case the download button doesn't work on update notification
- Potentially fixed major issue with the app having a soft limit on its storage (if this is still an issue, please let me know)
- Fixed timeline click not working
- Fixed audio toggle resetting video
- Fixed intel macs not importing episodes properly

## v1.0.0
- Now supports mac

- Backend now merges clips that have similar thumbnails together. This should help with videos that cut weirdly

- Added export settings
  - You can now select profiles to adjust various export settings
  - Profiles have customizable icons (more customizability!)

- Added quick download buttons to clips
  - Download individual clips directly from the grid
  - Useful when you only need a few clips instead of exporting everything
  - This can be toggled in Appearance settings

- Added audio hover
  - Hovering over clips now plays audio
  - Makes it easier to find specific voice lines or sound effects

- Added Discord Rich Presence support
  - AMVerge now shows on your Discord status while you're using it

- General settings improvements
  - Added a new "General" section in Settings
  - You can now change where episodes are stored
  - Added option to reset all settings back to default

- Appearance settings updates
  - Background image improvements:
    - Now supports GIFs and more file formats
    - Includes a built-in cropper/editor for better control
    - Adjustable opacity and blur
  - Color system updates:
    - Accent color slider now automatically adjusts background color
    - Updated color slider UI to match the rest of the app
  - Can now toggle "Widescreen clip tiles" to have clips grid in 1920x1080 aspect ratio
  - Can now toggle "Show clip timestamps" to have the clip timestamps on the grid

- UI updates
  - Redesigned export interface
  - Sidebar buttons are now icon-based instead of text

- QOL
  - Added video length the video in the preview panel (next to the time bar)
  - Automatically opens location where video was exported after export (toggleable in export settings)
  - Export Now button is now disabled/faded when no clips are selected.
  - Now loads the last selected episode on startup
- Patches
  - Fixed issue where large video files wouldn't import
  - Fixed issue where 4K+ images could turn white on import