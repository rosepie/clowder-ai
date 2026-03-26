'use client';

import { HubAcpModelProfilesSection } from './HubAcpModelProfilesSection';
import { HubProviderProfileItem } from './HubProviderProfileItem';
import { CreateAcpModelProfileSection, CreateApiKeyProfileSection, ProviderProfilesSummaryCard } from './hub-provider-profiles.sections';
import { resolveAccountActionId } from './hub-provider-profiles.view';
import { useProviderProfilesState } from './useProviderProfilesState';

export function HubProviderProfilesTab() {
  const {
    loading,
    error,
    data,
    busyId,
    displayCards,
    acpModelProfiles,
    isProfileBusy,
    providerCreateSectionProps,
    acpModelCreateSectionProps,
    saveProfile,
    deleteProfile,
    testProfile,
    saveAcpModelProfile,
    deleteAcpModelProfile,
  } = useProviderProfilesState();

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
            busy={isProfileBusy(profile)}
            onSave={(payload) => saveProfile(resolveAccountActionId(profile), payload)}
            onDelete={() => deleteProfile(resolveAccountActionId(profile))}
            onTest={() => testProfile(resolveAccountActionId(profile))}
          />
        ))}
      </div>

      <CreateApiKeyProfileSection {...providerCreateSectionProps} />

      <HubAcpModelProfilesSection
        profiles={acpModelProfiles}
        busyId={busyId}
        onSave={saveAcpModelProfile}
        onDelete={deleteAcpModelProfile}
      />

      <CreateAcpModelProfileSection {...acpModelCreateSectionProps} />

      <p className="text-xs leading-5 text-[#B59A88]">
        secrets 存储在 `.cat-cafe/provider-profiles.secrets.local.json` 和 `.cat-cafe/acp-model-profiles.secrets.local.json`。
      </p>
    </div>
  );
}
