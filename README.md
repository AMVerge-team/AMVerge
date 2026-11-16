# AMVerge Android

> This branch is for the Android mobile version of AMVerge. It is currently under planning and development.

A mobile app for editors who need to split videos into usable clips, preview scenes, and export selections directly on Android devices without opening a full video editor.

- **UI Framework**: Kotlin and Jetpack Compose
- **Media Engine**: Android Jetpack Media3 (ExoPlayer and Media3 Transformer)
- **Native Processing**: FFmpeg through the Android NDK (C/C++ shared libraries)
- **Scene Detection**: Keyframe scanner and TransNetV2 (TensorFlow Lite)
- **Local Storage**: Room Database (SQLite) and Android Scoped Storage

## Current Status

This version is currently in the design and planning phase. Detailed architectural plans, media processing pipelines, and UI designs are documented in [MOBILE_ARCHITECTURE.md](MOBILE_ARCHITECTURE.md).

## Planned Features

- Fast keyframe scene detection using Android MediaExtractor
- Instant stream-copy trimming with zero re-encoding via Jetpack Media3
- Touch-friendly 2-column clip grid with horizontal thumb-scrubbing
- Long-press multi-selection and drag-to-select
- Direct export into Android gallery (Movies/AMVerge) and system share sheet for apps like CapCut, TikTok, and Instagram
- Optional AI scene detection running locally through TFLite
