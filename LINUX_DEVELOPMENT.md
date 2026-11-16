# AMVerge Linux Development Plan

This document details the development and packaging steps required for the official Linux version of AMVerge.

## 1. Overview

Unlike mobile platforms, the core architecture of AMVerge already runs on Linux:
* Desktop Shell: Tauri v2 works on Linux using WebKitGTK and GTK 3.
* Media Engine: AMVerge-CLI, PyAV, FFmpeg, and PyTorch (CUDA) run natively on Linux with high performance.
* Setup script: The root setup.sh script already supports Ubuntu and Debian-based distributions.

The focus for Linux development is adding native Linux sidecar compilation, AppImage packaging, and a dedicated Linux build job in GitHub Actions.

## 2. System Prerequisites

On Ubuntu and Debian systems, the following libraries are required for compilation:

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

For Fedora systems:
```bash
sudo dnf install -y \
  webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel
```

## 3. Required Code Changes

### A. Sidecar Build Script (build-sidecar.mjs)
Currently, `getRustTargetTriple()` in `frontend/scripts/build-sidecar.mjs` supports Windows and macOS. It must be updated to support Linux:

```javascript
if (process.platform === "linux") {
  return process.arch === "arm64"
    ? "aarch64-unknown-linux-gnu"
    : "x86_64-unknown-linux-gnu";
}
```

### B. Tauri Linux Configuration (tauri.linux.conf.json)
Configure the bundle targets for Linux releases:
* AppImage: Self-contained executable format that runs on most distributions without dependency installation issues.
* deb: Debian and Ubuntu native package format.

Configuration example:
```json
{
  "bundle": {
    "targets": ["appimage", "deb"],
    "appimage": {
      "bundleMediaFramework": true
    }
  }
}
```

## 4. Hardware Acceleration on Linux

AMVerge supports hardware encoding and decoding on Linux:
* Nvidia GPUs: NVENC through proprietary Nvidia Linux drivers. Tested and supported by FFmpeg out of the box.
* AMD and Intel GPUs: VA-API (Video Acceleration API) and Intel QSV through standard Linux graphics packages (mesa-va-drivers, intel-media-va-driver).

## 5. Video Editor Integrations on Linux

* DaVinci Resolve: Fully supported on Linux. AMVerge uses a Python bridge script (resolve_import.py) to insert cut clips into DaVinci Resolve timelines and media pools.
* After Effects and Premiere Pro: Not available natively on Linux. Those direct export actions will be hidden or disabled when running on Linux.

## 6. GitHub Actions Release Workflow

Add an Ubuntu runner job to `.github/workflows/release-multi-platform.yml`:

```yaml
build-linux:
  name: Build Linux AppImage
  runs-on: ubuntu-22.04
  steps:
    - uses: actions/checkout@v4
    - name: Install system dependencies
      run: |
        sudo apt-get update
        sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: 'npm'
        cache-dependency-path: frontend/package-lock.json
    - name: Install Rust
      uses: dtolnay/rust-toolchain@stable
    - name: Build Sidecar
      run: node frontend/scripts/build-sidecar.mjs --target x86_64-unknown-linux-gnu
    - name: Build Tauri AppImage
      run: cargo tauri build --target x86_64-unknown-linux-gnu --config tauri.linux.conf.json
```

## 7. Implementation Steps

1. Step 1: Update `build-sidecar.mjs` to resolve `x86_64-unknown-linux-gnu`.
2. Step 2: Create `frontend/src-tauri/tauri.linux.conf.json` with AppImage and deb targets.
3. Step 3: Test local dev execution using `./setup.sh` and `npm run tauri:dev` on a Linux environment.
4. Step 4: Add the Linux build job to the release workflow.
