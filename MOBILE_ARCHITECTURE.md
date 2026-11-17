# AMVerge Mobile: Architecture and Implementation Plan

This document describes the technical architecture for the native Android version of AMVerge. It is based on a pure native stack using Kotlin, Jetpack Compose, Jetpack Media3, FFmpeg through the Android NDK, and Room database storage.

## 1. Overview

Desktop AMVerge uses Python (AMVerge-CLI) and desktop FFmpeg child processes. Android does not allow running standalone command line executables inside an application sandbox. 

To achieve smooth 60 to 120 FPS performance on phones and tablets, the Android app is designed as a native application without WebView or desktop wrappers.

### Core Stack
* UI Framework: Kotlin and Jetpack Compose (declarative native UI)
* Media Playback and Trimming: Jetpack Media3 (ExoPlayer and Media3 Transformer)
* Native Video Processing: FFmpeg compiled via the Android NDK (C/C++ shared libraries)
* Local Data Storage: Room Database (SQLite object mapping) and Android Scoped Storage

## 2. Architecture Diagram

```
+-------------------------------------------------------------+
|                 UI LAYER (Jetpack Compose)                  |
|  - LazyVerticalGrid for 2-column video scene browsing       |
|  - Isolated scrubbing state for touch preview gestures       |
|  - Expandable bottom sheets for export and scenepack options|
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|               DATA LAYER (Room + Repository)                |
|  - Episodes, scene cut points, and scenepack tables         |
|  - Timestamp to thumbnail file path mappings                |
|  - Android Scoped Storage file descriptor resolution        |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                 MEDIA ENGINE (Media3 + NDK)                 |
|  - Media3 Transformer: Fast stream-copy cuts (no re-encode) |
|  - Media3 FrameExtractor: Fast thumbnail generation         |
|  - ExoPlayer: In-app video preview with scrubbing mode      |
|  - NDK FFmpeg (C/C++): Fallback for complex containers      |
+-------------------------------------------------------------+
```

## 3. Video Processing and Cutting Pipeline

### A. Stream-Copy Trimming (Media3 Transformer)
When cutting clips at keyframes, Media3 Transformer performs container-level transmuxing. It copies video and audio packets directly into the new MP4 container without decoding or re-encoding:

```kotlin
package com.amverge.media

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer

class VideoCutManager(private val context: Context) {

    fun cutClip(
        inputUri: String,
        outputPath: String,
        startMs: Long,
        endMs: Long,
        onComplete: (String) -> Unit,
        onError: (String) -> Unit
    ) {
        val mediaItem = MediaItem.fromUri(inputUri)
        val editedItem = EditedMediaItem.Builder(mediaItem)
            .setTrimStartMs(startMs)
            .setTrimEndMs(endMs)
            .build()

        val transformer = Transformer.Builder(context)
            .addListener(object : Transformer.Listener {
                override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                    onComplete(outputPath)
                }
                override fun onError(
                    composition: Composition,
                    exportResult: ExportResult,
                    exportException: ExportException
                ) {
                    onError(exportException.message ?: "Unknown export error")
                }
            })
            .build()

        transformer.start(editedItem, outputPath)
    }
}
```

### B. FFmpeg via Android NDK
For formats that Android platform decoders or MediaMuxer cannot handle directly (such as unusual MKV tracks, non-standard audio streams, or specialized container options):
* FFmpeg C/C++ libraries (libavcodec, libavformat, libavutil, libswscale) are compiled for Android ABIs (arm64-v8a, armeabi-v7a, x86_64).
* Fast Merge Concat Demuxer: Combines multiple selected scenes into one continuous scenepack video in under 2 seconds.
* Multi-Track Audio Selection: Switch between Japanese audio and English dubs in ExoPlayer, or choose "No Audio" export mode to create silent anime clips.
* Mid-Scene Splitting ("Split Scene"): Split scissor button in preview player divides a cut into two smaller scenes.
* Foreground Service Lifecycle: Long batch export jobs run inside an Android Foreground Service with a persistent progress notification.
* Called through a small JNI bridge to run stream copy or extraction operations without relying on deprecated third-party wrappers like FFmpegKit.

### C. Picture-in-Picture, Cloud Storage & Editor Integration
* Picture-in-Picture (PiP): Android native PiP allows floating anime scenes while working in CapCut or Alight Motion.
* Storage Access Framework (SAF): Resolves and cuts video files directly from Google Drive, Dropbox, or SD card without local duplication.
* Scenepacks & Events Drawer: Create and organize custom scenepacks, and browse/enter community AMV editing contests.

