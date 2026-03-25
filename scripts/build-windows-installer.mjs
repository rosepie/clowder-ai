import { spawnSync } from 'node:child_process';
import {
  cpSync,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep, win32 } from 'node:path';
import process from 'node:process';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const DEFAULT_WEBVIEW2_VERSION = process.env.CLOWDER_WEBVIEW2_VERSION ?? '1.0.3856.49';
const WINDOWS_RUNTIME_NPM_ARGS = ['install', '--omit=dev', '--no-audit', '--no-fund', '--package-lock=false', '--loglevel=error'];

export const WINDOWS_PRESERVE_PATHS = ['.env', 'cat-config.json', 'data', 'logs', '.cat-cafe'];
export const WINDOWS_MANAGED_TOP_LEVEL_PATHS = [
  'packages',
  'scripts',
  'cat-cafe-skills',
  'tools',
  'installer-seed',
  'vendor',
  '.clowder-release.json',
  '.env.example',
  'LICENSE',
  'cat-template.json',
];

const EXCLUDED_TOP_LEVEL_SEGMENTS = new Set(['.git', 'node_modules']);
const EXCLUDED_EXACT_PATHS = new Set([
  '.env',
  'data',
  'logs',
  'dist',
  'packages/api/dist',
  'packages/mcp-server/dist',
  'packages/web/.next',
]);
const EXCLUDED_PREFIXES = [
  'data/',
  'logs/',
  'dist/',
  'packages/api/dist/',
  'packages/mcp-server/dist/',
  'packages/web/.next/',
];
const RUNTIME_SCRIPT_FILES = [
  'install-windows-helpers.ps1',
  'start-windows.ps1',
  'start.bat',
  'stop-windows.ps1',
  'windows-command-helpers.ps1',
  'windows-installer-ui.ps1',
];
const RUNTIME_WEB_NEXT_CONFIG = `function resolveApiBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_API_URL?.replace(/\\/+$/, '');
  if (explicit) return explicit;

  const apiPort = Number(process.env.API_SERVER_PORT);
  if (Number.isInteger(apiPort) && apiPort > 0) {
    return \`http://localhost:\${apiPort}\`;
  }

  const frontendPort = Number(process.env.FRONTEND_PORT);
  if (Number.isInteger(frontendPort) && frontendPort > 0) {
    return \`http://localhost:\${frontendPort + 1}\`;
  }

  return 'http://localhost:3004';
}

const apiBaseUrl = resolveApiBaseUrl();

module.exports = {
  reactStrictMode: true,
  output: 'standalone',
  allowedDevOrigins: ['100.0.0.0/8'],
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: \`\${apiBaseUrl}/uploads/:path*\`,
      },
    ];
  },
};
`;

