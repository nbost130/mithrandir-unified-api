// src/modules/tirith/index.ts
/**
 * @fileoverview Tirith monitoring module entry point.
 * Registers the MCP server (tool/resource access for AI agents)
 * and REST routes (HTTP access for dashboards and scripts).
 */

import type { FastifyInstance } from 'fastify';
import { tirithMcpPlugin } from './mcp-plugin.js';
import { tirithRoutes } from './rest-routes.js';

export async function registerTirithModule(fastify: FastifyInstance) {
  await tirithMcpPlugin(fastify);
  tirithRoutes(fastify);

  fastify.log.info('Tirith monitoring module registered (MCP + REST)');
}
