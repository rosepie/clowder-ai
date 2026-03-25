import type { BootstrapBindings, BuiltinAccountClient, ProviderProfileView } from '../config/provider-profiles.types.js';

export type VisibleClientId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'dare'
  | 'opencode'
  | 'antigravity'
  | 'relayclaw';

const ALL_CLIENT_IDS: VisibleClientId[] = ['anthropic', 'openai', 'google', 'dare', 'opencode', 'antigravity', 'relayclaw'];
const ALL_BUILTIN_AUTH_CLIENTS: BuiltinAccountClient[] = ['anthropic', 'openai', 'google', 'dare', 'opencode'];

function parseCsvEnv<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: readonly T[]): T[] {
  if (raw === undefined) return [...fallback];
  if (!raw.trim()) return [];

  const allowedSet = new Set(allowed);
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is T => allowedSet.has(value as T));
  return Array.from(new Set(values));
}

export function getAllowedClientIds(): VisibleClientId[] {
  return parseCsvEnv(process.env.CAT_CAFE_ALLOWED_CLIENTS, ALL_CLIENT_IDS, ALL_CLIENT_IDS);
}

export function isClientAllowed(client: string): client is VisibleClientId {
  return getAllowedClientIds().includes(client as VisibleClientId);
}

export function filterAllowedClients<T extends { id: string }>(clients: readonly T[]): T[] {
  const allowed = new Set(getAllowedClientIds());
  return clients.filter((client) => allowed.has(client.id as VisibleClientId));
}

export function getAllowedBuiltinBindingClients(): BuiltinAccountClient[] {
  const allowed = new Set(getAllowedClientIds());
  return ALL_BUILTIN_AUTH_CLIENTS.filter((client) => allowed.has(client));
}

export function getVisibleBuiltinAuthClients(): BuiltinAccountClient[] {
  const allowedBuiltinClients = getAllowedBuiltinBindingClients();
  return parseCsvEnv(
    process.env.CAT_CAFE_VISIBLE_BUILTIN_AUTH_CLIENTS,
    ALL_BUILTIN_AUTH_CLIENTS,
    allowedBuiltinClients,
  ).filter((client) => allowedBuiltinClients.includes(client));
}

export function filterProviderProfilesForVisibility(profiles: readonly ProviderProfileView[]): ProviderProfileView[] {
  const visibleBuiltinClients = new Set(getVisibleBuiltinAuthClients());
  return profiles.filter((profile) => !profile.builtin || (profile.client ? visibleBuiltinClients.has(profile.client) : false));
}

export function filterBootstrapBindingsForAllowedClients(bindings: BootstrapBindings): BootstrapBindings {
  const allowedClients = new Set(getAllowedBuiltinBindingClients());
  return Object.fromEntries(
    Object.entries(bindings).filter(([client]) => allowedClients.has(client as BuiltinAccountClient)),
  ) as BootstrapBindings;
}