export function normalizeNodeVersion(version) {
  const trimmed = String(version ?? '').trim();
  if (!trimmed) {
    throw new Error('Windows Node version is empty');
  }
  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`;
}

export function pickRedisReleaseAsset(assets) {
  const candidates = [
    /^Redis-.*-Windows-x64-msys2\.zip$/i,
    /^Redis-.*-Windows-x64-cygwin\.zip$/i,
    /^Redis-.*-Windows-x64-msys2-with-Service\.zip$/i,
    /^Redis-.*-Windows-x64-cygwin-with-Service\.zip$/i,
  ];
  for (const pattern of candidates) {
    const asset = assets.find((entry) => pattern.test(entry.name ?? ''));
    if (asset) {
      return asset;
    }
  }
  return null;
}

export function shouldCopyRepoPath(relativePath) {
  const normalized = relativePath.split(sep).join('/');
  if (!normalized || normalized === '.') return true;
  const segments = normalized.split('/');
  if (segments.some((segment) => EXCLUDED_TOP_LEVEL_SEGMENTS.has(segment))) return false;
  if (EXCLUDED_EXACT_PATHS.has(normalized)) return false;
  return !EXCLUDED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function parseArgs(argv) {
  const options = {
    bundleOnly: false,
    skipBuild: false,
    outputDir: resolve(repoRoot, 'dist', 'windows'),
    cacheDir: null,
    nodeVersion: normalizeNodeVersion(process.env.CLOWDER_WINDOWS_NODE_VERSION ?? process.versions.node),
    nodeZipUrl: process.env.CLOWDER_WINDOWS_NODE_ZIP_URL ?? null,
    redisZipUrl: process.env.CLOWDER_WINDOWS_REDIS_ZIP_URL ?? null,
    webview2Version: DEFAULT_WEBVIEW2_VERSION,
    redisReleaseApi:
      process.env.CLOWDER_WINDOWS_REDIS_RELEASE_API ??
      'https://api.github.com/repos/redis-windows/redis-windows/releases/latest',
  };
  const handlers = new Map([
    [
      '--bundle-only',
      () => {
        options.bundleOnly = true;
        return 0;
      },
    ],
    [
      '--skip-build',
      () => {
        options.skipBuild = true;
        return 0;
      },
    ],
    [
      '--output-dir',
      (value) => {
        options.outputDir = resolve(repoRoot, value ?? '');
        return 1;
      },
    ],
    [
      '--cache-dir',
      (value) => {
        options.cacheDir = resolve(repoRoot, value ?? '');
        return 1;
      },
    ],
    [
      '--node-version',
      (value) => {
        options.nodeVersion = normalizeNodeVersion(value ?? '');
        return 1;
      },
    ],
    [
      '--node-zip-url',
      (value) => {
        options.nodeZipUrl = value ?? null;
        return 1;
      },
    ],
    [
      '--redis-zip-url',
      (value) => {
        options.redisZipUrl = value ?? null;
        return 1;
      },
    ],
    [
      '--webview2-version',
      (value) => {
        options.webview2Version = value ?? options.webview2Version;
        return 1;
      },
    ],
    [
      '--redis-release-api',
      (value) => {
        options.redisReleaseApi = value ?? options.redisReleaseApi;
        return 1;
      },
    ],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    const handler = handlers.get(arg);
    if (!handler) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    index += handler(argv[index + 1]);
  }
  if (!options.cacheDir) {
    options.cacheDir = join(options.outputDir, 'cache');
  }
  return options;
}

function printUsage() {
  process.stdout.write(`Usage: node scripts/build-windows-installer.mjs [options]

Options:
  --bundle-only         Build the offline bundle without invoking makensis
  --skip-build          Reuse existing dist/.next artifacts
  --output-dir <path>   Override dist/windows output root
  --cache-dir <path>    Override download cache directory
  --node-version <ver>  Override bundled Windows Node version
  --node-zip-url <url>  Override Node zip URL
  --redis-zip-url <url> Override Redis zip URL
  --webview2-version <ver>
                        Override the WebView2 SDK version used for the desktop launcher build
  --redis-release-api <url>
                        Override Redis release metadata endpoint
`);
}

function logStep(message) {
  process.stdout.write(`\n[windows-installer] ${message}\n`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.stdio ?? 'inherit',
    shell: false,
    env: { ...process.env, ...(options.env ?? {}) },
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function runAndCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: 'pipe',
    shell: false,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  }
  return (result.stdout ?? '').trim();
}

function commandExists(command) {
  if (command.includes('/') || command.includes('\\')) {
    return existsSync(command);
  }
  const probeCommand = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(probeCommand, [command], { stdio: 'ignore' });
  return result.status === 0;
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function resetDir(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

function toWindowsPath(path) {
  if (process.platform === 'win32') {
    return path;
  }
  if (!commandExists('wslpath')) {
    throw new Error('wslpath is required to build the Windows WebView2 launcher from Linux');
  }
  return runAndCapture('wslpath', ['-w', path]);
}

function toWslPath(path) {
  if (process.platform === 'win32') {
    return path;
  }
  if (!commandExists('wslpath')) {
    throw new Error('wslpath is required to access Windows staging paths from Linux');
  }
  return runAndCapture('wslpath', ['-u', path]);
}

function toNsisPath(path) {
  return path.replaceAll('\\', '/').replace(/\/?$/, '/');
}

function toNsisFilePath(path) {
  return path.replaceAll('\\', '/');
}

function toNsisDirPath(path) {
  return path.replaceAll('/', '\\').replace(/[\\\/]+$/, '');
}

function copyEntry(source, destination) {
  cpSync(source, destination, {
    recursive: true,
    force: true,
    filter(src) {
      const rel = relative(repoRoot, src);
      return shouldCopyRepoPath(rel);
    },
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createIcoFromPng(pngPath, icoPath) {
  const png = readFileSync(pngPath);
  const pngSignature = '89504e470d0a1a0a';
  if (png.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error(`Unsupported PNG icon source: ${pngPath}`);
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = width >= 256 ? 0 : width;
  header[7] = height >= 256 ? 0 : height;
  header[8] = 0;
  header[9] = 0;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  writeFileSync(icoPath, Buffer.concat([header, png]));
}

function copyTopLevelProject(bundleDir) {
  const entries = ['cat-cafe-skills', 'LICENSE', '.env.example', 'cat-template.json', 'vendor'];
  for (const entry of entries) {
    const source = join(repoRoot, entry);
    if (!existsSync(source)) {
      if (entry === 'vendor') {
        continue;
      }
      throw new Error(`Missing required bundle entry: ${source}`);
    }
    const destination = join(bundleDir, entry);
    ensureDir(dirname(destination));
    copyEntry(source, destination);
  }

  const scriptsDir = join(bundleDir, 'scripts');
  ensureDir(scriptsDir);
  for (const scriptName of RUNTIME_SCRIPT_FILES) {
    const source = join(repoRoot, 'scripts', scriptName);
    if (!existsSync(source)) {
      throw new Error(`Missing runtime script: ${source}`);
    }
    cpSync(source, join(scriptsDir, scriptName), { force: true });
  }
}

function stageInstallerSeed(bundleDir) {
  const seedDir = join(bundleDir, 'installer-seed');
  ensureDir(seedDir);
  const catConfigPath = join(repoRoot, 'cat-config.json');
  if (existsSync(catConfigPath)) {
    cpSync(catConfigPath, join(seedDir, 'cat-config.json'), { force: true });
  }
}

function copyIfPresent(source, destination) {
  if (!existsSync(source)) {
    return;
  }
  ensureDir(dirname(destination));
  cpSync(source, destination, { recursive: true, force: true });
}

function walkFiles(rootDir, visitor) {
  if (!existsSync(rootDir)) {
    return;
  }
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      visitor(fullPath, entry);
    }
  }
}

function removePaths(rootDir, relativePaths) {
  for (const relativePath of relativePaths) {
    rmSync(join(rootDir, relativePath), { recursive: true, force: true });
  }
}

function removeNamedDirectoriesRecursive(rootDir, directoryNames) {
  if (!existsSync(rootDir)) {
    return;
  }
  const names = new Set(directoryNames);
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const fullPath = join(current, entry.name);
      if (names.has(entry.name)) {
        rmSync(fullPath, { recursive: true, force: true });
        continue;
      }
      stack.push(fullPath);
    }
  }
}

function pruneRuntimePackage(targetDir, options = {}) {
  removePaths(targetDir, options.removePaths ?? []);
  removeNamedDirectoriesRecursive(targetDir, ['test', 'tests', '__tests__']);
  walkFiles(targetDir, (fullPath, entry) => {
    const fileName = entry.name;
    if (fileName === 'package-lock.json' || fileName === '.package-lock.json') {
      rmSync(fullPath, { force: true });
      return;
    }
    if (fileName.endsWith('.d.ts') || fileName.endsWith('.d.ts.map') || fileName.endsWith('.map')) {
      rmSync(fullPath, { force: true });
      return;
    }
    if (/^(README|CHANGELOG|CONTRIBUTING)(\..+)?$/i.test(fileName)) {
      rmSync(fullPath, { force: true });
    }
  });
}

function createRuntimePackageJson(sourcePath, options = {}) {
  const source = readJson(sourcePath);
  const runtimePackage = {
    name: source.name,
    version: source.version,
    private: source.private ?? true,
  };

  for (const key of ['type', 'main', 'bin', 'exports', 'types']) {
    if (source[key] !== undefined) {
      runtimePackage[key] = source[key];
    }
  }

  if (options.scripts) {
    runtimePackage.scripts = options.scripts;
  } else if (source.scripts?.start) {
    runtimePackage.scripts = { start: source.scripts.start };
  }

  const dependencies = { ...(source.dependencies ?? {}) };
  if (dependencies['@cat-cafe/shared']) {
    dependencies['@cat-cafe/shared'] = 'file:../shared';
  }
  if (Object.keys(dependencies).length > 0) {
    runtimePackage.dependencies = dependencies;
  }

  if (source.optionalDependencies && Object.keys(source.optionalDependencies).length > 0) {
    runtimePackage.optionalDependencies = source.optionalDependencies;
  }

  return runtimePackage;
}

function stageRuntimePackageTemplate(targetRootDir, packageName, config) {
  const sourceDir = join(repoRoot, 'packages', packageName);
  const targetDir = join(targetRootDir, 'packages', packageName);
  resetDir(targetDir);
  for (const relativePath of config.copyPaths) {
    copyIfPresent(join(sourceDir, relativePath), join(targetDir, relativePath));
  }
  writeJson(join(targetDir, 'package.json'), createRuntimePackageJson(join(sourceDir, 'package.json'), config));
  if (config.writeFiles) {
    for (const [relativePath, content] of Object.entries(config.writeFiles)) {
      writeFileSync(join(targetDir, relativePath), content, 'utf8');
    }
  }
  pruneRuntimePackage(targetDir, { removePaths: config.removePaths ?? [] });
}

function getWindowsTempPath() {
  return runAndCapture('powershell.exe', ['-NoProfile', '-Command', '[IO.Path]::GetTempPath()']);
}

function ensureWindowsBuildNode(options) {
  const windowsTemp = getWindowsTempPath();
  const windowsNodeDir = win32.join(windowsTemp, `clowder-node-${options.nodeVersion}`);
  const windowsNodeWslDir = toWslPath(windowsNodeDir);
  const nodeRootName = `node-${options.nodeVersion}-win-x64`;
  const npmCmdPath = win32.join(windowsNodeDir, nodeRootName, 'npm.cmd');
  if (!existsSync(toWslPath(npmCmdPath))) {
    resetDir(windowsNodeWslDir);
    const archivePath = join(options.cacheDir, `node-${options.nodeVersion}-win-x64.zip`);
    extractZip(archivePath, windowsNodeWslDir);
  }
  return {
    windowsNodeDir,
    npmCmdPath,
  };
}

function escapePowerShellString(value) {
  return value.replaceAll("'", "''");
}

function runWindowsNpmInstall(npmCmdPath, packageWindowsDir) {
  run('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Set-Location '${escapePowerShellString(packageWindowsDir)}'; & '${escapePowerShellString(npmCmdPath)}' ${WINDOWS_RUNTIME_NPM_ARGS.join(' ')}`,
  ]);
}

