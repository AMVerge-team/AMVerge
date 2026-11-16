#!/usr/bin/env bash
#
# Install AMVerge on Fedora Linux (x86_64)
#
# Usage:
#   chmod +x install-fedora.sh
#   ./install-fedora.sh                      # Auto-detects local .rpm or .AppImage
#   ./install-fedora.sh path/to/package.rpm  # Installs a specific RPM file
#

set -euo pipefail

if [ -t 1 ]; then
  CYAN=$'\033[36m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'
else
  CYAN=""; GREEN=""; YELLOW=""; RED=""; RESET=""
fi

echo "${CYAN}=== AMVerge Fedora Installer ===${RESET}"

TARGET="${1:-}"

# 1. If user provided a specific file
if [ -n "$TARGET" ]; then
  if [ ! -f "$TARGET" ]; then
    echo "${RED}Error: File '$TARGET' not found.${RESET}" >&2
    exit 1
  fi
  case "$TARGET" in
    *.rpm)
      echo "Installing RPM package: ${GREEN}$TARGET${RESET}"
      sudo dnf install -y "$TARGET"
      echo "${GREEN}AMVerge installed successfully!${RESET}"
      exit 0
      ;;
    *.AppImage)
      echo "Setting up AppImage: ${GREEN}$TARGET${RESET}"
      echo "Installing required runtime libraries (WebKit, GTK3, FUSE)..."
      sudo dnf install -y webkit2gtk4.1 gtk3 fuse-libs
      chmod +x "$TARGET"
      echo "${GREEN}AppImage ready!${RESET} Run it with: $TARGET"
      exit 0
      ;;
    *)
      echo "${RED}Unsupported file format. Please provide an .rpm or .AppImage file.${RESET}" >&2
      exit 1
      ;;
  esac
fi

# 2. Auto-detect .rpm in current directory
RPM_FILE="$(find . -maxdepth 1 -name "*.rpm" 2>/dev/null | head -n 1 || true)"
if [ -n "$RPM_FILE" ] && [ -f "$RPM_FILE" ]; then
  echo "Found local RPM package: ${GREEN}$RPM_FILE${RESET}"
  echo "Installing via DNF..."
  sudo dnf install -y "$RPM_FILE"
  echo ""
  echo "${GREEN}AMVerge installed successfully!${RESET}"
  echo "Launch it from your application menu or run 'amverge'."
  exit 0
fi

# 3. Auto-detect .AppImage in current directory
APPIMAGE_FILE="$(find . -maxdepth 1 -name "*.AppImage" 2>/dev/null | head -n 1 || true)"
if [ -n "$APPIMAGE_FILE" ] && [ -f "$APPIMAGE_FILE" ]; then
  echo "Found local AppImage: ${GREEN}$APPIMAGE_FILE${RESET}"
  echo "Installing required runtime libraries (WebKit, GTK3, FUSE)..."
  sudo dnf install -y webkit2gtk4.1 gtk3 fuse-libs
  chmod +x "$APPIMAGE_FILE"
  echo ""
  echo "${GREEN}AppImage ready!${RESET}"
  echo "Launch it by running: $APPIMAGE_FILE"
  exit 0
fi

echo "${YELLOW}No .rpm or .AppImage package found in current directory.${RESET}"
echo "Usage:"
echo "  1. Download the AMVerge .rpm package into this folder"
echo "  2. Run: ./install-fedora.sh"
echo "  Or specify the path: ./install-fedora.sh /path/to/amverge.rpm"
exit 1
