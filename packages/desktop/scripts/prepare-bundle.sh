#!/usr/bin/env bash
# prepare-bundle.sh — Create a self-contained app-bundle for Electron packaging.
#
# pnpm's node_modules use symlinks that break when copied by electron-builder.
# This script uses `pnpm deploy` to create flat, symlink-free copies of each
# package with all dependencies resolved.
#
# Usage: bash packages/desktop/scripts/prepare-bundle.sh
# Must be run from the repo root.

set -euo pipefail

BUNDLE_DIR="packages/desktop/app-bundle"

echo "[prepare-bundle] Cleaning old bundle..."
rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR"

# ── 1. Deploy API (with all native deps resolved for current platform) ──
echo "[prepare-bundle] Deploying @cat-cafe/api..."
pnpm --filter @cat-cafe/api deploy "$BUNDLE_DIR/api" --prod
# Copy built dist (pnpm deploy only copies src + node_modules)
cp -r packages/api/dist "$BUNDLE_DIR/api/dist"

# ── 2. Deploy shared ──
echo "[prepare-bundle] Deploying @cat-cafe/shared..."
pnpm --filter @cat-cafe/shared deploy "$BUNDLE_DIR/shared" --prod
cp -r packages/shared/dist "$BUNDLE_DIR/shared/dist"

# ── 3. Deploy Web (Next.js) ──
echo "[prepare-bundle] Deploying @cat-cafe/web..."
pnpm --filter @cat-cafe/web deploy "$BUNDLE_DIR/web" --prod
# Copy the Next.js build output
cp -r packages/web/.next "$BUNDLE_DIR/web/.next"
cp -r packages/web/public "$BUNDLE_DIR/web/public"
cp packages/web/next.config.js "$BUNDLE_DIR/web/next.config.js"

# ── 4. Copy configs ──
echo "[prepare-bundle] Copying configs..."
cp cat-config.lite.json "$BUNDLE_DIR/"
cp cat-config.json "$BUNDLE_DIR/"

# ── 5. Verify key files exist ──
echo "[prepare-bundle] Verifying bundle..."
MISSING=0
for f in \
  "$BUNDLE_DIR/api/dist/index.js" \
  "$BUNDLE_DIR/api/package.json" \
  "$BUNDLE_DIR/web/.next/BUILD_ID" \
  "$BUNDLE_DIR/web/node_modules/next/dist/bin/next" \
  "$BUNDLE_DIR/cat-config.lite.json"
do
  if [ ! -f "$f" ]; then
    echo "  MISSING: $f"
    MISSING=1
  fi
done

if [ "$MISSING" -eq 1 ]; then
  echo "[prepare-bundle] ERROR: Bundle verification failed!"
  exit 1
fi

# Show bundle size
echo "[prepare-bundle] Bundle ready:"
du -sh "$BUNDLE_DIR"
du -sh "$BUNDLE_DIR"/*
echo "[prepare-bundle] Done."
