#!/usr/bin/env node
/**
 * prepare-bundle.mjs — Create a self-contained app-bundle for Electron packaging.
 *
 * pnpm's node_modules use symlinks that break when copied by electron-builder.
 * This script uses `pnpm deploy` to create flat, symlink-free copies of each
 * package with all dependencies resolved.
 *
 * Usage: node packages/desktop/scripts/prepare-bundle.mjs
 * Must be run from the repo root.
 */

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve repo root from this script's location:
// scripts/prepare-bundle.mjs → packages/desktop/scripts/ → repo root is ../../..
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

// Change to repo root so all paths are consistent
process.chdir(REPO_ROOT);
console.log(`[prepare-bundle] Working directory: ${process.cwd()}`);

const BUNDLE_DIR = join('packages', 'desktop', 'app-bundle');

function run(cmd) {
  console.log(`  > ${cmd}`);
  execSync(cmd, { stdio: 'inherit', shell: true });
}

function copyDir(src, dest) {
  if (!existsSync(src)) {
    console.error(`  SKIP (not found): ${src}`);
    return;
  }
  cpSync(src, dest, { recursive: true });
}

// ── Clean ──
console.log('[prepare-bundle] Cleaning old bundle...');
if (existsSync(BUNDLE_DIR)) {
  rmSync(BUNDLE_DIR, { recursive: true, force: true });
}
mkdirSync(BUNDLE_DIR, { recursive: true });

// ── 1. Deploy API ──
console.log('[prepare-bundle] Deploying @cat-cafe/api...');
run(`pnpm --filter @cat-cafe/api deploy "${join(BUNDLE_DIR, 'api')}" --prod`);
copyDir(join('packages', 'api', 'dist'), join(BUNDLE_DIR, 'api', 'dist'));

// ── 2. Deploy shared ──
console.log('[prepare-bundle] Deploying @cat-cafe/shared...');
run(`pnpm --filter @cat-cafe/shared deploy "${join(BUNDLE_DIR, 'shared')}" --prod`);
copyDir(join('packages', 'shared', 'dist'), join(BUNDLE_DIR, 'shared', 'dist'));

// ── 3. Deploy Web ──
console.log('[prepare-bundle] Deploying @cat-cafe/web...');
run(`pnpm --filter @cat-cafe/web deploy "${join(BUNDLE_DIR, 'web')}" --prod`);
copyDir(join('packages', 'web', '.next'), join(BUNDLE_DIR, 'web', '.next'));
copyDir(join('packages', 'web', 'public'), join(BUNDLE_DIR, 'web', 'public'));
copyDir(join('packages', 'web', 'next.config.js'), join(BUNDLE_DIR, 'web', 'next.config.js'));

// ── 4. Configs ──
console.log('[prepare-bundle] Copying configs...');
copyDir('cat-config.lite.json', join(BUNDLE_DIR, 'cat-config.lite.json'));
copyDir('cat-config.json', join(BUNDLE_DIR, 'cat-config.json'));

// ── 5. Verify ──
console.log('[prepare-bundle] Verifying bundle...');
const required = [
  join(BUNDLE_DIR, 'api', 'dist', 'index.js'),
  join(BUNDLE_DIR, 'api', 'package.json'),
  join(BUNDLE_DIR, 'web', 'node_modules', 'next', 'dist', 'bin', 'next'),
  join(BUNDLE_DIR, 'cat-config.lite.json'),
];

let missing = 0;
for (const f of required) {
  if (!existsSync(f)) {
    console.error(`  MISSING: ${f}`);
    missing++;
  }
}

if (missing > 0) {
  console.error('[prepare-bundle] ERROR: Bundle verification failed!');
  process.exit(1);
}

console.log('[prepare-bundle] Bundle ready.');
