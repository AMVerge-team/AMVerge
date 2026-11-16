# AMVerge Mobile: Architecture and Implementation Plan

This document describes the technical plan for building the mobile version of AMVerge for Android and iOS. It covers media processing with Google Jetpack Media3, local storage with SQLite and Scoped Storage, and mobile touch UI patterns.

## 1. Overview

### Why the desktop codebase cannot run directly on mobile
* Process spawning restrictions: Desktop AMVerge starts Python (AMVerge-CLI) and FFmpeg using child processes (std::process::Command). Android and iOS security sandboxes do not allow running external command line executables inside an app package.
* FFmpegKit status: Earlier mobile video tools used the ffmpeg-kit library, but that project has been archived and is no longer maintained. It adds 40MB to 80MB to the app size and has issues with Android 15 16KB memory page requirements.
* Media3 solution: Android provides Jetpack Media3 (androidx.media3.transformer), which supports hardware transmuxing (copying video streams without re-encoding) using the device hardware codecs with minimal app size overhead.

## 2. Technology Stack

```
Frontend: React and TypeScript
- Clip grid, episode lists, and scenepack management
- Touch-based scrubbing hooks
- Mobile layouts and bottom sheets

Desktop and Mobile Shell: Tauri v2 (Rust)
- App lifecycle and window management
- SQLite database access using @tauri-apps/plugin-sql
- Android Storage Access Framework (SAF) URI handling

Native Media Engine: Kotlin and Jetpack Media3
- androidx.media3.transformer: Stream-copy video trimming
- androidx.media3.inspector: Fast keyframe thumbnail extraction
- TensorFlow Lite runtime: TransNetV2 shot transition detection
- Android MediaStore: Saving exported clips to the device gallery
- Android Share Sheet: Direct sharing to apps like CapCut, TikTok, and Instagram
```

## 3. Video Processing and Scene Detection

### A. Trimming clips without re-encoding
Media3 Transformer uses transmuxing (container-level stream copy) when no visual filters or effects are added. It cuts clips at keyframes in milliseconds without changing video quality or draining battery:

```kotlin
package com.amverge.media

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.Composition
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ExportException
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke

@TauriPlugin
class MediaProcessorPlugin(private val context: Context) : Plugin() {

    @Command
    fun cutClip(invoke: Invoke) {
        val inputPath = invoke.getString("inputUri") ?: return invoke.reject("Missing inputUri")
        val outputPath = invoke.getString("outputPath") ?: return invoke.reject("Missing outputPath")
        val startMs = invoke.getLong("startMs") ?: 0L
        val endMs = invoke.getLong("endMs") ?: return invoke.reject("Missing endMs")

        val mediaItem = MediaItem.fromUri(inputPath)
        val editedItem = EditedMediaItem.Builder(mediaItem)
            .setTrimStartMs(startMs)
            .setTrimEndMs(endMs)
            .build()

        val transformer = Transformer.Builder(context)
            .addListener(object : Transformer.Listener {
                override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                    invoke.resolve(mapOf("success" to true, "path" to outputPath))
                }
                override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
                    invoke.reject("Transmux failed: ${exportException.message}")
                }
            })
            .build()

        transformer.start(editedItem, outputPath)
    }
}
```

### B. Scene Detection Methods

#### Method 1: Keyframe Scanner (Fast default)
Reads the video container for sync keyframes (SAMPLE_FLAG_SYNC) using MediaExtractor:
* Reads packet timestamps from headers without decoding full video frames.
* Scans a typical 24-minute episode in about 2 to 3 seconds.
* Creates the initial list of scene cut points and clip durations.

#### Method 2: AI Scene Detection (TransNetV2 with TFLite)
Detects cuts that do not line up with keyframes:
1. Model format: The PyTorch TransNetV2 model is converted to a TensorFlow Lite model (transnetv2.tflite) using 16-bit float quantization (about 14MB).
2. Input resolution: TransNetV2 requires small 48 x 27 pixel RGB frames, so frame extraction and scaling require little memory.
3. Hardware acceleration: Runs on the mobile GPU or NPU using the TFLite GPU delegate or Android NNAPI.

## 4. Mobile UI and Layout

The desktop interface uses multiple columns, mouse hover states, and keyboard shortcuts. The mobile interface adapts these for touchscreens.

