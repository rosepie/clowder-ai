import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import type {
  AcpModelProfileMeta,
  AcpModelProfilesMetaFile,
  AcpModelProfilesSecretsFile,
  AcpModelProfilesView,
  AcpModelProfileView,
  AcpModelProviderType,
  CreateAcpModelProfileInput,
  RuntimeAcpModelProfile,
  UpdateAcpModelProfileInput,
} from './acp-model-profiles.types.js';
import { resolveProviderProfilesRoot } from './provider-profiles-root.js';

export type {
  AcpModelProfileMeta,
  AcpModelProfilesView,
  AcpModelProfileView,
  AcpModelProviderType,
  CreateAcpModelProfileInput,
  RuntimeAcpModelProfile,
  UpdateAcpModelProfileInput,
} from './acp-model-profiles.types.js';

const CAT_CAFE_DIR = '.cat-cafe';
const META_FILENAME = 'acp-model-profiles.json';
const SECRETS_FILENAME = 'acp-model-profiles.secrets.local.json';
const modelStoreLocks = new Map<string, Promise<void>>();

function safePath(projectRoot: string, ...segments: string[]): string {
  const root = resolve(projectRoot);
  const normalized = resolve(root, ...segments);
  const rel = relative(root, normalized);
  if (rel.startsWith(`..${sep}`) || rel === '..') {
    throw new Error(`Path escapes project root: ${normalized}`);
  }
  return normalized;
}

async function withStorageRootLock<T>(storageRoot: string, action: () => Promise<T>): Promise<T> {
  const previous = modelStoreLocks.get(storageRoot) ?? Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  const running = previous.then(() => gate);
  modelStoreLocks.set(storageRoot, running);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (modelStoreLocks.get(storageRoot) === running) {
      modelStoreLocks.delete(storageRoot);
    }
  }
}

async function withAcpModelStoreLock<T>(projectRoot: string, action: (storageRoot: string) => Promise<T>): Promise<T> {
  const storageRoot = await resolveProviderProfilesRoot(projectRoot);
  return withStorageRootLock(storageRoot, () => action(storageRoot));
}

function createDefaultMeta(): AcpModelProfilesMetaFile {
  return { version: 1, profiles: [] };
}

function createDefaultSecrets(): AcpModelProfilesSecretsFile {
  return { version: 1, profiles: {} };
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `acp-model-${randomUUID().slice(0, 8)}`;
}

function createUniqueProfileId(existingProfiles: AcpModelProfileMeta[], displayName: string): string {
  const seed = slugify(displayName);
  const existingIds = new Set(existingProfiles.map((profile) => profile.id));
  if (!existingIds.has(seed)) return seed;
  let counter = 2;
  while (existingIds.has(`${seed}-${counter}`)) counter += 1;
  return `${seed}-${counter}`;
}

function normalizeBaseUrl(baseUrl: string | undefined): string | undefined {
  const trimmed = baseUrl?.trim();
  return trimmed ? trimmed.replace(/\/+$/, '') : undefined;
}

function normalizeProvider(provider: string | undefined): AcpModelProviderType | undefined {
  if (
    provider === 'openai_compatible' ||
    provider === 'bigmodel' ||
    provider === 'minimax' ||
    provider === 'echo'
  ) {
    return provider;
  }
  return undefined;
}

function normalizePositiveNumber(value: number | undefined | null): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

function normalizeUnitInterval(value: number | undefined | null): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return undefined;
  return value;
}

function normalizeTemperature(value: number | undefined | null): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 2) return undefined;
  return value;
}

function requireDisplayName(input: CreateAcpModelProfileInput | UpdateAcpModelProfileInput): string {
  const displayName = input.displayName ?? input.name;
  const trimmed = displayName?.trim();
  if (!trimmed) throw new Error('displayName or name is required');
  return trimmed;
}

function normalizeMeta(meta: AcpModelProfilesMetaFile | null): AcpModelProfilesMetaFile {
  if (!meta || meta.version !== 1 || !Array.isArray(meta.profiles)) return createDefaultMeta();
  return {
    version: 1,
    profiles: meta.profiles
      .filter((profile) => typeof profile?.id === 'string' && profile.id.trim().length > 0)
      .map((profile) => ({
        id: profile.id.trim(),
        displayName: profile.displayName.trim(),
        provider: profile.provider,
        model: profile.model.trim(),
        baseUrl: profile.baseUrl.trim(),
        ...(profile.sslVerify !== undefined ? { sslVerify: profile.sslVerify } : {}),
        ...(normalizeTemperature(profile.temperature) !== undefined
          ? { temperature: normalizeTemperature(profile.temperature) }
          : {}),
        ...(normalizeUnitInterval(profile.topP) !== undefined ? { topP: normalizeUnitInterval(profile.topP) } : {}),
        ...(normalizePositiveNumber(profile.maxTokens) !== undefined
          ? { maxTokens: normalizePositiveNumber(profile.maxTokens) }
          : {}),
        ...(normalizePositiveNumber(profile.contextWindow) !== undefined
          ? { contextWindow: normalizePositiveNumber(profile.contextWindow) }
          : {}),
        ...(normalizePositiveNumber(profile.connectTimeoutSeconds) !== undefined
          ? { connectTimeoutSeconds: normalizePositiveNumber(profile.connectTimeoutSeconds) }
          : {}),
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      })),
  };
}

