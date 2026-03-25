'use client';

import { useCallback, useState } from 'react';
import type { ApiProtocol } from './hub-provider-profiles.sections';
import type { AcpModelAccessMode, AcpModelProfileItem, ProfileItem } from './hub-provider-profiles.types';
import { TagEditor, TagPillList } from './hub-tag-editor';
import { useConfirm } from './useConfirm';

const PROTOCOL_OPTIONS: Array<{ value: ApiProtocol; label: string }> = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
];

const ACP_MODEL_ACCESS_OPTIONS: Array<{ value: AcpModelAccessMode; label: string }> = [
  { value: 'self_managed', label: 'Agent Teams 自管' },
  { value: 'clowder_default_profile', label: 'Clowder 下发 default' },
];
export interface ProfileEditPayload {
  displayName: string;
  protocol?: string;
  baseUrl?: string;
  apiKey?: string;
  models?: string[];
  modelOverride?: string | null;
  command?: string;
  args?: string[];
  cwd?: string | null;
  modelAccessMode?: AcpModelAccessMode;
  defaultModelProfileRef?: string | null;
}

interface HubProviderProfileItemProps {
  profile: ProfileItem;
  busy: boolean;
  acpModelProfiles?: AcpModelProfileItem[];
  onSave: (payload: ProfileEditPayload) => Promise<void>;
  onDelete: () => void;
  onTest?: () => Promise<void> | void;
}