```
+-------------------------------------------------------------+
| PORTRAIT PHONE LAYOUT                                       |
+-------------------------------------------------------------+
| [Top Bar]  Episode Name (Dropdown)             [Select All] |
+-------------------------------------------------------------+
|                                                             |
|  +-----------------------+   +-----------------------+      |
|  | [x]           00:04.2 |   | [ ]           00:02.8 |      |
|  |                       |   |                       |      |
|  |    Clip Thumbnail     |   |    Clip Thumbnail     |      |
|  |   <-- Touch-Scrub --> |   |   <-- Touch-Scrub --> |      |
|  | 01:14 - 01:18         |   | 01:18 - 01:21         |      |
|  +-----------------------+   +-----------------------+      |
|                                                             |
|  (2-column virtualized grid using TanStack Virtual)         |
|                                                             |
+-------------------------------------------------------------+
| BOTTOM DOCK: [ 3 Selected (0:12) ]  [ Add Pack ] [ Export ] |
+-------------------------------------------------------------+
```

### A. Grid System
* Portrait phones (360px to 480px width):
  * 2-column grid for clear viewing of thumbnails.
  * Duration badge on the top right (example: 00:04.2).
  * Timestamp range on the bottom left (example: 01:24 - 01:28).
  * Selection circle on the top left.
* Landscape phones and tablets (768px width and above):
  * 3 to 5 columns depending on screen size.
  * Side drawer for episode folders and scenepack lists.

### B. Touch Scrubbing
Phones have no mouse hover state. To preview scenes quickly:
* Each clip has a 10-frame JPG sprite sheet.
* Moving a finger horizontally across a thumbnail scrubs through the frames.
* This allows quick checking of scene content without loading full video players.

### C. Multi-Selection
* Long press: Holding a clip selects it and turns on selection mode with slight haptic feedback.
* Drag to select: Once selection mode is active, dragging a finger across clips toggles selection in one motion.
* Visual state: Selected clips show an accent border and a subtle dark overlay.

### D. Bottom Action Dock
When one or more clips are selected, a bar appears at the bottom of the screen:
* Displays the selected clip count and total duration (example: 5 clips, 0:24).
* Quick action buttons: Add to Scenepack, Export to Gallery, and Share.

### E. Bottom Sheets
Replaces desktop modal popups for mobile screens:
* Half-height view: Quick selection of format and audio tracks.
* Full-height view: Detailed settings, tags, and AI detection options.
* Swipe down to close.

### F. Android Share Sheet
Instead of desktop export scripts:
* AMVerge Mobile uses the standard Android share sheet (Intent.ACTION_SEND_MULTIPLE).
* This allows sending cut clips directly into video editing apps like CapCut, Alight Motion, or social apps like TikTok and Instagram.

## 5. Storage and Permissions

Android uses Scoped Storage to manage file access:

| Storage Type | Location | Access Method | User Permission Needed | Usage in AMVerge Mobile |
|---|---|---|---|---|
| App Sandbox Cache | context.cacheDir and getExternalFilesDir() | Standard File I/O | None | Temporary clip cuts, thumbnail cache, SQLite database |
| User Media Library | MediaStore.Video (Movies/AMVerge/) | ContentResolver.insert() | None (Android 10+) | Final exported clips and scenepacks |
| Source Video Picking | Device storage or SD card | Storage Access Framework (SAF) | User picks file in system dialog | Reading full source episodes |

## 6. Implementation Steps

### Step 1: Initialize Tauri Mobile
```bash
cd frontend
npm run tauri android init
```
This creates the Android Studio project under src-tauri/gen/android.

### Step 2: Add Jetpack Media3 and TFLite dependencies
Add to app/build.gradle.kts:
```kotlin
dependencies {
    implementation("androidx.media3:media3-transformer:1.3.1")
    implementation("androidx.media3:media3-inspector-frame:1.3.1")
    implementation("androidx.media3:media3-common:1.3.1")
    implementation("org.tensorflow:tensorflow-lite:2.14.0")
    implementation("org.tensorflow:tensorflow-lite-gpu:2.14.0")
}
```

### Step 3: Implement Native Plugin
Create the Kotlin plugin (MediaProcessorPlugin.kt) with methods for cutClip, scanKeyframes, extractThumbnail, and exportToGallery.

### Step 4: Build Mobile Frontend Components
* Create the 2-column mobile grid component.
* Add the touch-scrubbing gesture hook.
* Add the bottom dock and expandable bottom sheets.
