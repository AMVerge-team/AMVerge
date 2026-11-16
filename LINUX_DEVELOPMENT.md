# AMVerge Linux: Multi-Distribution Compatibility and Development Plan

This document outlines the testing, compatibility, and packaging approach for running AMVerge on multiple Linux distributions, specifically Fedora, Zorin OS, Ubuntu, Debian, Linux Mint, and Arch.

## 1. Overview of Distribution Families

Linux distributions differ in package managers, system libraries, and desktop environments. AMVerge targets the two main ecosystems and provides universal portable formats:

| Distribution | Base Family | Package Manager | Primary Package Target | Notes |
|---|---|---|---|---|
| Zorin OS (16 / 17) | Ubuntu LTS | APT (.deb) | .deb and AppImage | Built on Ubuntu 22.04. Has out of the box AppImage support. |
| Fedora (39 / 40) | Red Hat | DNF (.rpm) | .rpm and AppImage | Uses RPM. Prefers .rpm because modern Fedora uses fuse3 instead of fuse2. |
| Ubuntu (22.04 / 24.04) | Debian | APT (.deb) | .deb and AppImage | Standard desktop target. WebKit2GTK 4.1 available in main repos. |
| Linux Mint (21 / 22) | Ubuntu LTS | APT (.deb) | .deb and AppImage | Same base as Ubuntu and Zorin OS. |
| Arch / Manjaro | Independent | Pacman | AppImage | Rolling release with latest libraries. AppImage runs cleanly. |

## 2. Multi-Distribution Strategy

### A. The GLIBC Rule for Building Binaries
The C standard library (glibc) is backward-compatible but not forward-compatible. A binary built on a newer glibc cannot run on an older glibc:
* If built on Ubuntu 24.04 (glibc 2.39), it will crash on Zorin OS 17 (glibc 2.35) with a "GLIBC not found" error.
* If built on an Ubuntu 22.04 LTS baseline (glibc 2.35), the resulting AppImage, .deb, and .rpm will run on Zorin OS 17, Ubuntu 22.04, Ubuntu 24.04, Fedora 39, Fedora 40, and Arch.
* Rule: Always build release binaries inside an Ubuntu 22.04 runner.

### B. Package Formats: Why We Provide Three Formats
1. AppImage:
   * Single portable executable file.
   * Runs without root permissions.
   * Ideal for quick testing on any distro.
   * On Fedora: Modern Fedora does not install the legacy fuse2 library by default. If a user runs an AppImage, they may need `sudo dnf install fuse-libs` unless a native .rpm is provided.
2. .deb:
   * Native package for Zorin OS, Ubuntu, Debian, and Linux Mint.
   * Automatically installs system dependencies (like libwebkit2gtk-4.1-0) using apt.
3. .rpm:
   * Native package for Fedora, RHEL, and openSUSE.
   * Avoids the FUSE dependency problem on Fedora and integrates with GNOME Software.

## 3. Code Modifications Required

### A. Sidecar Build Script (frontend/scripts/build-sidecar.mjs)
Add Linux platform detection to `getRustTargetTriple()`:

```javascript
if (process.platform === "linux") {
  return process.arch === "arm64"
    ? "aarch64-unknown-linux-gnu"
    : "x86_64-unknown-linux-gnu";
}
```

### B. Rust Sidecar Directory Resolution (frontend/src-tauri/src/utils/sidecar.rs)
Update `sidecar_rel_dir()` and `uv_binary()` to recognize Linux targets:

```rust
// In sidecar_rel_dir()
if cfg!(windows) {
    Ok("bin/amverge-x86_64-pc-windows-msvc")
} else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
    Ok("bin/amverge-aarch64-apple-darwin")
} else if cfg!(target_os = "macos") {
    Ok("bin/amverge-x86_64-apple-darwin")
} else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
    Ok("bin/amverge-x86_64-unknown-linux-gnu")
} else {
    Err("amverge sidecar: unsupported platform".to_string())
}
```

```rust
// In uv_binary()
let triple = if cfg!(windows) {
    "x86_64-pc-windows-msvc"
} else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
    "aarch64-apple-darwin"
} else if cfg!(target_os = "macos") {
    "x86_64-apple-darwin"
} else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
    "x86_64-unknown-linux-gnu"
} else {
    return Err("uv: unsupported platform".to_string());
};
```