function summaryText(profile: ProfileItem): string | null {
  if (profile.builtin) return null;
  if (profile.kind === 'acp') {
    const args = profile.args?.join(' ') ?? '';
    const cwd = profile.cwd ? ` · cwd=${profile.cwd}` : '';
    return `${profile.command ?? '(未设置)'} ${args}`.trim() + cwd;
  }
  const host = profile.baseUrl?.replace(/^https?:\/\//, '') ?? '(未设置)';
  return `${host} · ${profile.hasApiKey ? '已配置' : '未配置'}`;
}

export function HubProviderProfileItem({
  profile,
  busy,
  acpModelProfiles = [],
  onSave,
  onDelete,
  onTest,
}: HubProviderProfileItemProps) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState(profile.displayName);
  const [editProtocol, setEditProtocol] = useState<ApiProtocol>((profile.protocol as ApiProtocol) ?? 'anthropic');
  const [editBaseUrl, setEditBaseUrl] = useState(profile.baseUrl ?? '');
  const [editApiKey, setEditApiKey] = useState('');
  const [editModels, setEditModels] = useState<string[]>(profile.models ?? []);
  const [editCommand, setEditCommand] = useState(profile.command ?? '');
  const [editArgs, setEditArgs] = useState((profile.args ?? []).join(' '));
  const [editCwd, setEditCwd] = useState(profile.cwd ?? '');
  const [editModelAccessMode, setEditModelAccessMode] = useState<AcpModelAccessMode>(
    profile.modelAccessMode ?? 'self_managed',
  );
  const [editDefaultModelProfileRef, setEditDefaultModelProfileRef] = useState(profile.defaultModelProfileRef ?? '');

  const startEdit = useCallback(() => {
    setEditDisplayName(profile.displayName);
    setEditProtocol((profile.protocol as ApiProtocol) ?? 'anthropic');
    setEditBaseUrl(profile.baseUrl ?? '');
    setEditApiKey('');
    setEditModels(profile.models ?? []);
    setEditCommand(profile.command ?? '');
    setEditArgs((profile.args ?? []).join(' '));
    setEditCwd(profile.cwd ?? '');
    setEditModelAccessMode(profile.modelAccessMode ?? 'self_managed');
    setEditDefaultModelProfileRef(profile.defaultModelProfileRef ?? '');
    setEditing(true);
  }, [
    profile.args,
    profile.baseUrl,
    profile.command,
    profile.cwd,
    profile.defaultModelProfileRef,
    profile.displayName,
    profile.modelAccessMode,
    profile.models,
    profile.protocol,
  ]);

  const saveEdit = useCallback(async () => {
    if (profile.kind === 'acp') {
      await onSave({
        displayName: editDisplayName.trim(),
        command: editCommand.trim(),
        args: editArgs
          .split(/\s+/)
          .map((value) => value.trim())
          .filter(Boolean),
        cwd: editCwd.trim() || null,
        modelAccessMode: editModelAccessMode,
        defaultModelProfileRef:
          editModelAccessMode === 'clowder_default_profile' ? editDefaultModelProfileRef.trim() || null : null,
      });
    } else {
      await onSave({
        displayName: editDisplayName.trim(),
        ...(profile.authType === 'api_key' ? { protocol: editProtocol, baseUrl: editBaseUrl.trim() } : {}),
        ...(editApiKey.trim() ? { apiKey: editApiKey.trim() } : {}),
        models: editModels,
      });
    }
    setEditing(false);
  }, [
    editApiKey,
    editArgs,
    editBaseUrl,
    editCommand,
    editCwd,
    editDefaultModelProfileRef,
    editDisplayName,
    editModelAccessMode,
    editModels,
    editProtocol,
    onSave,
    profile.authType,
    profile.id,
    profile.kind,
  ]);

  if (editing) {
    return (
      <div className="space-y-3 rounded-[20px] border-2 border-[#E8C9AF] bg-[#FFF8F2] p-[18px]">
        <div className="space-y-2">
          <input
            value={editDisplayName}
            onChange={(e) => setEditDisplayName(e.target.value)}
            placeholder="账号显示名"
            autoComplete="off"
            className="w-full rounded border border-[#E8DCCF] bg-white px-3 py-2 text-sm placeholder:text-[#C4B5A8]"
          />
          {profile.kind === 'acp' ? (
            <>
              <input
                value={editCommand}
                onChange={(e) => setEditCommand(e.target.value)}
                placeholder="命令"
                className="w-full rounded border border-[#E8DCCF] bg-white px-3 py-2 text-sm placeholder:text-[#C4B5A8]"
              />
              <textarea
                value={editArgs}
                onChange={(e) => setEditArgs(e.target.value)}
                rows={3}
                placeholder="参数按空格分隔"
                className="w-full rounded border border-[#E8DCCF] bg-white px-3 py-2 text-sm placeholder:text-[#C4B5A8]"
              />
              <input
                value={editCwd}
                onChange={(e) => setEditCwd(e.target.value)}
                placeholder="可选 cwd"
                className="w-full rounded border border-[#E8DCCF] bg-white px-3 py-2 text-sm placeholder:text-[#C4B5A8]"
              />
              <select
                value={editModelAccessMode}
                onChange={(e) => setEditModelAccessMode(e.target.value as AcpModelAccessMode)}
                className="w-full rounded border border-[#E8DCCF] bg-white px-3 py-2 text-sm"
              >
                {ACP_MODEL_ACCESS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {editModelAccessMode === 'clowder_default_profile' ? (
                <select
                  value={editDefaultModelProfileRef}
                  onChange={(e) => setEditDefaultModelProfileRef(e.target.value)}
                  className="w-full rounded border border-[#E8DCCF] bg-white px-3 py-2 text-sm"
                >
                  <option value="">选择 ACP Model Profile</option>
                  {acpModelProfiles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.displayName}
                    </option>
                  ))}
                </select>
              ) : null}
            </>
          ) : profile.authType === 'api_key' ? (
            <>
              <input
                value={editBaseUrl}
                onChange={(e) => setEditBaseUrl(e.target.value)}
                placeholder="API 服务地址，如 https://api.example.com/v1"
                autoComplete="off"
                className="w-full rounded border border-[#E8DCCF] bg-white px-3 py-2 text-sm placeholder:text-[#C4B5A8]"
              />
              <input
                type="password"
                autoComplete="off"
                value={editApiKey}
                onChange={(e) => setEditApiKey(e.target.value)}
                placeholder={profile.hasApiKey ? '已配置 sk-••••••••（留空保持不变）' : 'sk-xxxxxxxxxxxxxxxx'}
                className="w-full rounded border border-[#E8DCCF] bg-white px-3 py-2 text-sm placeholder:text-[#C4B5A8]"
              />
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#8A776B]">可用模型</p>
                <TagEditor
                  tags={editModels}
                  tone="purple"
                  addLabel="+ 添加模型"
                  placeholder="输入模型名，如 gpt-4o"
                  emptyLabel="(至少添加 1 个模型)"
                  minCount={1}
                  onChange={setEditModels}
                />
              </div>
            </>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={saveEdit}
            disabled={busy}
            className="rounded bg-[#D49266] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#c47f52] disabled:opacity-50"
          >
            {busy ? '保存中...' : '保存'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={busy}
            className="rounded border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-[#F1E7DF] bg-[#FFFDFC] p-[18px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-[#2D2118]">{profile.displayName}</span>
            {profile.builtin ? (
              <span className="text-[11px] font-semibold text-[#8A776B] flex items-center gap-0.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                  />
                </svg>
                内置
              </span>
            ) : null}
            {!profile.builtin ? (
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  profile.kind === 'acp' ? 'bg-[#E8EEFF] text-[#4E63A6]' : 'bg-[#F3E8FF] text-[#9D7BC7]'
                }`}
              >
                {profile.kind === 'acp' ? 'acp' : 'api_key'}
              </span>
            ) : null}
          </div>
          {summaryText(profile) ? <p className="text-sm text-[#8A776B]">{summaryText(profile)}</p> : null}
          {profile.kind === 'acp' ? (
            <p className="text-xs leading-5 text-[#8A776B]">
              模型接入: {profile.modelAccessMode === 'clowder_default_profile' ? 'Clowder default profile' : 'Agent Teams 自管'}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#8A776B]">可用模型</p>
              {profile.builtin ? (
                <div className="flex flex-wrap gap-2">
                  <TagPillList tags={profile.models ?? []} emptyLabel="(暂无模型)" tone="orange" />
                </div>
              ) : (
                <TagEditor
                  tags={profile.models ?? []}
                  tone="purple"
                  addLabel="+ 添加"
                  placeholder="输入模型名"
                  emptyLabel="(暂无模型)"
                  minCount={1}
                  onChange={(nextModels) => {
                    if (busy) return;
                    void onSave({
                      displayName: profile.displayName,
                      ...(profile.authType === 'api_key' ? { baseUrl: profile.baseUrl ?? '' } : {}),
                      models: nextModels,
                    });
                  }}
                />
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {!profile.builtin ? (
            <button
              type="button"
              className="rounded-full bg-[#F7F3F0] px-3 py-1.5 text-xs font-semibold text-[#8A776B]"
              onClick={startEdit}
              disabled={busy}
            >
              编辑
            </button>
          ) : null}
          {!profile.builtin && onTest ? (
            <button
              type="button"
              className="rounded-full bg-[#EEF7F0] px-3 py-1.5 text-xs font-semibold text-[#4E8A5B]"
              onClick={() => void onTest()}
              disabled={busy}
            >
              测试
            </button>
          ) : null}
          {!profile.builtin ? (
            <button
              type="button"
              className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600"
              onClick={async () => {
                if (
                  await confirm({
                    title: '删除确认',
                    message: `确认删除账号「${profile.displayName}」吗？该操作不可撤销。`,
                    variant: 'danger',
                    confirmLabel: '删除',
                  })
                ) {
                  onDelete();
                }
              }}
              disabled={busy}
            >
              删除
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
