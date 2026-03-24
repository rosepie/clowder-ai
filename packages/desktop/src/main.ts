import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { ChildProcess, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Single-instance lock — MUST be first
// Prevents fork-bomb: if this is a second instance, quit immediately.
// ---------------------------------------------------------------------------

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Root of the packaged app (or repo root in dev) */
function getAppRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app-bundle');
  }
  // dev: packages/desktop → repo root
  return resolve(__dirname, '..', '..', '..');
}

/** User data dir (persists across updates) */
function getUserDataDir(): string {
  return app.getPath('userData');
}

function getConfigPath(): string {
  return join(getUserDataDir(), 'config.json');
}

// ---------------------------------------------------------------------------
// User config (API key, ports, etc.)
// ---------------------------------------------------------------------------

interface UserConfig {
  apiKey: string;
  baseUrl: string;
  frontendPort: number;
  apiPort: number;
  setupComplete: boolean;
}

const DEFAULT_CONFIG: UserConfig = {
  apiKey: '',
  baseUrl: 'https://api.anthropic.com',
  frontendPort: 3003,
  apiPort: 3004,
  setupComplete: false,
};

function loadConfig(): UserConfig {
  const p = getConfigPath();
  if (!existsSync(p)) return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(p, 'utf-8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(cfg: UserConfig): void {
  const dir = getUserDataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2));
}

// ---------------------------------------------------------------------------
// Copy lite cat-config into user data (first run)
// ---------------------------------------------------------------------------

function ensureLiteCatConfig(): void {
  const dest = join(getUserDataDir(), 'cat-config.json');
  if (existsSync(dest)) return;
  const src = join(getAppRoot(), 'cat-config.lite.json');
  if (existsSync(src)) {
    const dir = getUserDataDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    copyFileSync(src, dest);
  }
}

// ---------------------------------------------------------------------------
// Backend processes
// ---------------------------------------------------------------------------

let apiProcess: ChildProcess | null = null;
let nextProcess: ChildProcess | null = null;

/**
 * Build env for child processes.
 * CRITICAL: ELECTRON_RUN_AS_NODE=1 makes process.execPath (the Electron
 * binary) behave as plain Node.js. Without this, spawn(process.execPath, ...)
 * launches another Electron window → infinite fork bomb.
 */
function childEnv(extra: Record<string, string>): Record<string, string> {
  return {
    ...process.env as Record<string, string>,
    ELECTRON_RUN_AS_NODE: '1',
    ...extra,
  };
}