function materializeSharedDependency(stagePackagesDir, packageName) {
  const sharedLinkPath = join(stagePackagesDir, packageName, 'node_modules', '@cat-cafe', 'shared');
  try {
    if (!lstatSync(sharedLinkPath).isSymbolicLink()) {
      return;
    }
  } catch {
    return;
  }
  rmSync(sharedLinkPath, { recursive: true, force: true });
  cpSync(join(stagePackagesDir, 'shared'), sharedLinkPath, { recursive: true, force: true });
  pruneRuntimePackage(sharedLinkPath);
}

function installWindowsRuntimeDependencies(bundleDir, options) {
  const windowsTemp = getWindowsTempPath();
  const windowsStageDir = win32.join(windowsTemp, `clowder-runtime-stage-${Date.now()}`);
  const windowsStageWslDir = toWslPath(windowsStageDir);
  const bundlePackagesDir = join(bundleDir, 'packages');
  const windowsPackagesWslDir = join(windowsStageWslDir, 'packages');
  const windowsNode = ensureWindowsBuildNode(options);

  resetDir(windowsStageWslDir);
  stageWorkspacePackages(windowsStageWslDir);

  try {
    for (const packageName of ['api', 'mcp-server', 'web']) {
      runWindowsNpmInstall(windowsNode.npmCmdPath, win32.join(windowsStageDir, 'packages', packageName));
      materializeSharedDependency(windowsPackagesWslDir, packageName);
      cpSync(
        join(windowsPackagesWslDir, packageName, 'node_modules'),
        join(bundlePackagesDir, packageName, 'node_modules'),
        { recursive: true, force: true },
      );
      pruneRuntimePackage(join(bundlePackagesDir, packageName));
    }
  } finally {
    rmSync(windowsStageWslDir, { recursive: true, force: true });
  }
}

