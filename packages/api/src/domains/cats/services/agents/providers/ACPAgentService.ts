import type { CatId } from '@cat-cafe/shared';
import { createCatId } from '@cat-cafe/shared';
import type { RuntimeAcpModelProfile } from '../../../../../config/acp-model-profiles.js';
import type { RuntimeProviderProfile } from '../../../../../config/provider-profiles.js';
import type { AgentMessage, AgentService, AgentServiceOptions, MessageMetadata } from '../../types.js';
import { buildACPModelProfileOverridePayload } from './acp-model-profile-override.js';
import { transformACPUpdate } from './acp-event-transform.js';
import { ACPStdioClient } from './acp-transport.js';
import { buildCatCafeMcpRequestConfig } from './relayclaw-catcafe-mcp.js';

const DEFAULT_ACP_TIMEOUT_MS = 10 * 60 * 1000;

export interface ACPAgentServiceOptions {
  catId?: CatId;
}

const ACP_ALWAYS_BLOCKED_ENV_PREFIXES = ['AWS_', 'CAT_CAFE_', 'DATABASE_', 'GITHUB_', 'POSTGRES_', 'REDIS_'];
const ACP_MODEL_CREDENTIAL_ENV_PREFIXES = ['ANTHROPIC_', 'DARE_', 'GEMINI_', 'GOOGLE_', 'OPENAI_', 'OPENROUTER_'];
const ACP_ALWAYS_BLOCKED_ENV_KEYS = new Set(['DATABASE_URL', 'GITHUB_MCP_PAT', 'GITHUB_TOKEN', 'REDIS_URL']);

function doneMessage(catId: CatId, sessionId: string | undefined): AgentMessage {
  return {
    type: 'done',
    catId,
    metadata: sessionId ? { provider: 'acp', model: 'agent-teams', sessionId } : undefined,
    timestamp: Date.now(),
  };
}

function errorMessage(catId: CatId, error: string, sessionId?: string): AgentMessage {
  return {
    type: 'error',
    catId,
    error,
    metadata: sessionId ? { provider: 'acp', model: 'agent-teams', sessionId } : undefined,
    timestamp: Date.now(),
  };
}

function buildMetadata(sessionId?: string): MessageMetadata {
  return {
    provider: 'acp',
    model: 'agent-teams',
    ...(sessionId ? { sessionId } : {}),
  };
}

function buildAcpMcpServers(options?: AgentServiceOptions): Array<Record<string, unknown>> {
  const catCafeMcp = buildCatCafeMcpRequestConfig(options);
  if (!catCafeMcp) return [];
  return [
    {
      id: 'cat-cafe',
      name: 'cat-cafe',
      transport: 'stdio',
      ...catCafeMcp,
    },
  ];
}

function buildACPSubprocessEnv(providerProfile: RuntimeProviderProfile): NodeJS.ProcessEnv {
  const blockedPrefixes =
    providerProfile.modelAccessMode === 'clowder_default_profile'
      ? [...ACP_ALWAYS_BLOCKED_ENV_PREFIXES, ...ACP_MODEL_CREDENTIAL_ENV_PREFIXES]
      : ACP_ALWAYS_BLOCKED_ENV_PREFIXES;
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== 'string') continue;
    if (ACP_ALWAYS_BLOCKED_ENV_KEYS.has(key)) continue;
    if (blockedPrefixes.some((prefix) => key.startsWith(prefix))) continue;
    env[key] = value;
  }
  return env;
}

function buildSessionParams(
  providerProfile: RuntimeProviderProfile,
  workingDirectory: string | undefined,
  acpModelProfile: RuntimeAcpModelProfile | undefined,
  options?: AgentServiceOptions,
): Record<string, unknown> {
  return {
    ...(workingDirectory ? { cwd: workingDirectory } : {}),
    mcpServers: buildAcpMcpServers(options),
    ...(providerProfile.modelAccessMode === 'clowder_default_profile' && acpModelProfile
      ? { modelProfileOverride: buildACPModelProfileOverridePayload(acpModelProfile) }
      : {}),
  };
}

function yieldQueuedUpdates(
  client: ACPStdioClient,
  sessionId: string | undefined,
  catId: CatId,
): AgentMessage[] {
  const output: AgentMessage[] = [];
  for (const incoming of client.drainMessages()) {
    if (!incoming || incoming.method !== 'session/update') continue;
    const params = incoming.params;
    if (!params || typeof params !== 'object') continue;
    const updateSessionId =
      typeof (params as { sessionId?: unknown }).sessionId === 'string'
        ? ((params as { sessionId: string }).sessionId ?? '')
        : '';
    if (sessionId && updateSessionId && updateSessionId !== sessionId) continue;
    const rawUpdate = (params as { update?: unknown }).update;
    if (!rawUpdate || typeof rawUpdate !== 'object') continue;
    for (const message of transformACPUpdate(rawUpdate as Record<string, unknown>, catId)) {
      output.push({
        ...message,
        metadata: buildMetadata(sessionId),
      });
    }
  }
  return output;
}

