'use client';

import { useCallback, useState } from 'react';
import type { AcpProviderKind } from './hub-provider-profiles.sections';
import type { AcpModelAccessMode, AcpModelProfileItem, AcpModelProviderType } from './hub-provider-profiles.types';

const DEFAULT_ACP_ARGS = '--directory /opt/workspace/agent-teams run agent-teams gateway acp stdio';
const DEFAULT_ACP_CWD = '/opt/workspace/agent-teams';

function splitCommandArgs(value: string): string[] {
  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

interface CreateSectionsOptions {
  acpModelProfiles: AcpModelProfileItem[];
  mutationProjectPath: string | null;
  callApi: (path: string, init: RequestInit) => Promise<Record<string, unknown>>;
  refresh: () => Promise<void>;
  setBusyId: (value: string | null) => void;
  setError: (value: string | null) => void;
}

export function useProviderProfilesCreateSections(options: CreateSectionsOptions) {
  const [createKind, setCreateKind] = useState<AcpProviderKind>('api_key');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [createProtocol, setCreateProtocol] = useState<'anthropic' | 'openai' | 'google'>('anthropic');
  const [createBaseUrl, setCreateBaseUrl] = useState('');
  const [createApiKey, setCreateApiKey] = useState('');
  const [createModels, setCreateModels] = useState<string[]>([]);
  const [createAcpCommand, setCreateAcpCommand] = useState('uv');
  const [createAcpArgs, setCreateAcpArgs] = useState(DEFAULT_ACP_ARGS);
  const [createAcpCwd, setCreateAcpCwd] = useState(DEFAULT_ACP_CWD);
  const [createAcpModelAccessMode, setCreateAcpModelAccessMode] = useState<AcpModelAccessMode>('self_managed');
  const [createAcpModelProfileRef, setCreateAcpModelProfileRef] = useState('');

  const [createAcpModelDisplayName, setCreateAcpModelDisplayName] = useState('');
  const [createAcpModelProvider, setCreateAcpModelProvider] = useState<AcpModelProviderType>('openai_compatible');
  const [createAcpModel, setCreateAcpModel] = useState('');
  const [createAcpModelBaseUrl, setCreateAcpModelBaseUrl] = useState('');
  const [createAcpModelApiKey, setCreateAcpModelApiKey] = useState('');

  const resetCreateProfileForm = useCallback(() => {
    setCreateDisplayName('');
    setCreateProtocol('anthropic');
    setCreateBaseUrl('');
    setCreateApiKey('');
    setCreateModels([]);
    setCreateAcpCommand('uv');
    setCreateAcpArgs(DEFAULT_ACP_ARGS);
    setCreateAcpCwd(DEFAULT_ACP_CWD);
    setCreateAcpModelAccessMode('self_managed');
    setCreateAcpModelProfileRef('');
  }, []);

  const resetCreateAcpModelForm = useCallback(() => {
    setCreateAcpModelDisplayName('');
    setCreateAcpModel('');
    setCreateAcpModelBaseUrl('');
    setCreateAcpModelApiKey('');
  }, []);

  const createProfile = useCallback(async () => {
    if (!createDisplayName.trim()) {
      options.setError('请输入账号显示名');
      return;
    }
    if (createKind === 'acp') {
      if (!createAcpCommand.trim()) {
        options.setError('ACP provider 需要填写 command');
        return;
      }
      if (createAcpModelAccessMode === 'clowder_default_profile' && !createAcpModelProfileRef.trim()) {
        options.setError('请选择 ACP Model Profile');
        return;
      }
    } else if (!createBaseUrl.trim() || !createApiKey.trim()) {
      options.setError('API Key 账号需要填写 baseUrl 和 apiKey');
      return;
    }

    options.setBusyId('create');
    options.setError(null);
    try {
      await options.callApi('/api/provider-profiles', {
        method: 'POST',
        body: JSON.stringify(
          createKind === 'acp'
            ? {
                projectPath: options.mutationProjectPath ?? undefined,
                kind: 'acp',
                displayName: createDisplayName.trim(),
                command: createAcpCommand.trim(),
                args: splitCommandArgs(createAcpArgs),
                cwd: createAcpCwd.trim(),
                modelAccessMode: createAcpModelAccessMode,
                ...(createAcpModelAccessMode === 'clowder_default_profile' && createAcpModelProfileRef.trim()
                  ? { defaultModelProfileRef: createAcpModelProfileRef.trim() }
                  : {}),
              }
            : {
                projectPath: options.mutationProjectPath ?? undefined,
                displayName: createDisplayName.trim(),
                authType: 'api_key',
                protocol: createProtocol,
                baseUrl: createBaseUrl.trim(),
                apiKey: createApiKey.trim(),
                models: createModels,
              },
        ),
      });
      resetCreateProfileForm();
      await options.refresh();
    } catch (err) {
      options.setError(err instanceof Error ? err.message : String(err));
    } finally {
      options.setBusyId(null);
    }
  }, [
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
    options,
    resetCreateProfileForm,
  ]);

  const createAcpModelProfile = useCallback(async () => {
    if (
      !createAcpModelDisplayName.trim() ||
      !createAcpModel.trim() ||
      !createAcpModelBaseUrl.trim() ||
      !createAcpModelApiKey.trim()
    ) {
      options.setError('ACP Model Profile 需要填写显示名、model、baseUrl、apiKey');
      return;
    }

    options.setBusyId('create-acp-model');
    options.setError(null);
    try {
      await options.callApi('/api/acp-model-profiles', {
        method: 'POST',
        body: JSON.stringify({
          projectPath: options.mutationProjectPath ?? undefined,
          displayName: createAcpModelDisplayName.trim(),
          provider: createAcpModelProvider,
          model: createAcpModel.trim(),
          baseUrl: createAcpModelBaseUrl.trim(),
          apiKey: createAcpModelApiKey.trim(),
        }),
      });
      resetCreateAcpModelForm();
      await options.refresh();
    } catch (err) {
      options.setError(err instanceof Error ? err.message : String(err));
    } finally {
      options.setBusyId(null);
    }
  }, [
    createAcpModel,
    createAcpModelApiKey,
    createAcpModelBaseUrl,
    createAcpModelDisplayName,
    createAcpModelProvider,
    options,
    resetCreateAcpModelForm,
  ]);

  return {
    providerCreateSectionProps: {
      kind: createKind,
      displayName: createDisplayName,
      protocol: createProtocol,
      baseUrl: createBaseUrl,
      apiKey: createApiKey,
      models: createModels,
      command: createAcpCommand,
      args: createAcpArgs,
      cwd: createAcpCwd,
      modelAccessMode: createAcpModelAccessMode,
      defaultModelProfileRef: createAcpModelProfileRef,
      acpModelProfiles: options.acpModelProfiles,
      busy: false,
      onKindChange: setCreateKind,
      onDisplayNameChange: setCreateDisplayName,
      onProtocolChange: setCreateProtocol,
      onBaseUrlChange: setCreateBaseUrl,
      onApiKeyChange: setCreateApiKey,
      onModelsChange: setCreateModels,
      onCommandChange: setCreateAcpCommand,
      onArgsChange: setCreateAcpArgs,
      onCwdChange: setCreateAcpCwd,
      onModelAccessModeChange: setCreateAcpModelAccessMode,
      onDefaultModelProfileRefChange: setCreateAcpModelProfileRef,
      onCreate: createProfile,
    },
    acpModelCreateSectionProps: {
      displayName: createAcpModelDisplayName,
      provider: createAcpModelProvider,
      model: createAcpModel,
      baseUrl: createAcpModelBaseUrl,
      apiKey: createAcpModelApiKey,
      busy: false,
      onDisplayNameChange: setCreateAcpModelDisplayName,
      onProviderChange: setCreateAcpModelProvider,
      onModelChange: setCreateAcpModel,
      onBaseUrlChange: setCreateAcpModelBaseUrl,
      onApiKeyChange: setCreateAcpModelApiKey,
      onCreate: createAcpModelProfile,
    },
  };
}
