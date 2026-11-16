# AMVerge Linux

> This branch is for Linux desktop development and packaging (AppImage and deb).

A desktop app for editors who need to split videos into usable clips, preview
scenes, and export selections without going through a full editor.

- **Frontend**: React + TypeScript
- **Desktop shell**: Tauri (Rust)
- **Video processing**: [AMVerge-CLI](https://github.com/AMVerge-team/AMVerge-CLI) (Python)
- **Media tools**: FFmpeg / FFprobe / PyAV

## Setup on Linux

1. Install system prerequisites (Ubuntu / Debian):
```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

2. Run the developer setup script:
```bash
./setup.sh
```

3. Start the development server:
```bash
cd frontend
npm run tauri:dev
```

Architecture and packaging plans are documented in [LINUX_DEVELOPMENT.md](LINUX_DEVELOPMENT.md).
