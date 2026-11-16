#!/usr/bin/env bash
#
# Complete One-Shot Setup for AMVerge on Fedora Linux
#
# This script:
#   1. Installs all required Fedora development packages via DNF
#      (Rust, Node.js, WebKit2GTK 4.1, GTK3, AppIndicator, Python 3, Git, etc.)
#   2. Clones the AMVerge repo (if not already inside it)
#   3. Clones the sibling AMVerge-CLI repo
#   4. Prepares the Python virtualenv and builds/links the CLI
#   5. Installs frontend npm dependencies and stages build binaries
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/AMVerge-team/AMVerge/moon/linux-app/setup-fedora.sh | bash
#   # or run locally:
#   ./setup-fedora.sh
#

set -euo pipefail

if [ -t 1 ]; then
  CYAN=$'\033[36m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'
else
  CYAN=""; GREEN=""; YELLOW=""; RED=""; RESET=""
fi

step() { printf '\n%s=== %s ===%s\n' "$CYAN" "$1" "$RESET"; }
ok()   { printf '  %s✓ %s%s\n' "$GREEN" "$1" "$RESET"; }
warn() { printf '  %s! %s%s\n' "$YELLOW" "$1" "$RESET"; }

step "Checking Fedora system"
if [ ! -f /etc/fedora-release ] && [ ! -f /etc/redhat-release ]; then
  warn "This script is tailored for Fedora / RHEL systems."
fi

step "1/4: Installing Fedora System Dependencies via DNF"
echo "Requires sudo privileges to install build tools and libraries..."
sudo dnf install -y \
  git \
  curl \
  wget \
  file \
  make \
  gcc \
  gcc-c++ \
  clang \
  openssl-devel \
  webkit2gtk4.1-devel \
  gtk3-devel \
  libappindicator-gtk3-devel \
  librsvg2-devel \
  libxdo-devel \
  nodejs \
  npm \
  python3 \
  python3-devel \
  python3-pip \
  ffmpeg

ok "System packages installed"

step "Checking Rust installation"
if ! command -v cargo >/dev/null 2>&1; then
  if [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
  else
    echo "Installing Rust toolchain via rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
  fi
fi
ok "Rust $(cargo --version) ready"

step "2/4: Preparing AMVerge Repository"
# Determine workspace directory
if [ -f "setup.sh" ] && [ -d "frontend" ]; then
  AMVERGE_DIR="$(pwd)"
  WORKSPACE_DIR="$(dirname "$AMVERGE_DIR")"
  ok "Already inside AMVerge repository: $AMVERGE_DIR"
else
  WORKSPACE_DIR="${WORKSPACE_DIR:-$HOME/AMVerge-dev}"
  mkdir -p "$WORKSPACE_DIR"
  AMVERGE_DIR="$WORKSPACE_DIR/AMVerge"
  if [ -d "$AMVERGE_DIR/.git" ]; then
    ok "AMVerge repo already exists at $AMVERGE_DIR"
  else
    echo "Cloning AMVerge into $AMVERGE_DIR..."
    git clone https://github.com/AMVerge-team/AMVerge.git "$AMVERGE_DIR"
    # Switch to Linux development branch if testing
    cd "$AMVERGE_DIR"
    git checkout moon/linux-app || true
  fi
fi

step "3/4: Running Repository Setup"
cd "$AMVERGE_DIR"
chmod +x setup.sh
./setup.sh "$@"

step "4/4: Setup Complete!"
cat <<EOF

${GREEN}AMVerge is fully prepared on Fedora!${RESET}

To run the app in development mode:
  ${CYAN}cd "$AMVERGE_DIR/frontend"${RESET}
  ${CYAN}npm run tauri:dev${RESET}

To build native Fedora packages (.rpm, .AppImage):
  ${CYAN}cd "$AMVERGE_DIR/frontend"${RESET}
  ${CYAN}npm run tauri:build -- --config src-tauri/tauri.linux.conf.json${RESET}