function startApiServer(cfg: UserConfig): void {
  const appRoot = getAppRoot();
  const apiEntry = join(appRoot, 'packages', 'api', 'dist', 'index.js');

  if (!existsSync(apiEntry)) {
    dialog.showErrorBox(
      'API Server Not Found',
      `Cannot find API entry at:\n${apiEntry}\n\nPlease reinstall the application.`,
    );
    app.quit();
    return;
  }

  const catConfigPath = join(getUserDataDir(), 'cat-config.json');
  const apiDir = join(appRoot, 'packages', 'api');

  const env = childEnv({
    NODE_ENV: 'production',
    API_SERVER_PORT: String(cfg.apiPort),
    FRONTEND_PORT: String(cfg.frontendPort),
    NEXT_PUBLIC_API_URL: `http://localhost:${cfg.apiPort}`,
    MEMORY_STORE: '1',
    CAT_CAFE_DISABLE_SHARED_STATE_PREFLIGHT: '1',
    ANTHROPIC_API_KEY: cfg.apiKey,
    ...(existsSync(catConfigPath) ? { CAT_CONFIG_PATH: catConfigPath } : {}),
  });

  apiProcess = spawn(process.execPath, [apiEntry], {
    cwd: apiDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  apiProcess.stdout?.on('data', (d: Buffer) => {
    console.log(`[api] ${d.toString().trim()}`);
  });
  apiProcess.stderr?.on('data', (d: Buffer) => {
    console.error(`[api:err] ${d.toString().trim()}`);
  });
  apiProcess.on('exit', (code) => {
    console.log(`[api] exited with code ${code}`);
    apiProcess = null;
  });
}

function startNextServer(cfg: UserConfig): void {
  const appRoot = getAppRoot();
  const webDir = join(appRoot, 'packages', 'web');
  // Resolve the actual Next.js CLI .js file (not the .bin shim which is .cmd on Windows)
  const nextCli = join(webDir, 'node_modules', 'next', 'dist', 'bin', 'next');

  if (!existsSync(nextCli)) {
    console.error(`[web] Next.js CLI not found at: ${nextCli}`);
    return;
  }

  const env = childEnv({
    NODE_ENV: 'production',
    PORT: String(cfg.frontendPort),
    NEXT_PUBLIC_API_URL: `http://localhost:${cfg.apiPort}`,
  });

  nextProcess = spawn(process.execPath, [nextCli, 'start', '-p', String(cfg.frontendPort)], {
    cwd: webDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  nextProcess.stdout?.on('data', (d: Buffer) => {
    console.log(`[web] ${d.toString().trim()}`);
  });
  nextProcess.stderr?.on('data', (d: Buffer) => {
    console.error(`[web:err] ${d.toString().trim()}`);
  });
  nextProcess.on('exit', (code) => {
    console.log(`[web] exited with code ${code}`);
    nextProcess = null;
  });
}

function stopBackendProcesses(): void {
  if (apiProcess) {
    apiProcess.kill();
    apiProcess = null;
  }
  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;

function createSetupWindow(): void {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 480,
    resizable: false,
    title: 'Cat Cafe — Setup',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(join(__dirname, '..', 'resources', 'setup.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createMainWindow(cfg: UserConfig): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Cat Cafe',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const url = `http://localhost:${cfg.frontendPort}`;
  loadWithRetry(url, 30);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/** Retry loading the frontend URL until the Next.js server is ready */
function loadWithRetry(url: string, retriesLeft: number): void {
  if (!mainWindow) return;
  mainWindow.loadURL(url).catch(() => {
    if (retriesLeft > 0 && mainWindow) {
      setTimeout(() => loadWithRetry(url, retriesLeft - 1), 1000);
    } else if (mainWindow) {
      // Show error in the window instead of a blocking dialog
      mainWindow.loadURL(`data:text/html,
        <html><body style="background:#1a1a2e;color:#e0e0e0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center">
          <h2>Startup Failed</h2>
          <p>Could not connect to frontend at ${url} after 30 seconds.</p>
          <p style="color:#888">Check if the API and Next.js servers started correctly.</p>
        </div></body></html>
      `.replace(/\n\s*/g, ''));
    }
  });
}

// ---------------------------------------------------------------------------
// IPC handlers (setup wizard)
// ---------------------------------------------------------------------------

ipcMain.handle('config:load', () => loadConfig());

ipcMain.handle('config:save', (_event, cfg: UserConfig) => {
  cfg.setupComplete = true;
  saveConfig(cfg);
  return true;
});

ipcMain.handle('config:start-app', () => {
  const cfg = loadConfig();
  if (!cfg.setupComplete) return false;
  ensureLiteCatConfig();
  startApiServer(cfg);
  startNextServer(cfg);
  if (mainWindow) {
    mainWindow.close();
  }
  createMainWindow(cfg);
  return true;
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.on('second-instance', () => {
  // Focus existing window when user tries to open a second instance
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  const cfg = loadConfig();
  if (!cfg.setupComplete) {
    createSetupWindow();
  } else {
    ensureLiteCatConfig();
    startApiServer(cfg);
    startNextServer(cfg);
    createMainWindow(cfg);
  }
});

app.on('window-all-closed', () => {
  stopBackendProcesses();
  app.quit();
});

app.on('before-quit', () => {
  stopBackendProcesses();
});
