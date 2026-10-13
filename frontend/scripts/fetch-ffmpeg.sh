#!/usr/bin/env bash
# Stage ffmpeg/ffprobe into frontend/.ffmpeg-bin for the sidecar build.
#
# Binaries come from a pinned GitHub release in this repo (FFMPEG_BINS_TAG),
# not from third-party mirrors, and every zip is checked against the
# checksums committed in ffmpeg-bins.sha256.
#
# Usage: fetch-ffmpeg.sh <macos-arm64|macos-x86_64|windows-x86_64>
# Needs: gh CLI with GH_TOKEN set (preinstalled on GitHub-hosted runners).
#
# Updating ffmpeg: upload new zips to a new ffmpeg-bins-<version> release
# (prerelease, NOT latest: the Tauri updater reads releases/latest), then bump
# FFMPEG_VERSION below and the checksums file.
set -euo pipefail

FFMPEG_VERSION="9.0.2"
FFMPEG_BINS_TAG="ffmpeg-bins-${FFMPEG_VERSION}"

PLATFORM="${1:?usage: fetch-ffmpeg.sh <macos-arm64|macos-x86_64|windows-x86_64>}"
case "$PLATFORM" in
  macos-arm64)    EXPECT_ARCH="arm64";  EXE="" ;;
  macos-x86_64)   EXPECT_ARCH="x86_64"; EXE="" ;;
  windows-x86_64) EXPECT_ARCH="x86-64"; EXE=".exe" ;;
  *) echo "Unknown platform: $PLATFORM" >&2; exit 1 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FFMPEG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/.ffmpeg-bin"
ASSET="ffmpeg-${FFMPEG_VERSION}-${PLATFORM}.zip"
REPO="${GITHUB_REPOSITORY:-AMVerge-team/AMVerge}"

mkdir -p "$FFMPEG_DIR"

if [ -f "$FFMPEG_DIR/ffmpeg$EXE" ] && [ -f "$FFMPEG_DIR/ffprobe$EXE" ]; then
  echo "ffmpeg already staged in $FFMPEG_DIR (cache hit), skipping download"
else
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT

  echo "Downloading $ASSET from $REPO release $FFMPEG_BINS_TAG"
  gh release download "$FFMPEG_BINS_TAG" -R "$REPO" -p "$ASSET" -D "$TMP_DIR"

  EXPECTED_SHA="$(grep " $ASSET\$" "$SCRIPT_DIR/ffmpeg-bins.sha256" | awk '{print $1}')"
  [ -n "$EXPECTED_SHA" ] || { echo "No checksum for $ASSET in ffmpeg-bins.sha256" >&2; exit 1; }
  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_SHA="$(sha256sum "$TMP_DIR/$ASSET" | awk '{print $1}')"
  else
    ACTUAL_SHA="$(shasum -a 256 "$TMP_DIR/$ASSET" | awk '{print $1}')"
  fi
  if [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
    echo "Checksum mismatch for $ASSET: expected $EXPECTED_SHA, got $ACTUAL_SHA" >&2
    exit 1
  fi

  unzip -j -o "$TMP_DIR/$ASSET" -d "$FFMPEG_DIR"
fi

chmod +x "$FFMPEG_DIR/ffmpeg$EXE" "$FFMPEG_DIR/ffprobe$EXE"

echo "Validating FFmpeg architecture for $PLATFORM"
if command -v file >/dev/null 2>&1; then
  for tool in ffmpeg ffprobe; do
    INFO="$(file "$FFMPEG_DIR/$tool$EXE")"
    echo "$INFO"
    echo "$INFO" | grep -q "$EXPECT_ARCH" || { echo "$tool arch mismatch: expected $EXPECT_ARCH" >&2; exit 1; }
  done
else
  echo "'file' not available; skipping arch check (zip checksum already verified)"
fi

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "FFMPEG_BIN_DIR=$FFMPEG_DIR" >> "$GITHUB_ENV"
fi
