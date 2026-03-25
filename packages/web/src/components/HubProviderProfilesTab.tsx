'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import { HubAcpModelProfileItem, type AcpModelProfileEditPayload } from './HubAcpModelProfileItem';
import { HubProviderProfileItem, type ProfileEditPayload } from './HubProviderProfileItem';
import {
  CreateAcpModelProfileSection,
  CreateApiKeyProfileSection,
  ProviderProfilesSummaryCard,
  type AcpProviderKind,
} from './hub-provider-profiles.sections';
import type {
  AcpModelProfilesResponse,
  AcpModelProviderType,
  AcpModelProfileItem,
  AcpModelAccessMode,
  ProviderProfilesResponse,
} from './hub-provider-profiles.types';
import { ensureBuiltinProviderProfiles, resolveAccountActionId } from './hub-provider-profiles.view';
import { getProjectPaths, projectDisplayName } from './ThreadSidebar/thread-utils';

const DEFAULT_ACP_ARGS = '--directory /opt/workspace/agent-teams run agent-teams gateway acp stdio';

export function HubProviderProfilesTab() {
  const threads = useChatStore((s) => s.threads);
  const currentProjectPath = useChatStore((s) => s.currentProjectPath);
  const knownProjects = useMemo(() => getProjectPaths(threads), [threads]);
  const threadProjectPath = currentProjectPath && currentProjectPath !== 'default' ? currentProjectPath : null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProviderProfilesResponse | null>(null);
  const [acpModelData, setAcpModelData] = useState<AcpModelProfilesResponse | null>(null);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [createKind, setCreateKind] = useState<AcpProviderKind>('api_key');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [createProtocol, setCreateProtocol] = useState<'anthropic' | 'openai' | 'google'>('anthropic');
  const [createBaseUrl, setCreateBaseUrl] = useState('');
  const [createApiKey, setCreateApiKey] = useState('');
  const [createModels, setCreateModels] = useState<string[]>([]);
  const [createAcpCommand, setCreateAcpCommand] = useState('uv');
  const [createAcpArgs, setCreateAcpArgs] = useState(DEFAULT_ACP_ARGS);
  const [createAcpCwd, setCreateAcpCwd] = useState('/opt/workspace/agent-teams');
  const [createAcpModelAccessMode, setCreateAcpModelAccessMode] = useState<AcpModelAccessMode>('self_managed');
  const [createAcpModelProfileRef, setCreateAcpModelProfileRef] = useState('');

  const [createAcpModelDisplayName, setCreateAcpModelDisplayName] = useState('');
  const [createAcpModelProvider, setCreateAcpModelProvider] = useState<AcpModelProviderType>('openai_compatible');
  const [createAcpModel, setCreateAcpModel] = useState('');
  const [createAcpModelBaseUrl, setCreateAcpModelBaseUrl] = useState('');
  const [createAcpModelApiKey, setCreateAcpModelApiKey] = useState('');

  const requestProjectPath = projectPath ?? threadProjectPath;
  const mutationProjectPath = projectPath ?? data?.projectPath ?? threadProjectPath;

  const callApi = useCallback(async (path: string, init: RequestInit) => {
    const res = await apiFetch(path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error((body.error as string) ?? `请求失败 (${res.status})`);
    }
    return body;
  }, []);

  const fetchAll = useCallback(async (forProject?: string) => {
    setError(null);
    try {
      const query = new URLSearchParams();
      if (forProject) query.set('projectPath', forProject);
      const [providerRes, acpModelRes] = await Promise.all([
        apiFetch(`/api/provider-profiles?${query.toString()}`),
        apiFetch(`/api/acp-model-profiles?${query.toString()}`),
      ]);
      if (!providerRes.ok) {
        const body = (await providerRes.json().catch(() => ({}))) as Record<string, unknown>;
        setError((body.error as string) ?? '加载失败');
        return;
      }
      if (!acpModelRes.ok) {
        const body = (await acpModelRes.json().catch(() => ({}))) as Record<string, unknown>;
        setError((body.error as string) ?? '加载失败');
        return;
      }
      setData((await providerRes.json()) as ProviderProfilesResponse);
      setAcpModelData((await acpModelRes.json()) as AcpModelProfilesResponse);
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetchAll(requestProjectPath ?? undefined);
  }, [fetchAll, requestProjectPath]);

  const switchProject = useCallback(
    (nextPath: string | null) => {
      setProjectPath(nextPath);
      setLoading(true);
      void fetchAll(nextPath ?? threadProjectPath ?? undefined);
    },
    [fetchAll, threadProjectPath],
  );

  const refresh = useCallback(async () => {
    await fetchAll(mutationProjectPath ?? undefined);
  }, [fetchAll, mutationProjectPath]);

  const createProfile = useCallback(async () => {
    if (!createDisplayName.trim()) {
      setError('请输入账号显示名');
      return;
    }
    if (createKind === 'acp') {
      if (!createAcpCommand.trim()) {
        setError('ACP provider 需要填写 command');
        return;
      }
      if (createAcpModelAccessMode === 'clowder_default_profile' && !createAcpModelProfileRef.trim()) {
        setError('请选择 ACP Model Profile');
        return;
      }
    } else if (!createBaseUrl.trim() || !createApiKey.trim()) {
      setError('API Key 账号需要填写 baseUrl 和 apiKey');
      return;
    }

    setBusyId('create');
    setError(null);
    try {
      await callApi('/api/provider-profiles', {
        method: 'POST',
        body: JSON.stringify(
          createKind === 'acp'
            ? {
                projectPath: mutationProjectPath ?? undefined,
                kind: 'acp',
                displayName: createDisplayName.trim(),
                command: createAcpCommand.trim(),
                args: createAcpArgs
                  .split(/\s+/)
                  .map((value) => value.trim())
                  .filter(Boolean),
                cwd: createAcpCwd.trim(),
                modelAccessMode: createAcpModelAccessMode,
                ...(createAcpModelAccessMode === 'clowder_default_profile' && createAcpModelProfileRef.trim()
                  ? { defaultModelProfileRef: createAcpModelProfileRef.trim() }
                  : {}),
              }
            : {
                projectPath: mutationProjectPath ?? undefined,
                displayName: createDisplayName.trim(),
                authType: 'api_key',
                protocol: createProtocol,
                baseUrl: createBaseUrl.trim(),
                apiKey: createApiKey.trim(),
                models: createModels,
              },
        ),
      });
      setCreateDisplayName('');
      setCreateProtocol('anthropic');
      setCreateBaseUrl('');
      setCreateApiKey('');
      setCreateModels([]);
      setCreateAcpCommand('uv');
      setCreateAcpArgs(DEFAULT_ACP_ARGS);
      setCreateAcpCwd('/opt/workspace/agent-teams');
      setCreateAcpModelAccessMode('self_managed');
      setCreateAcpModelProfileRef('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }, [
    callApi,
    createAcpArgs,
    createAcpCommand,
    createAcpCwd,
    createAcpModelAccessMode,
    createAcpModelProfileRef,
    createApiKey,
    createBaseUrl,
    createDisplayName,
    createKind,
    createModels,
    createProtocol,
    mutationProjectPath,
    refresh,
  ]);

  const createAcpModelProfile = useCallback(async () => {
    if (
      !createAcpModelDisplayName.trim() ||
      !createAcpModel.trim() ||
      !createAcpModelBaseUrl.trim() ||
      !createAcpModelApiKey.trim()
    ) {
      setError('ACP Model Profile 需要填写显示名、model、baseUrl、apiKey');
      return;
    }
    setBusyId('create-acp-model');
    setError(null);
    try {
      await callApi('/api/acp-model-profiles', {
        method: 'POST',
        body: JSON.stringify({
          projectPath: mutationProjectPath ?? undefined,
          displayName: createAcpModelDisplayName.trim(),
          provider: createAcpModelProvider,
          model: createAcpModel.trim(),
          baseUrl: createAcpModelBaseUrl.trim(),
          apiKey: createAcpModelApiKey.trim(),
        }),
      });
      setCreateAcpModelDisplayName('');
      setCreateAcpModel('');
      setCreateAcpModelBaseUrl('');
      setCreateAcpModelApiKey('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }, [
    callApi,
    createAcpModel,
    createAcpModelApiKey,
    createAcpModelBaseUrl,
    createAcpModelDisplayName,
    createAcpModelProvider,
    mutationProjectPath,
    refresh,
  ]);

  const deleteProfile = useCallback(
    async (profileId: string) => {
      setBusyId(profileId);
      setError(null);
      try {
        await callApi(`/api/provider-profiles/${profileId}`, {
          method: 'DELETE',
          body: JSON.stringify({ projectPath: mutationProjectPath ?? undefined }),
        });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [callApi, mutationProjectPath, refresh],
  );

  const saveProfile = useCallback(
    async (profileId: string, payload: ProfileEditPayload) => {
      setBusyId(profileId);
      setError(null);
      try {
        await callApi(`/api/provider-profiles/${profileId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            projectPath: mutationProjectPath ?? undefined,
            ...payload,
          }),
        });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [callApi, mutationProjectPath, refresh],
  );

  const testProfile = useCallback(
    async (profileId: string) => {
      setBusyId(`${profileId}:test`);
      setError(null);
      try {
        await callApi(`/api/provider-profiles/${profileId}/test`, {
          method: 'POST',
          body: JSON.stringify({ projectPath: mutationProjectPath ?? undefined }),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [callApi, mutationProjectPath],
  );

  const saveAcpModelProfile = useCallback(
    async (profileId: string, payload: AcpModelProfileEditPayload) => {
      setBusyId(profileId);
      setError(null);
      try {
        await callApi(`/api/acp-model-profiles/${profileId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            projectPath: mutationProjectPath ?? undefined,
            ...payload,
          }),
        });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [callApi, mutationProjectPath, refresh],
  );

  const deleteAcpModelProfile = useCallback(
    async (profileId: string) => {
      setBusyId(profileId);
      setError(null);
      try {
        await callApi(`/api/acp-model-profiles/${profileId}`, {
          method: 'DELETE',
          body: JSON.stringify({ projectPath: mutationProjectPath ?? undefined }),
        });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [callApi, mutationProjectPath, refresh],
  );

  const allPaths = useMemo(() => {
    const paths = new Set<string>();
    if (data?.projectPath) paths.add(data.projectPath);
    if (threadProjectPath) paths.add(threadProjectPath);
    for (const p of knownProjects) paths.add(p);
    return [...paths].map((path) => ({ path, label: projectDisplayName(path) }));
  }, [data?.projectPath, knownProjects, threadProjectPath]);

  const displayProfiles = useMemo(() => ensureBuiltinProviderProfiles(data?.providers ?? []), [data?.providers]);
  const builtinProfiles = useMemo(() => displayProfiles.filter((profile) => profile.builtin), [displayProfiles]);
  const customProfiles = useMemo(() => displayProfiles.filter((profile) => !profile.builtin), [displayProfiles]);
  const displayCards = useMemo(() => [...builtinProfiles, ...customProfiles], [builtinProfiles, customProfiles]);
  const acpModelProfiles = acpModelData?.profiles ?? [];

  if (loading) return <p className="text-sm text-gray-400">加载中...</p>;
  if (!data) return <p className="text-sm text-gray-400">暂无数据</p>;

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-500">{error}</p> : null}

      <ProviderProfilesSummaryCard />

      <div role="group" aria-label="Provider Profile List" className="space-y-4">
        {displayCards.map((profile) => (
          <HubProviderProfileItem
            key={profile.id}
            profile={profile}
            acpModelProfiles={acpModelProfiles}
            busy={busyId === resolveAccountActionId(profile) || busyId === `${resolveAccountActionId(profile)}:test`}
            onSave={(payload) => saveProfile(resolveAccountActionId(profile), payload)}
            onDelete={() => deleteProfile(resolveAccountActionId(profile))}
            onTest={() => testProfile(resolveAccountActionId(profile))}
          />
        ))}
      </div>

      <CreateApiKeyProfileSection
        kind={createKind}
        displayName={createDisplayName}
        protocol={createProtocol}
        baseUrl={createBaseUrl}
        apiKey={createApiKey}
        models={createModels}
        command={createAcpCommand}
        args={createAcpArgs}
        cwd={createAcpCwd}
        modelAccessMode={createAcpModelAccessMode}
        defaultModelProfileRef={createAcpModelProfileRef}
        acpModelProfiles={acpModelProfiles}
        busy={busyId === 'create'}
        onKindChange={setCreateKind}
        onDisplayNameChange={setCreateDisplayName}
        onProtocolChange={setCreateProtocol}
        onBaseUrlChange={setCreateBaseUrl}
        onApiKeyChange={setCreateApiKey}
        onModelsChange={setCreateModels}
        onCommandChange={setCreateAcpCommand}
        onArgsChange={setCreateAcpArgs}
        onCwdChange={setCreateAcpCwd}
        onModelAccessModeChange={setCreateAcpModelAccessMode}
        onDefaultModelProfileRefChange={setCreateAcpModelProfileRef}
        onCreate={createProfile}
      />

      <div className="space-y-4">
        <p className="text-sm font-semibold text-[#5C5AB1]">ACP Model Profiles</p>
        {acpModelProfiles.map((profile: AcpModelProfileItem) => (
          <HubAcpModelProfileItem
            key={profile.id}
            profile={profile}
            busy={busyId === profile.id}
            onSave={saveAcpModelProfile}
            onDelete={deleteAcpModelProfile}
          />
        ))}
      </div>

      <CreateAcpModelProfileSection
        displayName={createAcpModelDisplayName}
        provider={createAcpModelProvider}
        model={createAcpModel}
        baseUrl={createAcpModelBaseUrl}
        apiKey={createAcpModelApiKey}
        busy={busyId === 'create-acp-model'}
        onDisplayNameChange={setCreateAcpModelDisplayName}
        onProviderChange={setCreateAcpModelProvider}
        onModelChange={setCreateAcpModel}
        onBaseUrlChange={setCreateAcpModelBaseUrl}
        onApiKeyChange={setCreateAcpModelApiKey}
        onCreate={createAcpModelProfile}
      />

      <p className="text-xs leading-5 text-[#B59A88]">
        secrets 存储在 `.cat-cafe/provider-profiles.secrets.local.json` 和 `.cat-cafe/acp-model-profiles.secrets.local.json`。
      </p>
    </div>
  );
}
