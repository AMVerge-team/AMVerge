#!/usr/bin/env bash
#
# One-shot developer setup for AMVerge V2 on macOS and Linux.
#
# Clones AMVerge-CLI next to this repo, builds its virtualenv, installs the CLI
# into that venv in editable mode, points this app's .env at it, and installs
# the frontend dependencies.
#
# The app resolves the CLI from a venv, never from a global pip install: in a
# dev build the Rust side runs `<AMVERGE_CLI_DIR>/.venv/bin/amverge` directly
# (see frontend/src-tauri/src/utils/sidecar.rs). Installing the CLI globally
# would leave that path empty and every import would fail.
#
# Safe to re-run. An existing checkout is updated rather than recloned, an
# existing venv is reused, and an existing .env is never overwritten.
#
# Usage:
#   ./setup.sh          base setup
#   ./setup.sh --ai     also install the AI extras (torch, several GB)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$REPO_ROOT/frontend"
# a sibling of the app repo, not a child: nesting one git checkout inside
# another confuses status, ignores and most editors' source control
CLI_DIR="${AMVERGE_CLI_DIR:-$(dirname "$REPO_ROOT")/AMVerge-CLI}"
CLI_REPO="${AMVERGE_CLI_REPO:-https://github.com/AMVerge-team/AMVerge-CLI.git}"
WITH_AI=0

for arg in "$@"; do
  case "$arg" in
    --ai) WITH_AI=1 ;;
    -h|--help) sed -n '3,21p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

if [ -t 1 ]; then
  CYAN=$'\033[36m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'
  GREY=$'\033[90m'; RESET=$'\033[0m'
else
  CYAN=""; GREEN=""; YELLOW=""; RED=""; GREY=""; RESET=""
fi

step() { printf '\n%s=== %s ===%s\n' "$CYAN" "$1" "$RESET"; }
ok()   { printf '  %s%s%s\n' "$GREEN" "$1" "$RESET"; }
note() { printf '  %s%s%s\n' "$GREY" "$1" "$RESET"; }
warn() { printf '  %s%s%s\n' "$YELLOW" "$1" "$RESET"; }

has() { command -v "$1" >/dev/null 2>&1; }

# Finds an interpreter satisfying the CLI's requires-python (>=3.11). Versioned
# names come first: plain `python3` is still a 3.9 on some macOS and LTS images.
resolve_python() {
  for candidate in python3.13 python3.12 python3.11 python3 python; do
    if has "$candidate"; then
      if "$candidate" -c 'import sys; sys.exit(0 if sys.version_info[:2] >= (3, 11) else 1)' 2>/dev/null; then
        echo "$candidate"
        return 0
      fi
    fi
  done
  return 1
}

# ---------------------------------------------------------------------------
step "Checking prerequisites"

OS="$(uname -s)"
missing=()

has git   || missing+=("git")
has node  || missing+=("node 20+")
has npm   || missing+=("npm (ships with Node.js)")
has cargo || missing+=("rust (https://rustup.rs)")

PYTHON="$(resolve_python || true)"
[ -n "$PYTHON" ] || missing+=("python 3.11+")

if [ "${#missing[@]}" -gt 0 ]; then
  printf '\n%sMissing prerequisites:%s\n' "$RED" "$RESET"
  for m in "${missing[@]}"; do printf '  %s- %s%s\n' "$RED" "$m" "$RESET"; done
  echo ""
  if [ "$OS" = "Darwin" ]; then
    echo "Install with Homebrew:"
    echo "  brew install git node python@3.12"
    echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  else
    echo "On Debian/Ubuntu:"
    echo "  sudo apt install -y git nodejs npm python3 python3-venv"
    echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  fi
  echo ""
  echo "Then open a new terminal and run this script again."
  exit 1
fi

ok "git, node, npm, cargo found"
ok "python $("$PYTHON" -c 'import sys; print("%d.%d" % sys.version_info[:2])') found ($PYTHON)"

# Tauri builds against the system webview. On Linux those headers are separate
# packages, and their absence shows up as an opaque Rust linker error rather
# than anything naming webkit.
if [ "$OS" = "Linux" ]; then
  if has pkg-config; then
    if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null && ! pkg-config --exists webkit2gtk-4.0 2>/dev/null; then
      warn "webkit2gtk development headers not found. Tauri will fail to link."
      warn "Debian/Ubuntu:"
      warn "  sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \\"
      warn "    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev"
    fi
  else
    warn "pkg-config not found; cannot verify the Tauri system dependencies."
  fi
