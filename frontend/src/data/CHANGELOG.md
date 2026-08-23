# v2.0.0-beta.2

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