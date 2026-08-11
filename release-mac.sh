#!/usr/bin/env bash
set -euo pipefail

# ── release-mac.sh ──────────────────────────────────────────────────
# Build & package Kod for macOS.
#
# Usage:
#   bash release-mac.sh              # build DMG only (no publish, no notarize)
#   bash release-mac.sh --publish    # build + publish to auto-update channel
#   bash release-mac.sh --notarize   # build + notarize (requires $APPLE_ID etc.)
#   bash release-mac.sh --arch arm64 # target single arch (default: universal)
#   bash release-mac.sh --publish --notarize --arch x64
#
# Environment (required for --notarize):
#   APPLE_ID          – Apple ID email
#   APPLE_ID_PASS     – App-specific password (https://appleid.apple.com)
#   APPLE_TEAM_ID     – Developer team ID (https://developer.apple.com/account)
#
# Environment (required for --publish):
#   AWS_ACCESS_KEY_ID     – R2 access key
#   AWS_SECRET_ACCESS_KEY – R2 secret key
#   UPDATE_CHANNEL        – release channel (default: latest)
# ─────────────────────────────────────────────────────────────────────

ARCH="universal"
PUBLISH="false"
NOTARIZE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch)     ARCH="$2"; shift 2 ;;
    --publish)  PUBLISH="true"; shift ;;
    --notarize) NOTARIZE="true"; shift ;;
    --help|-h)
      echo "Usage: bash release-mac.sh [--arch arm64|x64|universal] [--publish] [--notarize]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# ── Pre-flight checks ───────────────────────────────────────────────

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "⚠️  release-mac.sh is intended to run on macOS (code signing requires it)."
  echo "   Use the GitHub Actions workflow (.github/workflows/build-macos.yml) on CI."
fi

# ── Build ────────────────────────────────────────────────────────────

echo "🔨 Building Kod (renderer + main + preload)..."
pnpm run build

# ── Package ──────────────────────────────────────────────────────────

ARCH_FLAG=()
case "$ARCH" in
  universal) ;;
  arm64)     ARCH_FLAG=(--arm64) ;;
  x64)       ARCH_FLAG=(--x64) ;;
  *)
    echo "❌ Unknown arch: $ARCH (expected: arm64, x64, universal)"
    exit 1
    ;;
esac

echo "📦 Packaging for macOS ($ARCH)..."

if [[ "$NOTARIZE" == "true" ]]; then
  if [[ -z "${APPLE_ID:-}" || -z "${APPLE_ID_PASS:-}" || -z "${APPLE_TEAM_ID:-}" ]]; then
    echo "❌ --notarize requires APPLE_ID, APPLE_ID_PASS, and APPLE_TEAM_ID env vars."
    exit 1
  fi
  echo "   Notarization enabled"
fi

if [[ "$PUBLISH" == "true" ]]; then
  echo "🚀 Publishing to update channel: ${UPDATE_CHANNEL:-latest}"
  npx electron-builder build --mac "${ARCH_FLAG[@]}" --publish always
else
  npx electron-builder build --mac "${ARCH_FLAG[@]}" --publish never
fi

# ── Done ─────────────────────────────────────────────────────────────

echo ""
echo "✅ Done! Output:"
find release/build -name "*.dmg" -o -name "latest-mac.yml" 2>/dev/null || echo "   (no artifacts found)"
