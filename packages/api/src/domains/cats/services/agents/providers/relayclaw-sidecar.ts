import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import type { CatId, RelayClawAgentConfig } from '@cat-cafe/shared';
import type { AgentServiceOptions } from '../../types.js';
import { createModuleLogger } from '../../../../../infrastructure/logger.js';
import { tcpProbe } from '../../../../../utils/tcp-probe.js';
import { resolveJiuwenClawAppDir, resolveJiuwenClawPythonBin } from '../../../../../utils/jiuwenclaw-paths.js';
import { buildCatCafeMcpEnv, resolveCatCafeMcpServer } from './relayclaw-catcafe-mcp.js';

const log = createModuleLogger('relayclaw-sidecar');

export interface RelayClawSidecarRuntime {
  pythonBin: string;
  appDir: string;
  homeDir: string;
  agentPort: number;
  webPort: number;
  env: Record<string, string>;
  signature: Record<string, string | number>;
}

export interface RelayClawSidecarController {
  ensureStarted(options?: AgentServiceOptions, signal?: AbortSignal): Promise<string>;
  stop(): void;
  getRecentLogs(): string;
}

export interface RelayClawSidecarControllerDeps {
  spawnFn?: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
  tcpProbeFn?: typeof tcpProbe;
  allocatePort?: () => Promise<number>;
}

export class DefaultRelayClawSidecarController implements RelayClawSidecarController {
  private readonly catId: CatId;
  private readonly config: RelayClawAgentConfig;
  private readonly spawnFn: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
  private readonly tcpProbeFn: typeof tcpProbe;
  private readonly allocatePort: () => Promise<number>;
  private child: ChildProcess | null = null;
  private bootPromise: Promise<void> | null = null;
  private runtimeHash: string | null = null;
  private resolvedUrl: string | null = null;
  private recentLogs = '';

  constructor(
    catId: CatId,
    config: RelayClawAgentConfig,
    deps?: RelayClawSidecarControllerDeps,
  ) {
    this.catId = catId;
    this.config = config;
    this.spawnFn = deps?.spawnFn ?? ((command, args, options) => spawn(command, args, options));
    this.tcpProbeFn = deps?.tcpProbeFn ?? tcpProbe;
    this.allocatePort = deps?.allocatePort ?? findOpenPort;
  }

  async ensureStarted(options?: AgentServiceOptions, signal?: AbortSignal): Promise<string> {
    const runtime = this.buildRuntime(options);
    const runtimeHash = createHash('sha256').update(JSON.stringify(runtime.signature)).digest('hex');
    const childAlive = this.child?.killed === false && this.child.exitCode === null;

    if (childAlive && this.runtimeHash === runtimeHash && this.resolvedUrl) {
      const parsed = new URL(this.resolvedUrl);
      const port = Number.parseInt(parsed.port, 10);
      if (port > 0 && (await this.tcpProbeFn(parsed.hostname, port, 400))) {
        return this.resolvedUrl;
      }
    }

    if (this.child && this.runtimeHash !== runtimeHash) {
      this.stop();
    }

    if (this.bootPromise) {
      await this.bootPromise;
      return this.resolvedUrl!;
    }

    this.bootPromise = this.start(runtime, signal);
    try {
      await this.bootPromise;
      return this.resolvedUrl!;
    } finally {
      this.bootPromise = null;
    }
  }

  stop(): void {
    if (this.child && this.child.exitCode === null) {
      this.child.kill('SIGTERM');
    }
    this.child = null;
    this.runtimeHash = null;
    this.resolvedUrl = null;
  }

  getRecentLogs(): string {
    return this.recentLogs;
  }

