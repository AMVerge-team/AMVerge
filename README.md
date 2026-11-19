<p align="center">
  <img src="frontend/src/assets/amverge_title_gif.gif" alt="AMVerge Logo" width="1440"/>
</p>

# AMVerge Linux

> This branch is for Linux desktop development and packaging (`AppImage`, `.deb`, and `.rpm`). Merged into `development` and `main` (v2.0.5).

A desktop app for editors who need to split videos into usable clips, preview scenes, search with Scene Scout, and export selections.

- **Frontend**: React + TypeScript
- **Desktop shell**: Tauri (Rust)
- **Video processing**: [AMVerge-CLI](https://github.com/AMVerge-team/AMVerge-CLI) (Python)
- **Media tools**: FFmpeg / FFprobe / PyAV

---

## Setup on Linux

### Ubuntu / Debian
```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
  gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-libav
```

### Fedora
```bash
./setup.sh
```

---

## Links

- **Website**: [amverge.app](https://amverge.app/)
- **Main Repo**: [AMVerge-team/AMVerge](https://github.com/AMVerge-team/AMVerge)
- **CLI Backend**: [AMVerge-team/AMVerge-CLI](https://github.com/AMVerge-team/AMVerge-CLI)
- **After Effects Extension**: [AMVerge-team/AMVerge-Extension](https://github.com/AMVerge-team/AMVerge-Extension)
- **Homebrew Tap (macOS)**: [AMVerge-team/homebrew-tap](https://github.com/AMVerge-team/homebrew-tap)
- **Discord**: [Join the AMVerge Discord](https://discord.gg/bmXjTgsAaN)
