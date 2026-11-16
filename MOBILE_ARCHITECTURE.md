# AMVerge Mobile: Architecture & Implementation Blueprint

This document details the modern, production-grade approach to building **AMVerge Mobile** (Android & iOS), incorporating native platform media capabilities (Google Jetpack Media3, Scoped Storage, Tauri v2 Mobile) and touch-first responsive UI/UX patterns.

---

## 1. Executive Summary & Critical Insights

### Why the Desktop Architecture Cannot Be Ported As-Is
* **Process Spawning Restriction**: Desktop AMVerge invokes Python (`AMVerge-CLI`) and FFmpeg via `std::process::Command`. Android and iOS sandboxes strictly prohibit spawning arbitrary CLI executables inside APKs.
* **The FFmpegKit Trap**: While older mobile apps used `arthenica/ffmpeg-kit`, **FFmpegKit was officially archived and deprecated**. It adds 40–80MB of bloat, lacks updates, and fails modern Android 15+ 16KB memory page requirements.
* **The Modern Solution**: Google's official **Jetpack Media3 (`androidx.media3.transformer`)** provides native, hardware-accelerated **transmuxing (lossless zero-re-encoding stream-copying)** with zero binary bloat.

---

## 2. Core Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│                 FRONTEND (React 19 + TypeScript)            │
│  • Reuses 80%+ of AMVerge Desktop UI components & styles    │
│  • Zustand stores for clip selection, episodes & scenepacks │
│  • Touch-scrub gesture hooks (replacing desktop hover)      │
│  • Responsive mobile grid & expandable bottom sheets        │
└──────────────────────────────┬──────────────────────────────┘
                               │  Tauri IPC (invoke)
┌──────────────────────────────▼──────────────────────────────┐
│                  TAURI v2 MOBILE (Rust Bridge)              │
│  • Cross-platform lifecycle & windowing                     │
│  • SQLite database management via @tauri-apps/plugin-sql    │
│  • Android SAF (Storage Access Framework) URI translation   │
└──────────────────────────────┬──────────────────────────────┘
                               │  JNI Plugin Channel
┌──────────────────────────────▼──────────────────────────────┐
│           NATIVE MEDIA ENGINE (Kotlin / Jetpack Media3)      │
│  • androidx.media3.transformer: Hardware stream-copying     │
│  • androidx.media3.inspector: Fast FrameExtractor thumbnails│
│  • TFLite Runtime: TransNetV2 mobile scene cut detection    │
│  • Android MediaStore: Direct export to system gallery      │
│  • Android Share Sheet: Direct send to CapCut/TikTok/Reels  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. High-Speed Video Processing & Scene Detection

### A. Instant Zero-Re-Encode Clip Splitting (Transmuxing)
Media3 Transformer automatically attempts **transmuxing** (container-level stream copy) when no visual filters are applied. It slices clips in **milliseconds with zero quality loss and negligible battery usage**:

```kotlin
// In android/src/main/kotlin/com/amverge/media/MediaProcessorPlugin.kt
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

### B. Two-Tier Mobile Scene Detection Engine

#### Method 1: Instant Hardware Keyframe Scanner (Default)
Scans the video track container for Sync Keyframes (`SAMPLE_FLAG_SYNC`) using `MediaExtractor`:
* **Zero Frame Decoding**: Only reads packet header timestamps.
* **Speed**: Scans a 24-minute 1080p episode in **2 to 3 seconds**.
* **Result**: Instant populating of scene cuts and duration intervals.

#### Method 2: Mobile AI Scene Detection (TransNetV2 on TFLite)
For detecting fast action transitions and cut points not aligned with keyframes:
1. **Model Optimization**: The TransNetV2 weights are converted from PyTorch to **TensorFlow Lite (`transnetv2.tflite`)** with FP16 quantization (~14 MB file size).
2. **Tiny Input Resolution**: TransNetV2 strictly processes **48 × 27 pixel RGB frames**, meaning mobile decoding and tensor construction is exceptionally lightweight.
3. **Hardware Acceleration**: Executed on the mobile GPU or NPU via **TFLite GPU Delegate** or Android **NNAPI** at **100+ FPS**.

---

## 4. Mobile UI/UX Design & Responsive Architecture

Translating AMVerge's desktop layout into a mobile-first experience requires adapting for smaller screens, touch ergonomics, and thumb-friendly navigation.

```
┌─────────────────────────────────────────────────────────────┐
│ PORTRAIT PHONE LAYOUT (Single Hand Ergonomics)             │
├─────────────────────────────────────────────────────────────┤
│ [Top Bar]  Episode Title (Dropdown)            [Select All] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────┐   ┌───────────────────────┐      │
│  │ [✓]       00:04.2     │   │ [ ]       00:02.8     │      │
│  │                       │   │                       │      │
│  │    Clip Thumbnail     │   │    Clip Thumbnail     │      │
│  │   ◄── Touch-Scrub ──► │   │   ◄── Touch-Scrub ──► │      │
│  │ 01:14 - 01:18         │   │ 01:18 - 01:21         │      │
│  └───────────────────────┘   └───────────────────────┘      │
│                                                             │
│  (Smooth virtualized 2-column grid: TanStack Virtual)       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ FLOATING DOCK: [ 3 Selected (0:12) ]  [ Add Pack ] [ Export]│
└─────────────────────────────────────────────────────────────┘
```

### A. Responsive Grid System
* **Portrait Phone (360px – 480px width)**:
  * **2-Column Uniform Grid**: Clear thumbnails with maximum visual scanning area.
  * **Corner Overlays**:
    * **Top-Right**: Duration badge with semi-transparent pill (`00:04.2`).
    * **Bottom-Left**: Timestamp range (`01:24 - 01:28`).
    * **Top-Left**: Selection circle (translucent border when unselected; vibrant accent fill with checkmark when selected).
* **Landscape Phone & Tablets (768px+ width)**:
  * **3 to 5 Columns**: Automatically scales with screen width.
  * **Collapsible Left Drawer**: Houses episode lists, folder organization, and scenepack trees without covering the clip grid.

### B. Touch-Scrubbing (Replacing Desktop Mouse Hover)
Desktop AMVerge shows an animated WebP file on mouse hover. Touchscreens lack hover states.
* **The Solution (Touch-Scrub Gesture)**:
  * Each clip tile extracts a compact 10-frame JPG sprite sheet.
  * When the user's thumb touches and moves horizontally (`TouchMove`) across a tile, the frame offset scrubs in real-time.
  * Gives editors tactile, sub-second previewing of the scene's motion without loading full video players into memory.

### C. Multi-Select & Drag-to-Select Gestures
* **Entry Points**:
  1. **Long-Press**: Holding any clip for 200ms selects it, emits haptic feedback, and triggers multi-select mode.
  2. **Top Bar Button**: A dedicated "Select" / "Select All" button in the navigation bar.
* **Drag-to-Select (Apple/Google Photos Pattern)**:
  * Once selection mode is active, dragging a finger continuously across adjacent tiles automatically checks/unchecks them in one fluid sweep.
* **Visual Selection State**:
  * Selected tiles receive an inner accent border and a subtle dark wash (`rgba(0,0,0,0.25)`), making picked clips unmistakable.

### D. Thumb-Zone Floating Action Dock
When one or more clips are selected, a pill-style action bar slides up from the bottom of the screen (anchored in the natural thumb reach zone):
* **Live Stats**: Shows selection count and combined total duration (e.g., `5 clips • 0:24`).
* **Instant Actions**:
  * **Add to Scenepack** (Folder icon).
  * **Export to Gallery** (Download icon).
  * **Share** (Native Android Share Intent icon).

### E. Expandable Bottom Sheets (Replacing Desktop Modals)
Desktop AMVerge uses centered modal dialogues for export options, episode settings, and scenepacks. On mobile, modals at the center of the screen are hard to reach.
* **Bottom Sheet Pattern**:
  * Swiping up reveals settings, audio track pickers, and export profiles.
  * Snapping heights:
    * **Half-Expanded (50%)**: Quick audio and container settings.
    * **Full-Expanded (90%)**: Advanced filters, AI model options, and metadata editor.
  * Draggable handle at the top allows flick-to-dismiss.

### F. Native Mobile Share Sheet Integration
Instead of exporting clips to desktop folders or triggering Windows PowerShell automation:
* AMVerge Mobile triggers Android's native `Intent.ACTION_SEND_MULTIPLE`.
* This allows editors on their phone to immediately transfer cut clips into mobile editing apps with one tap:
  * **CapCut Mobile** (Direct timeline import)
  * **Alight Motion**
  * **TikTok / Instagram Reels**
  * **Discord / WhatsApp**

---

## 5. Mobile Storage & Scoped Storage Architecture

Android's **Scoped Storage** prohibits direct arbitrary filesystem paths (`/sdcard/...`). AMVerge Mobile complies using a two-tier storage model:

| Storage Type | Location | Access Method | User Permission Needed? | Usage in AMVerge Mobile |
|---|---|---|---|---|
| **App Sandbox Cache** | `context.cacheDir` & `context.getExternalFilesDir()` | Standard File I/O (`java.io.File`) | **No permissions required** | • Intermediate stream-copy clips<br>• Thumbnail cache<br>• SQLite database file |
| **User Media Library** | Android `MediaStore.Video` (`Movies/AMVerge/`) | `ContentResolver.insert()` | **No permissions required** (Android 10+) | • Final exported clips<br>• Merged scene packs |
| **Source Video Picking** | External SD Card or Downloads | Storage Access Framework (SAF) (`ACTION_OPEN_DOCUMENT`) | User picks via system file dialog | • Importing raw full-length episodes |

---

## 6. Implementation & Staging Plan

### Step 1: Initialize Tauri v2 Mobile
```bash
cd frontend
npm run tauri android init
```
* Generates the Android Studio harness (`src-tauri/gen/android`).

### Step 2: Register Jetpack Media3 & TFLite in Gradle
Add to `src-tauri/gen/android/app/build.gradle.kts`:
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
Create the Kotlin bridge (`MediaProcessorPlugin.kt`) exposing `cutClip`, `scanKeyframes`, `extractThumbnail`, and `exportToGallery`.

### Step 4: Adapt React Frontend
* Build the responsive 2-column mobile layout with bottom navigation.
* Implement touch-scrubbing (`useTouchScrub.ts`) and drag-to-select gestures.
* Implement floating bottom action dock for batch actions.