function stageWorkspacePackages(targetRootDir) {
  stageRuntimePackageTemplate(targetRootDir, 'shared', {
    copyPaths: ['dist'],
    removePaths: ['tsconfig.json'],
  });
  stageRuntimePackageTemplate(targetRootDir, 'api', {
    copyPaths: ['dist'],
    removePaths: ['src', 'test', 'scripts', 'uploads', 'tsconfig.json'],
  });
  stageRuntimePackageTemplate(targetRootDir, 'mcp-server', {
    copyPaths: ['dist'],
    removePaths: ['src', 'test', 'tsconfig.json'],
  });
  stageRuntimePackageTemplate(targetRootDir, 'web', {
    copyPaths: ['.next', 'public'],
    removePaths: [
      'src',
      'test',
      'worker',
      '.next/cache',
      '.next/standalone',
      '.next/types',
      '.eslintrc.json',
      'next-env.d.ts',
      'postcss.config.js',
      'tailwind.config.js',
      'tsconfig.json',
      'vitest.config.ts',
    ],
    writeFiles: {
      'next.config.js': RUNTIME_WEB_NEXT_CONFIG,
    },
  });
}

function stripLeadingDirectory(targetDir, predicate) {
  const matches = [];
  const stack = [targetDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      }
      if (predicate(fullPath, entry)) {
        matches.push(fullPath);
      }
    }
  }
  if (matches.length === 0) {
    throw new Error(`Could not find expected payload in ${targetDir}`);
  }
  return matches[0];
}

