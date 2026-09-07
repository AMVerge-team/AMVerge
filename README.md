# AMVerge V2

> This branch is for version V2. Please do not contribute to this branch as I
> want to personally refactor and redo the pipeline.

A desktop app for editors who need to split videos into usable clips, preview
scenes, and export selections without going through a full editor.

- **Frontend** React + TypeScript
- **Desktop shell** Tauri (Rust)
- **Video processing** [AMVerge-CLI](https://github.com/AMVerge-team/AMVerge-CLI) (Python)
- **Media tools** FFmpeg / FFprobe / PyAV

## Setup

The app and the CLI are separate repositories, and a dev build runs the CLI out
of a virtualenv in its checkout. One script sets both up:

```powershell
.\setup.ps1        # Windows
```

```bash
./setup.sh         # macOS / Linux
```

Then:

```bash
cd frontend
npm run tauri:dev
```

Prerequisites, the AI extras, what goes in `.env`, and the manual equivalent of
each step are in [CONTRIBUTING.md](CONTRIBUTING.md#local-setup).

Architecture notes are in [documentation.md](documentation.md).