### C. Scene Detection & Semantic Search Methods
1. Keyframe Scanner (Default):
   * Uses Android MediaExtractor to read sync samples (SAMPLE_FLAG_SYNC).
   * Reads container packet headers without decoding image pixels.
   * Scans a full 24-minute episode in about 2 to 3 seconds.
2. AI Cut Detection (TransNetV2 on TFLite):
   * Converted from PyTorch to TensorFlow Lite (transnetv2.tflite) with 16-bit float quantization.
   * Downscales video frames to 48 x 27 pixels RGB.
   * Runs inference on the mobile GPU or NPU using the TFLite GPU delegate or Android NNAPI.
3. Scene Scout Mobile Vector Engine (Semantic Querying):
   * Native compatibility with desktop AMVerge Scene Scout SQLite databases (`processed_videos` and `scene_embeddings`).
   * Evaluates text search queries using quantized TFLite text encoders (`MobileCLIP-TFLite`).
   * High-speed cosine similarity ranking using ARM NEON SIMD C++ intrinsics in the NDK (`vmlaq_f32`), scoring 10,000+ scene embeddings in under 30ms.

## 4. Jetpack Compose UI and Touch Interactions

### A. Clip Grid (LazyVerticalGrid)
* Portrait phones: 2-column layout displaying clip thumbnails, duration badges (example: 00:04.2), and timestamp ranges (example: 01:14 - 01:18).
* Tablets and landscape orientation: 3 to 5 columns with a collapsible side drawer.
* To prevent frame drops during scrolling, grid cells display cached image thumbnails rather than active player instances.

### B. Touch Scrubbing Pattern
Phones do not have mouse hover states. To preview video action quickly:
* Moving a finger horizontally across a clip card scrubs through a 10-frame pre-extracted thumbnail sequence or queries Media3 FrameExtractor.
* For the active full preview player, ExoPlayer uses scrubbing mode:
  ```kotlin
  exoPlayer.setScrubbingModeEnabled(true)
  ```
* Scrub drag events are throttled to match the screen refresh rate to avoid overwhelming the video decoder.

### C. Multi-Select Gestures
* Long press: Holding any clip for 200 milliseconds selects it and enters multi-select mode with haptic feedback.
* Drag to select: Dragging across adjacent clips toggles their selection state in one continuous gesture.
* Floating bottom dock: When clips are selected, a bottom bar displays the count and total duration (example: 4 clips, 0:18) with buttons to Add to Scenepack, Export to Gallery, or Share.

### D. Expandable Bottom Sheets
Replaces desktop modal dialogs:
* Half-expanded: Fast selection of export container and audio tracks.
* Full-expanded: Detailed settings, episode metadata, and AI detection thresholds.
* Dismissed by swiping down.

### E. Android Share Sheet Integration
Uses the native Android share intent (Intent.ACTION_SEND_MULTIPLE) to send exported clips directly into mobile editors like CapCut, Alight Motion, or social apps like TikTok and Instagram.

## 5. Local Storage Architecture

Android enforces Scoped Storage:

| Storage Area | Android Path | Access Method | Permission | Purpose |
|---|---|---|---|---|
| App Internal Cache | context.cacheDir | java.io.File | None | Temporary video cuts, thumbnail cache |
| Database Storage | context.getDatabasePath() | Room ORM | None | Episodes, scenes, scenepacks, and thumbnail timestamp index |
| Media Gallery | MediaStore.Video (Movies/AMVerge/) | ContentResolver.insert() | None (Android 10+) | Final exported clips and scenepacks |
| Source Video Picking | Device storage / SD card | Storage Access Framework (SAF) | User file picker | Reading source video files |

### Room Database Schema Overview
* EpisodeEntity: id, title, uri, durationMs, createdAt
* SceneEntity: id, episodeId, sceneIndex, startMs, endMs, thumbnailPath
* ScenepackEntity: id, name, createdAt
* ScenepackClipCrossRef: scenepackId, sceneId

## 6. Development Roadmap

1. Phase 1: Project setup with Jetpack Compose, Material 3, and navigation scaffolding.
2. Phase 2: MediaExtractor keyframe scanner and Media3 Transformer stream-copy cutting.
3. Phase 3: Room database setup and thumbnail extraction with Media3 FrameExtractor.
4. Phase 4: LazyVerticalGrid UI with touch scrubbing, selection gestures, and bottom action dock.
5. Phase 5: NDK FFmpeg integration for custom formats and MediaStore export pipeline.