async function downloadFile(url, destination) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'clowder-ai-windows-installer-builder',
      ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      accept: 'application/octet-stream, application/json',
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed for ${url}: ${response.status} ${response.statusText}`);
  }
  ensureDir(dirname(destination));
  await pipeline(response.body, createWriteStream(destination));
}

async function ensureCachedDownload(url, destination) {
  if (existsSync(destination)) {
    return destination;
  }
  await downloadFile(url, destination);
  return destination;
}

function extractZip(archivePath, destination) {
  resetDir(destination);
  const runners = [];
  if (commandExists('unzip')) {
    runners.push(['unzip', ['-q', archivePath, '-d', destination]]);
  }
  const pythonExtractArgs = [
    '-c',
    'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',
    archivePath,
    destination,
  ];
  if (commandExists('python3')) {
    runners.push(['python3', pythonExtractArgs]);
  }
  if (commandExists('python')) {
    runners.push(['python', pythonExtractArgs]);
  }
  if (process.platform === 'win32' && commandExists('py')) {
    runners.push(['py', ['-3', ...pythonExtractArgs]]);
  }
  if (commandExists('tar')) {
    runners.push(['tar', ['-xf', archivePath, '-C', destination]]);
  }
  if (process.platform === 'win32' && commandExists('powershell')) {
    runners.push([
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`,
      ],
    ]);
  }
  let lastError = null;
  for (const [command, args] of runners) {
    const result = spawnSync(command, args, { stdio: 'inherit' });
    if (result.status === 0) {
      return;
    }
    lastError = new Error(`${command} failed extracting ${archivePath}`);
  }
  throw lastError ?? new Error(`No supported zip extractor found for ${archivePath}`);
}

async function stageWindowsNode(bundleDir, options) {
  const nodeUrl =
    options.nodeZipUrl ?? `https://nodejs.org/dist/${options.nodeVersion}/node-${options.nodeVersion}-win-x64.zip`;
  const archiveName = basename(new URL(nodeUrl).pathname);
  const archivePath = join(options.cacheDir, archiveName);
  await ensureCachedDownload(nodeUrl, archivePath);

  const tempExtract = join(options.cacheDir, 'extract-node');
  extractZip(archivePath, tempExtract);
  const nodeRoot = dirname(
    stripLeadingDirectory(tempExtract, (_fullPath, entry) => entry.isFile() && entry.name.toLowerCase() === 'node.exe'),
  );
  const targetDir = join(bundleDir, 'tools', 'node');
  resetDir(targetDir);
  cpSync(nodeRoot, targetDir, { recursive: true, force: true });
  removePaths(targetDir, ['node_modules', 'corepack', 'include', 'share']);
  walkFiles(targetDir, (fullPath, entry) => {
    if (entry.name.endsWith('.map') || entry.name.endsWith('.md')) {
      rmSync(fullPath, { force: true });
    }
  });
  return { version: options.nodeVersion, url: nodeUrl, archiveName };
}

