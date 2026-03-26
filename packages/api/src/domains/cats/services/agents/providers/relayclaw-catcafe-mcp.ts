import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentServiceOptions } from '../../types.js';

const CAT_CAFE_MCP_CALLBACK_ENV_KEYS = [
  'CAT_CAFE_API_URL',
  'CAT_CAFE_INVOCATION_ID',
  'CAT_CAFE_CALLBACK_TOKEN',
  'CAT_CAFE_USER_ID',
  'CAT_CAFE_CAT_ID',
  'CAT_CAFE_SIGNAL_USER',
] as const;

export interface RelayClawCatCafeMcpServer {
  command: string;
  args: string[];
  serverPath: string;
  repoRoot: string;
}

export function resolveCatCafeMcpServer(
  workingDirectory?: string,
): RelayClawCatCafeMcpServer | null {
  const candidateRoots: string[] = [];
  if (workingDirectory) candidateRoots.push(workingDirectory);
  candidateRoots.push(process.cwd());

  const fileDir = dirname(fileURLToPath(import.meta.url));
  candidateRoots.push(resolve(fileDir, '../../../../../../../..'));

  for (const root of candidateRoots) {
    const repoRoot = resolve(root);
    const distServerPath = resolve(repoRoot, 'packages/mcp-server/dist/index.js');
    if (existsSync(distServerPath)) {
      return {
        command: process.execPath,
        args: [distServerPath],
        serverPath: distServerPath,
        repoRoot,
      };
    }

    const sourceServerPath = resolve(repoRoot, 'packages/mcp-server/src/index.ts');
    if (existsSync(sourceServerPath)) {
      return {
        command: process.execPath,
        args: ['--import', 'tsx', sourceServerPath],
        serverPath: sourceServerPath,
        repoRoot,
      };
    }
  }

  return null;
}

export function buildCatCafeMcpEnv(callbackEnv?: Record<string, string>): Record<string, string> {
  const resolvedEnv = callbackEnv ?? {};
  return Object.fromEntries(
    CAT_CAFE_MCP_CALLBACK_ENV_KEYS.map((key) => [key, resolvedEnv[key]]).filter(([, value]) => Boolean(value)),
  ) as Record<string, string>;
}

export function buildCatCafeMcpRequestConfig(options?: AgentServiceOptions): Record<string, unknown> | undefined {
  const resolved = resolveCatCafeMcpServer(options?.workingDirectory);
  if (!resolved) return undefined;

  return {
    command: resolved.command,
    args: resolved.args,
    cwd: resolved.repoRoot,
    env: buildCatCafeMcpEnv(options?.callbackEnv),
  };
}