export async function runACPProviderProbe(input: {
  providerProfile: RuntimeProviderProfile;
  workingDirectory?: string;
  acpModelProfile?: RuntimeAcpModelProfile;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const providerProfile = input.providerProfile;
  if (providerProfile.kind !== 'acp' || !providerProfile.command) {
    return { ok: false, error: 'ACP provider profile is incomplete' };
  }

  const client = new ACPStdioClient({
    command: providerProfile.command,
    args: providerProfile.args,
    cwd: providerProfile.cwd,
    env: buildACPSubprocessEnv(providerProfile),
  });
  try {
    await client.start();
    await client.call('initialize', { protocolVersion: 1 });
    const created = await client.call(
      'session/new',
      buildSessionParams(providerProfile, input.workingDirectory, input.acpModelProfile),
    );
    const sessionId = typeof created.sessionId === 'string' ? created.sessionId : undefined;
    if (!sessionId) {
      return { ok: false, error: 'ACP probe did not return sessionId' };
    }
    client.drainMessages();
    if (providerProfile.modelAccessMode === 'clowder_default_profile') {
      await client.call('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'ping' }],
      });
    }
    return { ok: true };
  } catch (error) {
    const stderr = client.stderrText.trim();
    return { ok: false, error: stderr || (error instanceof Error ? error.message : String(error)) };
  } finally {
    await client.close();
  }
}

export class ACPAgentService implements AgentService {
  private readonly catId: CatId;

  constructor(options?: ACPAgentServiceOptions) {
    this.catId = options?.catId ?? createCatId('acp-agent');
  }

  async *invoke(prompt: string, options?: AgentServiceOptions): AsyncIterable<AgentMessage> {
    const providerProfile = options?.providerProfile;
    const acpModelProfile = options?.acpModelProfile;
    if (providerProfile?.kind !== 'acp' || providerProfile.authType !== 'none' || !providerProfile.command) {
      yield errorMessage(this.catId, 'ACP provider profile is not configured');
      yield doneMessage(this.catId, undefined);
      return;
    }

    const client = new ACPStdioClient({
      command: providerProfile.command,
      args: providerProfile.args,
      cwd: providerProfile.cwd,
      env: buildACPSubprocessEnv(providerProfile),
    });
    let sessionId = options?.sessionId;
    let aborted = false;
    const abortSignal = options?.signal;
    const timeoutSignal = AbortSignal.timeout(DEFAULT_ACP_TIMEOUT_MS);
    const combinedSignal = abortSignal ? AbortSignal.any([abortSignal, timeoutSignal]) : timeoutSignal;

    try {
      await client.start();
      await client.call('initialize', { protocolVersion: 1 });

      const sessionParams = buildSessionParams(
        providerProfile,
        options?.workingDirectory,
        acpModelProfile ?? undefined,
        options,
      );
      if (sessionId) {
        const loaded = await client.call('session/load', { sessionId, ...sessionParams });
        if (typeof loaded.sessionId === 'string' && loaded.sessionId.trim()) {
          sessionId = loaded.sessionId.trim();
        }
      } else {
        const created = await client.call('session/new', sessionParams);
        if (typeof created.sessionId !== 'string' || !created.sessionId.trim()) {
          throw new Error('ACP session/new did not return sessionId');
        }
        sessionId = created.sessionId.trim();
      }

      client.drainMessages();

      yield {
        type: 'session_init',
        catId: this.catId,
        sessionId,
        metadata: buildMetadata(sessionId),
        timestamp: Date.now(),
      };

      const promptPromise = client
        .call('session/prompt', {
          sessionId,
          prompt: [{ type: 'text', text: prompt }],
        })
        .then(
          (result) => ({ kind: 'prompt_result' as const, result }),
          (error) => ({ kind: 'prompt_error' as const, error }),
        );
      const abortPromise = new Promise<{ kind: 'abort' }>((resolve) => {
        combinedSignal.addEventListener('abort', () => resolve({ kind: 'abort' }), { once: true });
      });

      let nextMessagePromise = client.nextMessage().then((message) => ({ kind: 'message' as const, message }));
      let done = false;
      while (!done) {
        const outcome = await Promise.race([promptPromise, abortPromise, nextMessagePromise]);
        if (outcome.kind === 'abort') {
          aborted = true;
          if (sessionId) {
            await client.notify('session/cancel', { sessionId }).catch(() => {});
          }
          break;
        }
        if (outcome.kind === 'prompt_error') {
          throw outcome.error;
        }
        if (outcome.kind === 'prompt_result') {
          for (const message of yieldQueuedUpdates(client, sessionId, this.catId)) {
            yield message;
          }
          done = true;
          continue;
        }
        const incoming = outcome.message;
        nextMessagePromise = client.nextMessage().then((message) => ({ kind: 'message' as const, message }));
        if (!incoming || incoming.method !== 'session/update') continue;
        const params = incoming.params;
        if (!params || typeof params !== 'object') continue;
        const updateSessionId =
          typeof (params as { sessionId?: unknown }).sessionId === 'string'
            ? ((params as { sessionId: string }).sessionId ?? '')
            : '';
        if (sessionId && updateSessionId && updateSessionId !== sessionId) continue;
        const rawUpdate = (params as { update?: unknown }).update;
        if (!rawUpdate || typeof rawUpdate !== 'object') continue;
        for (const message of transformACPUpdate(rawUpdate as Record<string, unknown>, this.catId)) {
          yield {
            ...message,
            metadata: buildMetadata(sessionId),
          };
        }
      }

      yield doneMessage(this.catId, sessionId);
    } catch (error) {
      if (!aborted) {
        const stderr = client.stderrText.trim();
        yield errorMessage(
          this.catId,
          stderr || (error instanceof Error ? error.message : String(error)),
          sessionId,
        );
        yield doneMessage(this.catId, sessionId);
      } else {
        yield doneMessage(this.catId, sessionId);
      }
    } finally {
      await client.close();
    }
  }
}