async function resolveRedisDownload(options) {
  if (options.redisZipUrl) {
    return {
      version: 'manual-override',
      url: options.redisZipUrl,
      archiveName: basename(new URL(options.redisZipUrl).pathname),
      metadataSource: 'manual-override',
    };
  }
  const response = await fetch(options.redisReleaseApi, {
    headers: {
      'user-agent': 'clowder-ai-windows-installer-builder',
      ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      accept: 'application/vnd.github+json',
    },
  });
  if (!response.ok) {
    throw new Error(`Redis release metadata request failed: ${response.status} ${response.statusText}`);
  }
  const release = await response.json();
  const asset = pickRedisReleaseAsset(release.assets ?? []);
  if (!asset?.browser_download_url) {
    throw new Error(`No Windows Redis zip asset found in ${options.redisReleaseApi}`);
  }
  return {
    version: release.tag_name ?? 'latest',
    url: asset.browser_download_url,
    archiveName: asset.name ?? basename(new URL(asset.browser_download_url).pathname),
    metadataSource: options.redisReleaseApi,
  };
}

async function stageWindowsRedis(bundleDir, options) {
  const download = await resolveRedisDownload(options);
  const archivePath = join(options.cacheDir, download.archiveName);
  await ensureCachedDownload(download.url, archivePath);

  const tempExtract = join(options.cacheDir, 'extract-redis');
  extractZip(archivePath, tempExtract);
  const redisRoot = dirname(
    stripLeadingDirectory(
      tempExtract,
      (_fullPath, entry) => entry.isFile() && entry.name.toLowerCase() === 'redis-server.exe',
    ),
  );

  const redisLayout = join(bundleDir, '.cat-cafe', 'redis', 'windows');
  const currentDir = join(redisLayout, 'current');
  resetDir(currentDir);
  cpSync(redisRoot, currentDir, { recursive: true, force: true });
  ensureDir(join(redisLayout, 'data'));
  ensureDir(join(redisLayout, 'logs'));
  writeFileSync(join(redisLayout, 'current-release.txt'), `${download.version}\n`, 'utf8');
  return download;
}

