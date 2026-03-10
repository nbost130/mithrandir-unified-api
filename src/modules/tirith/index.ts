// src/modules/tirith/index.ts
/**
 * @fileoverview Tirith monitoring module entry point.
 * Registers the MCP server (tool/resource access for AI agents)
 * and REST routes (HTTP access for dashboards and scripts).
 */

import type { FastifyInstance } from 'fastify';
import { tirithMcpPlugin } from './mcp-plugin.js';
import { createMetricsStore } from './metrics-store.js';
import { tirithRoutes } from './rest-routes.js';
import { handleSystemHealth } from './tools/system-health.js';

const RECORD_INTERVAL_MS = Number(process.env.TIRITH_RECORD_INTERVAL_MS ?? 5 * 60 * 1000); // 5 min default

export async function registerTirithModule(fastify: FastifyInstance) {
  await tirithMcpPlugin(fastify);
  tirithRoutes(fastify);

  // Periodic health recording to Redis
  const store = createMetricsStore();

  async function recordSnapshot() {
    try {
      const snapshot = await handleSystemHealth();
      await store.storeSnapshot(snapshot);
      await store.setCurrentSnapshot(snapshot);
      await store.trimHistory();
    } catch (err) {
      fastify.log.warn({ err }, 'Tirith: failed to record health snapshot');
    }
  }

  // Record initial snapshot after a brief delay (let server finish starting)
  const initialTimeout = setTimeout(recordSnapshot, 5000);
  const interval = setInterval(recordSnapshot, RECORD_INTERVAL_MS);

  // Cleanup on shutdown
  fastify.addHook('onClose', async () => {
    clearTimeout(initialTimeout);
    clearInterval(interval);
    await store.disconnect();
  });

  fastify.log.info(`Tirith monitoring module registered (MCP + REST, recording every ${RECORD_INTERVAL_MS / 1000}s)`);
}
