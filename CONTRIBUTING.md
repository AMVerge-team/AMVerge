# Contributing to AMVerge

Thanks for your interest in contributing to AMVerge.

AMVerge is an open-source desktop tool focused on fast scene selection, previewing, and export workflows for editors.

## Ways to Contribute

- Report bugs
- Suggest features
- Improve UI / UX
- Fix bugs
- Improve performance
- Improve docs
- Refactor code
- Add tests
- Improve accessibility
- Improve cross-platform support

---

## Before You Start

Please check existing Issues before opening a new one.

For larger features, workflow changes, or architecture updates, open an Issue first so direction can be discussed before development starts.

If you plan to work on something, comment on the Issue first so work is not duplicated.

---

## Project Stack

- Frontend: React + TypeScript
- Desktop Shell: Tauri (Rust)
- Backend Processing: Python
- Media Tools: FFmpeg / FFprobe / PyAV

---

## Local Setup

AMVerge is two repositories. This one is the desktop app (React + Tauri); the
video work lives in [AMVerge-CLI](https://github.com/AMVerge-team/AMVerge-CLI),
a Python package the app shells out to. A dev build runs the CLI out of a
virtualenv in that checkout, so both have to be set up before the app will do
anything useful.

A script does all of it.

### Prerequisites

Install these yourself first; the script checks for them and stops with a list
if any are missing.

| Tool | Version | Notes |
| --- | --- | --- |
| [Git](https://git-scm.com) | any | |
| [Node.js](https://nodejs.org) | 20+ | ships npm |
| [Python](https://www.python.org/downloads/) | 3.11+ | the CLI requires it |
| [Rust](https://rustup.rs) | stable | for Tauri |

Platform extras:

- **Windows** - the WebView2 runtime. Present on Windows 11 and current Windows
  10; on a stripped or LTSC image install it from
  [Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/).
- **macOS** - Xcode command line tools: `xcode-select --install`
- **Linux** - the Tauri system libraries:
  ```bash
  sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

### Setup

From the repo root:

```powershell
# Windows
.\setup.ps1
```

```bash
# macOS / Linux
./setup.sh
```

That will:

1. Clone AMVerge-CLI beside this repo
2. Create a virtualenv in that checkout and install the CLI into it, editable
3. Create `.env` from `.env.example` and point `AMVERGE_CLI_DIR` at the checkout
4. `npm install` the frontend
5. Stage the `uv` binary the app uses to provision AI environments

It is safe to re-run. It pulls rather than reclones, reuses an existing
virtualenv, and never overwrites an existing `.env` - only the one
`AMVERGE_CLI_DIR` line is rewritten, so your own values survive.

### AI features

The AI packs (TransNetV2 scene detection, depth maps, interpolation) need torch
and are several GB, so they are not installed by default. Without them the app
runs normally and only those features report a missing pack.

```powershell
.\setup.ps1 -Ai
```

```bash
./setup.sh --ai
```

### Running

```bash
cd frontend
npm run tauri:dev
```

Use `tauri:dev`, not `tauri dev`: the script loads `.env` before starting.

The first Rust build takes several minutes. Later runs are cached.

### Secrets

`.env.example` is the full list of what the app reads, with a comment on each
explaining what breaks without it. The setup script copies it verbatim; you
fill in what you need.

Everything works against a local backend with the defaults, which is enough for
most UI and pipeline work. Two things need values a maintainer issues, and both
fail loudly rather than silently:

| Variable | Needed for |
| --- | --- |
| `AMVERGE_DISCORD_APP_CLIENT_ID` | Discord sign-in, hosting community events |
| `AMVERGE_BUG_REPORT_*` | submitting bug reports |

If you create your own Discord application for local work, register these
redirect URIs on it exactly:

```txt
http://127.0.0.1:53421/callback
http://127.0.0.1:53422/callback
http://127.0.0.1:53423/callback
```

Discord matches `redirect_uri` exactly and does not grant loopback the any-port
allowance, so all three have to be registered - the app falls back through them
if a port is taken.

### Doing it manually

The script is the supported path, but if you want to understand or reproduce it:

```bash
# 1. CLI, as a sibling of this repo
git clone https://github.com/AMVerge-team/AMVerge-CLI.git ../AMVerge-CLI
cd ../AMVerge-CLI
python -m venv .venv

# 2. install it into that venv, editable
.venv/bin/pip install -e .          # Windows: .venv\Scripts\pip install -e .

# 3. back here
cd ../AMVerge_V2
cp .env.example .env                # PowerShell: Copy-Item .env.example .env
# then set AMVERGE_CLI_DIR to the absolute path of the CLI checkout

# 4. frontend
cd frontend
npm install
```

Two things are easy to get wrong here:

- **Install the CLI into the venv, not globally.** A dev build runs
  `<AMVERGE_CLI_DIR>/.venv/{Scripts,bin}/amverge` by absolute path
  ([sidecar.rs](frontend/src-tauri/src/utils/sidecar.rs)). A global `pip install`
  leaves that path empty and every call fails.
- **Install from the checkout, not PyPI.** The published wheel lags the extras
  the AI packs expect, so `pip install amverge` gives you a CLI that cannot
  satisfy them.

---

## Branching Workflow

Please branch from the **development** branch, not main.

Example:

```bash
git checkout development
git pull origin development
git checkout -b feature/my-change
```

Use clear branch names:

```bash
feature/export-quality-slider
fix/merge-stutter
docs/readme-update
refactor/sidebar-cleanup
```

---

## Pull Request Rules

### One Feature Per PR

Please keep each pull request focused on one feature or one fix.

Good examples:

* Add export bitrate slider
* Fix merge stutter issue
* Improve sidebar folder drag/drop
* Update backend README

Avoid:

* Export changes + large UI changes + docs rewrite in one PR

Small focused PRs are easier to review, test, and merge.

---

### Only Touch What Is Necessary

Please only modify files related to your change.

This helps reduce merge conflicts and keeps review clean.

Example:

If fixing sidebar logic, avoid unrelated changes in backend or styles.

---

### PR Target Branch

Open pull requests into:

```txt
development
```

Not `main`.

If review passes, changes will be merged into `development` first.

---

## Code Style

* Keep code readable
* Prefer clear naming over clever code
* Match existing project patterns
* Avoid unnecessary dependencies
* Keep components modular
* Keep hooks focused
* Avoid giant multi-purpose files

---

## For Performance Changes

Please explain:

* what changed
* why it helps
* any tradeoffs
* where it was measured (if possible)

---

## For UI Changes

Include screenshots or short clips.

Especially helpful for:

* layout changes
* animations
* settings screens
* sidebar changes

---

## For Backend Changes

Please mention if it affects:

* import speed
* keyframe detection
* export speed
* thumbnails
* codec compatibility
* memory usage

---

## Pull Request Process

1. Fork repo
2. Sync `development`
3. Create a feature branch
4. Make focused changes
5. Commit clearly
6. Open PR into `development`
7. Wait for review

---

## Important Notes

This project uses React + Tauri + Python.

Some changes affect multiple layers, so please test where relevant.

Examples:

* UI change may need frontend only
* Export change may affect frontend + Rust + Python
* File path changes may affect packaging

If unsure where logic belongs, ask first in an Issue.

---

## Respect the Codebase

Please avoid:

* random formatting-only PRs
* mass renames with no reason
* changing unrelated files
* adding dependencies casually
* rewriting working systems without discussion

---

## Be Respectful

Constructive and respectful collaboration only.

Good communication matters as much as good code.

---

## Thanks

Every bug fix, feature, doc improvement, and thoughtful PR helps AMVerge grow.