function writeReleaseMetadata(bundleDir, metadata) {
  const targetPath = join(bundleDir, '.clowder-release.json');
  const tempPath = `${targetPath}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  rmSync(targetPath, { force: true });
  cpSync(tempPath, targetPath, { force: true });
  rmSync(tempPath, { force: true });
}

function ensureRuntimeSkeleton(bundleDir) {
  ensureDir(join(bundleDir, 'data'));
  ensureDir(join(bundleDir, 'logs'));
  ensureDir(join(bundleDir, '.cat-cafe'));
}

function computeMaxRelativePathLength(bundleDir) {
  let maxLength = 0;
  const stack = [bundleDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      const relativePath = relative(bundleDir, fullPath).replaceAll('/', '\\');
      if (relativePath.length > maxLength) {
        maxLength = relativePath.length;
      }
    }
  }
  return maxLength;
}

function ensureBuildArtifacts(options) {
  if (options.skipBuild) {
    return;
  }
  logStep('Building shared, mcp-server, api, and web');
  run('pnpm', ['--filter', '@cat-cafe/shared', 'run', 'build']);
  run('pnpm', ['--filter', '@cat-cafe/mcp-server', 'run', 'build']);
  run('pnpm', ['--filter', '@cat-cafe/api', 'run', 'build']);
  run('pnpm', ['--filter', '@cat-cafe/web', 'run', 'build'], {
    env: { NEXT_TELEMETRY_DISABLED: '1' },
  });
}

function buildWindowsDesktopLauncher(bundleDir, options) {
  const launcherScript = join(repoRoot, 'scripts', 'build-windows-webview2-launcher.ps1');
  const launcherSource = join(repoRoot, 'packaging', 'windows', 'desktop', 'ClowderDesktop.cs');
  const launcherIconSource = join(repoRoot, 'packages', 'web', 'public', 'icons', 'icon-192x192.png');
  const launcherIconPath = join(options.cacheDir, 'ClowderAI.ico');
  if (!existsSync(launcherScript) || !existsSync(launcherSource)) {
    throw new Error('Missing WebView2 launcher build assets');
  }
  if (!commandExists('powershell.exe')) {
    throw new Error('powershell.exe is required to build the Windows WebView2 launcher');
  }
  if (existsSync(launcherIconSource)) {
    createIcoFromPng(launcherIconSource, launcherIconPath);
  }

  run('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    toWindowsPath(launcherScript),
    '-SourceFile',
    toWindowsPath(launcherSource),
    '-OutputDir',
    toWindowsPath(bundleDir),
    '-CacheDir',
    toWindowsPath(options.cacheDir),
    '-WebView2Version',
    options.webview2Version,
    ...(existsSync(launcherIconPath)
      ? [
          '-IconFile',
          toWindowsPath(launcherIconPath),
        ]
      : []),
  ]);
}

function buildInstallerOutputPath(outputDir, version) {
  return join(outputDir, `ClowderAI-${version}-windows-x64-setup.exe`);
}

function invokeMakensis(installerScript, outputExe, bundleDir, version) {
  const makensisCommand = process.env.MAKENSIS_PATH ?? 'makensis';
  if (!commandExists(makensisCommand)) {
    throw new Error('makensis not found on PATH. Install NSIS or run with --bundle-only.');
  }
  const definePrefix = process.platform === 'win32' ? '/D' : '-D';
  const maxRelativePathLength = computeMaxRelativePathLength(bundleDir);
  const maxInstallRootLength = 259 - maxRelativePathLength - 1;
  run(makensisCommand, [
    `${definePrefix}APP_VERSION=${version}`,
    `${definePrefix}BUNDLE_DIR=${toNsisDirPath(bundleDir)}`,
    `${definePrefix}OUTPUT_EXE=${toNsisFilePath(outputExe)}`,
    `${definePrefix}MAX_REL_PATH_LEN=${maxRelativePathLength}`,
    `${definePrefix}MAX_INSTALL_ROOT_LEN=${maxInstallRootLength}`,
    toNsisFilePath(installerScript),
  ]);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const bundleDir = join(options.outputDir, 'bundle');
  const installerScript = join(repoRoot, 'packaging', 'windows', 'installer.nsi');
  const outputExe = buildInstallerOutputPath(options.outputDir, packageJson.version);

  logStep('Preparing output directories');
  ensureDir(options.outputDir);
  ensureDir(options.cacheDir);
  resetDir(bundleDir);

  ensureBuildArtifacts(options);

  logStep('Copying project sources');
  copyTopLevelProject(bundleDir);
  stageInstallerSeed(bundleDir);

  logStep('Preparing runtime package payload');
  stageWorkspacePackages(bundleDir);

  logStep('Bundling Windows Node runtime');
  const windowsNode = await stageWindowsNode(bundleDir, options);

  logStep('Bundling portable Redis');
  const redis = await stageWindowsRedis(bundleDir, options);

  logStep('Installing Windows runtime dependencies');
  installWindowsRuntimeDependencies(bundleDir, options);

  logStep('Building WebView2 desktop launcher');
  buildWindowsDesktopLauncher(bundleDir, options);

  logStep('Finalizing runtime bundle');
  ensureRuntimeSkeleton(bundleDir);
  writeReleaseMetadata(bundleDir, {
    name: 'Clowder AI',
    version: packageJson.version,
    generatedAt: new Date().toISOString(),
    managedTopLevelPaths: WINDOWS_MANAGED_TOP_LEVEL_PATHS,
    preservedPaths: WINDOWS_PRESERVE_PATHS,
    windowsNode,
    redis,
    webview2Version: options.webview2Version,
    maxRelativePathLength: computeMaxRelativePathLength(bundleDir),
  });

  if (options.bundleOnly) {
    logStep(`Offline bundle ready at ${bundleDir}`);
    return;
  }

  logStep('Compiling NSIS installer');
  invokeMakensis(installerScript, outputExe, bundleDir, packageJson.version);
  logStep(`Installer ready at ${outputExe}`);
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch((error) => {
    console.error(`[windows-installer] ${error.message}`);
    process.exit(1);
  });
}