elif [ "$OS" = "Darwin" ]; then
  if ! xcode-select -p >/dev/null 2>&1; then
    warn "Xcode command line tools not installed. Run: xcode-select --install"
  fi
fi

# ---------------------------------------------------------------------------
step "AMVerge-CLI checkout"

if [ -d "$CLI_DIR/.git" ]; then
  note "Already cloned at $CLI_DIR"
  note "Pulling latest..."
  git -C "$CLI_DIR" pull --ff-only || warn "Pull failed (local changes?). Continuing with the checkout as-is."
elif [ -e "$CLI_DIR" ]; then
  echo "$CLI_DIR exists but is not a git checkout. Move or delete it, then re-run." >&2
  exit 1
else
  note "Cloning $CLI_REPO"
  git clone "$CLI_REPO" "$CLI_DIR"
fi
ok "CLI at $CLI_DIR"

# ---------------------------------------------------------------------------
step "CLI virtualenv"

VENV_DIR="$CLI_DIR/.venv"
VENV_PYTHON="$VENV_DIR/bin/python"

if [ -x "$VENV_PYTHON" ]; then
  note "Reusing existing venv"
else
  note "Creating venv at $VENV_DIR"
  # python3-venv is a separate package on Debian and the error it raises when
  # missing does not name it
  if ! "$PYTHON" -m venv "$VENV_DIR" 2>/dev/null; then
    echo "Failed to create the virtualenv." >&2
    echo "On Debian/Ubuntu install the venv module first:  sudo apt install python3-venv" >&2
    exit 1
  fi
fi

"$VENV_PYTHON" -m pip install --upgrade pip --quiet

# Editable, and from this checkout rather than PyPI: the published wheel lags
# the extras the app's AI packs expect, so a PyPI install produces a CLI that
# cannot satisfy them. Editable also means a developer's CLI edits take effect
# without reinstalling.
if [ "$WITH_AI" -eq 1 ]; then
  note "Installing CLI (editable) with AI extras. This downloads torch and takes a while."
  "$VENV_PYTHON" -m pip install -e "$CLI_DIR[all]"
else
  note "Installing CLI (editable), base dependencies only"
  "$VENV_PYTHON" -m pip install -e "$CLI_DIR"
fi

AMVERGE_EXE="$VENV_DIR/bin/amverge"
if [ ! -x "$AMVERGE_EXE" ]; then
  echo "Install finished but $AMVERGE_EXE is missing." >&2
  echo "The app resolves the CLI from this exact path." >&2
  exit 1
fi
ok "amverge installed in the venv"
"$AMVERGE_EXE" version

# ---------------------------------------------------------------------------
step "Environment file"

ENV_FILE="$REPO_ROOT/.env"
if [ ! -f "$ENV_FILE" ]; then
  cp "$REPO_ROOT/.env.example" "$ENV_FILE"
  ok "Created .env from .env.example"
else
  note ".env already exists, leaving its values alone"
fi

if grep -q '^AMVERGE_CLI_DIR=' "$ENV_FILE"; then
  # a temp file rather than sed -i: the -i flag takes an argument on BSD sed
  # (macOS) and not on GNU sed, so no single invocation works on both
  tmp="$(mktemp)"
  sed "s|^AMVERGE_CLI_DIR=.*|AMVERGE_CLI_DIR=$CLI_DIR|" "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
else
  printf '\nAMVERGE_CLI_DIR=%s\n' "$CLI_DIR" >> "$ENV_FILE"
fi
ok "AMVERGE_CLI_DIR points at the venv checkout"

# ---------------------------------------------------------------------------
step "Frontend dependencies"

cd "$FRONTEND_DIR"
npm install
ok "node_modules installed"

# Staged now rather than on first run: tauri:dev fetches it anyway, and
# surfacing a network failure here is clearer than mid-launch.
note "Staging the uv binary used to provision AI environments"
npm run fetch:uv || warn "fetch:uv failed. Not fatal; tauri:dev retries it."

# ---------------------------------------------------------------------------
step "Done"

cat <<EOF

  Start the app:
    cd frontend
    npm run tauri:dev

EOF
note "The first Rust build takes several minutes; later runs are cached."
echo ""

if [ "$WITH_AI" -eq 0 ]; then
  note "AI features (TransNetV2, depth, interpolation) are not installed."
  note "Add them any time with:  ./setup.sh --ai"
  echo ""
fi

warn "Optional, only if you need them:"
warn "  AMVERGE_DISCORD_APP_CLIENT_ID   Discord sign-in and hosting events"
warn "  AMVERGE_BUG_REPORT_*            submitting bug reports"
warn "Both come from a maintainer. Everything else works without them."
echo ""