### C. Bundled FFmpeg Tool Path (frontend/src-tauri/src/utils/ffmpeg.rs)
Add Linux resolution to `resolve_bundled_tool()`:

```rust
let internal_sidecar = if cfg!(windows) {
    "bin/amverge-x86_64-pc-windows-msvc/_internal"
} else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
    "bin/amverge-aarch64-apple-darwin/_internal"
} else if cfg!(target_os = "macos") {
    "bin/amverge-x86_64-apple-darwin/_internal"
} else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
    "bin/amverge-x86_64-unknown-linux-gnu/_internal"
} else {
    return Err("resolve_bundled_tool: unsupported platform".to_string());
};
```

### D. Tauri Linux Configuration (frontend/src-tauri/tauri.linux.conf.json)
Configure bundle targets for AppImage, deb, and rpm:

```json
{
  "bundle": {
    "targets": ["appimage", "deb", "rpm"],
    "appimage": {
      "bundleMediaFramework": true
    },
    "deb": {
      "depends": [
        "libwebkit2gtk-4.1-0",
        "libgtk-3-0",
        "libayatana-appindicator3-1"
      ]
    },
    "rpm": {
      "depends": [
        "webkit2gtk4.1",
        "gtk3",
        "libappindicator-gtk3"
      ]
    }
  }
}
```

## 4. Hardware Acceleration Testing across Distros

Linux video editors rely heavily on hardware encoding:
* Nvidia (Fedora and Zorin):
  * Command: `nvidia-smi` is called by `hardware.rs` to detect the GPU name and generation (Blackwell, Ada, Ampere, Turing, Pascal).
  * FFmpeg uses `h264_nvenc` and `hevc_nvenc`.
  * Works out of the box when the official Nvidia proprietary driver is installed on either Fedora (`akmod-nvidia`) or Zorin OS (Additional Drivers).
* AMD and Intel:
  * Uses VA-API (`h264_vaapi`, `hevc_vaapi`) via Mesa drivers (`mesa-va-drivers`).
  * `GPU_BACKEND_PRIORITY` in `hardware.rs` already supports vaapi as a hardware backend.

## 5. Editor Automation on Linux

* DaVinci Resolve:
  * DaVinci Resolve Studio runs natively on Linux.
  * AMVerge already includes a cross-platform Python automation script: `frontend/src-tauri/src/commands/editor_import/resolve_import.py`.
  * In `davinci_resolve.rs`, the Linux path to Resolve scripting is already mapped under `unix`:
    `/opt/resolve/libs/Fusion/fusionscript.so` and `/opt/resolve/bin/resolve`.
* Windows and macOS only editors (Premiere, After Effects, CapCut):
  * The frontend disables or hides these buttons when running on Linux.

## 6. GitHub Actions Multi-Distro Build Pipeline

To build packages for both Debian/Ubuntu and Red Hat/Fedora families, use an Ubuntu 22.04 runner with alien or rpm tools installed:

```yaml
build-linux:
  name: Build Linux Packages
  runs-on: ubuntu-22.04
  steps:
    - uses: actions/checkout@v4
    - name: Install build tools and libraries
      run: |
        sudo apt-get update
        sudo apt-get install -y \
          libwebkit2gtk-4.1-dev \
          libappindicator3-dev \
          librsvg2-dev \
          patchelf \
          rpm
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
    - name: Build Tauri Bundles
      run: cargo tauri build --target x86_64-unknown-linux-gnu --config tauri.linux.conf.json
```

## 7. Testing Checklist for Distros

When testing on virtual machines or hardware:
1. Zorin OS 17 (Ubuntu 22.04 base): Test `.deb` installation via Software Center, test AppImage execution, verify WebP previews and FFmpeg cuts.
2. Fedora 40 (GNOME / Wayland): Test `.rpm` installation via DNF, test AppImage with and without `fuse-libs`, verify NVENC or VA-API hardware detection.
3. Linux Mint 22: Verify WebKit2GTK 4.1 resolution and desktop shortcut integration.
4. Arch Linux: Test AppImage execution on a rolling glibc environment.
