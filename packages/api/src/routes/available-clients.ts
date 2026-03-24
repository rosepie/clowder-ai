/**
 * Available Clients Route
 *
 * GET  /api/available-clients — returns detected CLI clients
 * POST /api/available-clients/refresh — re-detect (force refresh)
 */

import type { FastifyPluginAsync } from 'fastify';
import { getAvailableClients, refreshAvailableClients } from '../utils/client-detection.js';

export const availableClientsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/available-clients', async () => {
    return { clients: await getAvailableClients() };
  });

  app.post('/api/available-clients/refresh', async () => {
    return { clients: await refreshAvailableClients() };
  });
};