function normalizeSecrets(secrets: AcpModelProfilesSecretsFile | null): AcpModelProfilesSecretsFile {
  if (!secrets || secrets.version !== 1 || typeof secrets.profiles !== 'object' || !secrets.profiles) {
    return createDefaultSecrets();
  }
  return { version: 1, profiles: { ...secrets.profiles } };
}

async function readJsonOrNull<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp-${randomUUID()}`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

async function readRaw(projectRoot: string): Promise<{
  meta: AcpModelProfilesMetaFile;
  secrets: AcpModelProfilesSecretsFile;
  metaPath: string;
  secretsPath: string;
}> {
  const storageRoot = await resolveProviderProfilesRoot(projectRoot);
  const dir = safePath(storageRoot, CAT_CAFE_DIR);
  const metaPath = safePath(storageRoot, CAT_CAFE_DIR, META_FILENAME);
  const secretsPath = safePath(storageRoot, CAT_CAFE_DIR, SECRETS_FILENAME);
  await mkdir(dir, { recursive: true });
  return {
    meta: normalizeMeta(await readJsonOrNull<AcpModelProfilesMetaFile>(metaPath)),
    secrets: normalizeSecrets(await readJsonOrNull<AcpModelProfilesSecretsFile>(secretsPath)),
    metaPath,
    secretsPath,
  };
}

async function writeRaw(
  metaPath: string,
  secretsPath: string,
  meta: AcpModelProfilesMetaFile,
  secrets: AcpModelProfilesSecretsFile,
): Promise<void> {
  await writeJsonAtomic(secretsPath, secrets);
  await writeJsonAtomic(metaPath, meta);
}

function toViewProfile(profile: AcpModelProfileMeta, secrets: AcpModelProfilesSecretsFile): AcpModelProfileView {
  return {
    ...profile,
    name: profile.displayName,
    hasApiKey: Boolean(secrets.profiles[profile.id]?.apiKey),
  };
}

function findProfile(meta: AcpModelProfilesMetaFile, profileId: string): AcpModelProfileMeta | undefined {
  return meta.profiles.find((profile) => profile.id === profileId);
}

export async function readAcpModelProfiles(projectRoot: string): Promise<AcpModelProfilesView> {
  return withAcpModelStoreLock(projectRoot, async () => {
    const { meta, secrets, metaPath, secretsPath } = await readRaw(projectRoot);
    await writeRaw(metaPath, secretsPath, meta, secrets);
    return { profiles: meta.profiles.map((profile) => toViewProfile(profile, secrets)) };
  });
}

export async function createAcpModelProfile(
  projectRoot: string,
  input: CreateAcpModelProfileInput,
): Promise<AcpModelProfileView> {
  return withAcpModelStoreLock(projectRoot, async () => {
    const { meta, secrets, metaPath, secretsPath } = await readRaw(projectRoot);
    const displayName = requireDisplayName(input);
    const provider = normalizeProvider(input.provider);
    if (!provider) throw new Error('provider is required');
    const model = input.model?.trim();
    if (!model) throw new Error('model is required');
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    if (!baseUrl) throw new Error('baseUrl is required');
    const apiKey = input.apiKey?.trim();
    if (!apiKey) throw new Error('apiKey is required');

    const now = new Date().toISOString();
    const profile: AcpModelProfileMeta = {
      id: createUniqueProfileId(meta.profiles, displayName),
      displayName,
      provider,
      model,
      baseUrl,
      ...(input.sslVerify !== undefined ? { sslVerify: input.sslVerify } : {}),
      ...(normalizeTemperature(input.temperature) !== undefined
        ? { temperature: normalizeTemperature(input.temperature) }
        : {}),
      ...(normalizeUnitInterval(input.topP) !== undefined ? { topP: normalizeUnitInterval(input.topP) } : {}),
      ...(normalizePositiveNumber(input.maxTokens) !== undefined
        ? { maxTokens: normalizePositiveNumber(input.maxTokens) }
        : {}),
      ...(normalizePositiveNumber(input.contextWindow) !== undefined
        ? { contextWindow: normalizePositiveNumber(input.contextWindow) }
        : {}),
      ...(normalizePositiveNumber(input.connectTimeoutSeconds) !== undefined
        ? { connectTimeoutSeconds: normalizePositiveNumber(input.connectTimeoutSeconds) }
        : {}),
      createdAt: now,
      updatedAt: now,
    };

    meta.profiles.push(profile);
    secrets.profiles[profile.id] = { apiKey };
    await writeRaw(metaPath, secretsPath, meta, secrets);
    return toViewProfile(profile, secrets);
  });
}

export async function updateAcpModelProfile(
  projectRoot: string,
  profileId: string,
  input: UpdateAcpModelProfileInput,
): Promise<AcpModelProfileView> {
  return withAcpModelStoreLock(projectRoot, async () => {
    const { meta, secrets, metaPath, secretsPath } = await readRaw(projectRoot);
    const profile = findProfile(meta, profileId);
    if (!profile) throw new Error('profile not found');

    if (typeof input.name === 'string' || typeof input.displayName === 'string') {
      profile.displayName = requireDisplayName(input);
    }
    if (input.provider !== undefined) {
      const provider = normalizeProvider(input.provider);
      if (!provider) throw new Error('provider is invalid');
      profile.provider = provider;
    }
    if (input.model !== undefined) {
      const model = input.model.trim();
      if (!model) throw new Error('model is required');
      profile.model = model;
    }
    if (input.baseUrl !== undefined) {
      const baseUrl = normalizeBaseUrl(input.baseUrl);
      if (!baseUrl) throw new Error('baseUrl is required');
      profile.baseUrl = baseUrl;
    }
    if (input.sslVerify !== undefined) {
      profile.sslVerify = input.sslVerify;
    }
    if (input.temperature !== undefined) {
      const temperature = normalizeTemperature(input.temperature);
      if (temperature === undefined) delete profile.temperature;
      else profile.temperature = temperature;
    }
    if (input.topP !== undefined) {
      const topP = normalizeUnitInterval(input.topP);
      if (topP === undefined) delete profile.topP;
      else profile.topP = topP;
    }
    if (input.maxTokens !== undefined) {
      const maxTokens = normalizePositiveNumber(input.maxTokens);
      if (maxTokens === undefined) delete profile.maxTokens;
      else profile.maxTokens = maxTokens;
    }
    if (input.contextWindow !== undefined) {
      const contextWindow = normalizePositiveNumber(input.contextWindow);
      if (contextWindow === undefined) delete profile.contextWindow;
      else profile.contextWindow = contextWindow;
    }
    if (input.connectTimeoutSeconds !== undefined) {
      const connectTimeoutSeconds = normalizePositiveNumber(input.connectTimeoutSeconds);
      if (connectTimeoutSeconds === undefined) delete profile.connectTimeoutSeconds;
      else profile.connectTimeoutSeconds = connectTimeoutSeconds;
    }
    if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
      secrets.profiles[profile.id] = { apiKey: input.apiKey.trim() };
    }

    profile.updatedAt = new Date().toISOString();
    await writeRaw(metaPath, secretsPath, meta, secrets);
    return toViewProfile(profile, secrets);
  });
}

export async function deleteAcpModelProfile(projectRoot: string, profileId: string): Promise<void> {
  await withAcpModelStoreLock(projectRoot, async () => {
    const { meta, secrets, metaPath, secretsPath } = await readRaw(projectRoot);
    const profile = findProfile(meta, profileId);
    if (!profile) throw new Error('profile not found');

    const providerProfilesPath = safePath(await resolveProviderProfilesRoot(projectRoot), CAT_CAFE_DIR, 'provider-profiles.json');
    if (existsSync(providerProfilesPath)) {
      try {
        const providerMeta = JSON.parse(readFileSync(providerProfilesPath, 'utf-8')) as {
          providers?: Array<{ defaultModelProfileRef?: string; id?: string }>;
        };
        const referencedBy = (providerMeta.providers ?? [])
          .filter((item) => item.defaultModelProfileRef === profileId)
          .map((item) => item.id)
          .filter((item): item is string => typeof item === 'string');
        if (referencedBy.length > 0) {
          throw new Error(`ACP model profile "${profileId}" is still referenced by ACP providers: ${referencedBy.join(', ')}`);
        }
      } catch (error) {
        if (error instanceof Error) throw error;
      }
    }

    meta.profiles = meta.profiles.filter((item) => item.id !== profileId);
    delete secrets.profiles[profileId];
    await writeRaw(metaPath, secretsPath, meta, secrets);
  });
}

export async function getAcpModelProfile(projectRoot: string, profileId: string): Promise<AcpModelProfileView | null> {
  return withAcpModelStoreLock(projectRoot, async () => {
    const { meta, secrets, metaPath, secretsPath } = await readRaw(projectRoot);
    await writeRaw(metaPath, secretsPath, meta, secrets);
    const profile = findProfile(meta, profileId);
    return profile ? toViewProfile(profile, secrets) : null;
  });
}

export async function resolveRuntimeAcpModelProfileById(
  projectRoot: string,
  profileId: string,
): Promise<RuntimeAcpModelProfile | null> {
  return withAcpModelStoreLock(projectRoot, async () => {
    const { meta, secrets, metaPath, secretsPath } = await readRaw(projectRoot);
    await writeRaw(metaPath, secretsPath, meta, secrets);
    const profile = findProfile(meta, profileId);
    const apiKey = profile ? secrets.profiles[profile.id]?.apiKey?.trim() : undefined;
    if (!profile || !apiKey) return null;
    return {
      ...profile,
      apiKey,
    };
  });
}
