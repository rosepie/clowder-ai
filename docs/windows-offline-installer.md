# Windows Offline Installer

This project now supports building a self-contained Windows `.exe` installer for offline environments.

The installer payload is runtime-only. It intentionally excludes repository-only development files such as:

- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`
- source trees like `packages/*/src`
- test trees like `packages/*/test`
- type declarations and sourcemaps from deployed package payloads where they are not needed at runtime

## What the installer includes

- Prebuilt `packages/api`, `packages/mcp-server`, and `packages/web`
- Production runtime dependencies from `pnpm deploy`
- A bundled Windows Node runtime under `tools/node`
- A bundled portable Redis runtime under `.cat-cafe/redis/windows/current`
- A bundled `WebView2` desktop launcher (`ClowderAI.Desktop.exe`)
- Project sources, docs, scripts, and `cat-cafe-skills`

The installed app does not need to run `pnpm install`, download Node, or fetch Redis again.

## Build the offline bundle

```bash
pnpm package:windows:bundle
```

Output:

- Bundle root: `dist/windows/bundle`

This step builds the package-local runtime layout but does not create an `.exe`.

## Build the `.exe` installer

Requirements on the build machine:

- `makensis` available on `PATH`
- Network access for the build step, unless you override the Node/Redis download URLs with local mirrors

Command:

```bash
pnpm package:windows
```

Output:

- Installer: `dist/windows/ClowderAI-<version>-windows-x64-setup.exe`

## Optional overrides

You can point the builder at internal mirrors or pinned archives:

```bash
CLOWDER_WINDOWS_NODE_VERSION=v22.20.0 \
CLOWDER_WINDOWS_NODE_ZIP_URL=https://mirror.example/node-v22.20.0-win-x64.zip \
CLOWDER_WINDOWS_REDIS_ZIP_URL=https://mirror.example/Redis-8.2.1-Windows-x64-msys2.zip \
pnpm package:windows
```

## Install, upgrade, uninstall

- Default install path: `C:\CAI`
- Upgrade: rerun a newer installer and install into the same directory
- Start: desktop shortcut or Start Menu shortcut
- Stop: Start Menu shortcut or `scripts\stop-windows.ps1`

The installer intentionally defaults to a short path because the bundled production dependency tree includes some long `pnpm` paths. If you change the destination, keep it short; the installer now blocks paths that would exceed Windows path limits for this build.

The desktop shortcut opens `ClowderAI.Desktop.exe`, which:

- starts local services with `scripts/start-windows.ps1 -Quick`
- waits for the frontend to become ready
- opens the app in a dedicated `WebView2` window
- stops managed services again when the desktop window exits

The installer and uninstaller preserve mutable runtime state:

- `.env`
- `cat-config.json`
- `data/`
- `logs/`
- `.cat-cafe/`

This means upgrades do not wipe local Redis/SQLite state, and uninstall removes the binaries while leaving user data behind.
