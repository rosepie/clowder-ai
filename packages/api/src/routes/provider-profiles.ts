import type { FastifyPluginAsync } from 'fastify';
import { acpModelProfilesRoutes } from './acp-model-profiles.js';
import { providerProfileManagementRoutes } from './provider-profile-management-routes.js';
import { providerProfileTestRoutes } from './provider-profile-test-routes.js';
import type { ProviderProfilesRoutesOptions } from './provider-profiles.shared.js';

export type { ProviderProfilesRoutesOptions } from './provider-profiles.shared.js';

export const providerProfilesRoutes: FastifyPluginAsync<ProviderProfilesRoutesOptions> = async (app, opts) => {
  await app.register(acpModelProfilesRoutes);
  await app.register(providerProfileManagementRoutes, opts);
  await app.register(providerProfileTestRoutes, opts);
};