  private buildRuntime(options?: AgentServiceOptions): RelayClawSidecarRuntime {
    const callbackEnv = options?.callbackEnv ?? {};
    const appDir = resolveJiuwenClawAppDir(this.config.appDir);
    const pythonBin = resolveJiuwenClawPythonBin(this.config.pythonBin, appDir);
    const homeDir = this.config.homeDir?.trim() || join(process.cwd(), '.cat-cafe', 'relayclaw', this.catId as string);
    const apiKey = callbackEnv.API_KEY || callbackEnv.OPENAI_API_KEY || callbackEnv.OPENROUTER_API_KEY || '';
    const apiBase = callbackEnv.API_BASE || callbackEnv.OPENAI_BASE_URL || callbackEnv.OPENAI_API_BASE || '';
    const provider = apiBase.includes('openrouter.ai') ? 'OpenRouter' : 'OpenAI';
    const modelName = this.config.modelName?.trim() || 'gpt-5.4';
    const projectDir = options?.workingDirectory?.trim() || '';
    const catCafeMcp = resolveCatCafeMcpServer(options?.workingDirectory);

    return {
      pythonBin,
      appDir,
      homeDir,
      agentPort: this.config.agentPort ?? 0,
      webPort: this.config.webPort ?? 0,
      env: {
        HOME: homeDir,
        PYTHONUNBUFFERED: '1',
        WEB_HOST: '127.0.0.1',
        API_KEY: apiKey,
        API_BASE: apiBase,
        MODEL_NAME: modelName,
        MODEL_PROVIDER: provider,
        JIUWENCLAW_AGENT_ROOT: join(homeDir, 'agent'),
        ...(projectDir ? { JIUWENCLAW_PROJECT_DIR: projectDir } : {}),
        ...(catCafeMcp
          ? {
              CAT_CAFE_MCP_SERVER_PATH: catCafeMcp.serverPath,
              CAT_CAFE_MCP_COMMAND: 'node',
              CAT_CAFE_MCP_ARGS_JSON: JSON.stringify([catCafeMcp.serverPath]),
              CAT_CAFE_MCP_CWD: catCafeMcp.repoRoot,
            }
          : {}),
        ...buildCatCafeMcpEnv(callbackEnv),
      },
      signature: {
        pythonBin,
        appDir,
        homeDir,
        apiBase,
        modelName,
        provider,
        projectDir,
        catCafeMcpPath: catCafeMcp?.serverPath ?? '',
        keyHash: apiKey ? createHash('sha256').update(apiKey).digest('hex') : '',
      },
    };
  }

  private async start(runtime: RelayClawSidecarRuntime, signal?: AbortSignal): Promise<void> {
    if (!runtime.env.API_KEY || !runtime.env.API_BASE) {
      throw new Error('jiuwenClaw requires a bound openai-compatible API key profile');
    }

    mkdirSync(runtime.homeDir, { recursive: true });
    const agentPort = runtime.agentPort || (await this.allocatePort());
    const webPort = runtime.webPort || (await this.allocatePort());
    this.resolvedUrl = `ws://127.0.0.1:${agentPort}`;
    this.recentLogs = '';

    const child = this.spawnFn(runtime.pythonBin, ['-m', 'jiuwenclaw.app'], {
      cwd: runtime.appDir,
      env: {
        ...process.env,
        ...runtime.env,
        AGENT_PORT: String(agentPort),
        WEB_PORT: String(webPort),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    this.runtimeHash = createHash('sha256').update(JSON.stringify(runtime.signature)).digest('hex');

    const pushLog = (chunk: Buffer) => {
      this.recentLogs = `${this.recentLogs}${chunk.toString('utf-8')}`.slice(-8000);
    };
    child.stdout?.on('data', pushLog);
    child.stderr?.on('data', pushLog);
    child.once('exit', (code, exitSignal) => {
      log.warn({ catId: this.catId, code, exitSignal }, 'relayclaw sidecar exited');
      this.child = null;
      this.runtimeHash = null;
      this.resolvedUrl = null;
    });

    if (signal?.aborted) {
      this.stop();
      throw new Error('jiuwenClaw sidecar startup aborted');
    }

    const timeoutAt = Date.now() + (this.config.startupTimeoutMs ?? 45_000);
    while (Date.now() < timeoutAt) {
      if (signal?.aborted) {
        this.stop();
        throw new Error('jiuwenClaw sidecar startup aborted');
      }
      if (!this.child || this.child.exitCode !== null) {
        throw new Error(`jiuwenClaw sidecar exited during startup${this.recentLogs ? `: ${summarizeLogs(this.recentLogs)}` : ''}`);
      }
      if (await this.tcpProbeFn('127.0.0.1', agentPort, 400) && isSidecarReady(this.recentLogs)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    this.stop();
    throw new Error(`jiuwenClaw sidecar did not become ready in time${this.recentLogs ? `: ${summarizeLogs(this.recentLogs)}` : ''}`);
  }
}

export function isSidecarReady(recentLogs: string): boolean {
  return (
    recentLogs.includes('[JiuWenClaw] 初始化完成') ||
    recentLogs.includes('JiuWenClaw] 初始化完成') ||
    recentLogs.includes('WebChannel 已启动')
  );
}

export function summarizeLogs(recentLogs: string): string {
  return recentLogs
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6)
    .join(' | ');
}

async function findOpenPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate relayclaw port')));
        return;
      }
      const { port } = address;
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(port);
      });
    });
  });
}
