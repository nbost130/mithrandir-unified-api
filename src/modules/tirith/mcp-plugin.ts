// src/modules/tirith/mcp-plugin.ts
/**
 * @fileoverview MCP (Model Context Protocol) plugin for Tirith monitoring.
 * Creates an McpServer with all 10 tools and 3 resources, mounted at /mcp.
 * Each request gets a fresh McpServer + stateless transport — no session persistence.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
// Metrics store
import { createMetricsStore } from './metrics-store.js';
// Resource handlers
import { handleHealthCurrent } from './resources/health-current.js';
import { handleHealthHistory } from './resources/health-history.js';
import { handleManifestResource } from './resources/manifest-resource.js';
import { handleCronHealth } from './tools/cron-health.js';
import { handleDockerStatus } from './tools/docker-status.js';
import { handleEstateDiff } from './tools/estate-diff.js';
import { handleJournalQuery } from './tools/journal-query.js';
import { handleNetworkStatus } from './tools/network-status.js';
import { handlePortCheck } from './tools/port-check.js';
import { handleProcessList } from './tools/process-list.js';
import { handleRedisInfo } from './tools/redis-info.js';
import { handleServiceStatus } from './tools/service-status.js';
// Tool handlers
import { handleSystemHealth } from './tools/system-health.js';

function jsonContent(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

/**
 * Register all Tirith tools and resources on an McpServer instance.
 * Extracted into a factory so we can create a fresh server per request
 * (required for stateless Streamable HTTP — McpServer.connect() is one-shot).
 */
function createTirithMcpServer() {
  const mcpServer = new McpServer({
    name: 'mithrandir-monitoring',
    version: '1.0.0',
    description:
      'Mithrandir server observability — system health, services, Docker, network, logs, Redis, and estate drift detection. Use these tools to check on the server or diagnose issues.',
  });

  const store = createMetricsStore();

  // ── Tools ──────────────────────────────────────────────────────────

  mcpServer.tool(
    'tirith_system_health',
    'Quick overview of Mithrandir system vitals: CPU, memory, disk, load, uptime',
    async () => {
      const result = await handleSystemHealth();
      return jsonContent(result);
    }
  );

  mcpServer.tool(
    'tirith_service_status',
    'Check status of a systemd or Docker service',
    {
      service: z.string().describe('Service name or "all"'),
      checkHealth: z.boolean().optional().default(true).describe('Run health endpoint check if configured'),
    },
    async (params) => {
      const result = await handleServiceStatus({ service: params.service, checkHealth: params.checkHealth });
      return jsonContent(result);
    }
  );

  mcpServer.tool(
    'tirith_process_list',
    'List running processes with resource usage',
    {
      sortBy: z.enum(['cpu', 'memory']).optional().default('cpu').describe('Sort field: cpu or memory'),
      limit: z.number().optional().default(20).describe('Max processes to return'),
      filter: z.string().optional().describe('Filter by process name substring'),
    },
    async (params) => {
      const result = await handleProcessList({
        sortBy: params.sortBy,
        limit: params.limit,
        filter: params.filter,
      });
      return jsonContent(result);
    }
  );

  mcpServer.tool(
    'tirith_journal_query',
    'Query systemd journal logs for a unit',
    {
      unit: z.string().describe('Systemd unit name (e.g. "ithildin")'),
      since: z.string().optional().describe('Start time (e.g. "1 hour ago", ISO timestamp)'),
      until: z.string().optional().describe('End time'),
      priority: z.number().optional().describe('Max priority level (0=emerg through 7=debug)'),
      search: z.string().optional().describe('Grep pattern to filter lines'),
      limit: z.number().optional().default(100).describe('Max lines to return'),
    },
    async (params) => {
      const result = await handleJournalQuery({
        unit: params.unit,
        since: params.since,
        until: params.until,
        priority: params.priority,
        search: params.search,
        limit: params.limit,
      });
      return jsonContent(result);
    }
  );

  mcpServer.tool(
    'tirith_docker_status',
    'List Docker containers and their status',
    {
      filter: z.string().optional().describe('Filter by container name substring'),
    },
    async (params) => {
      const result = await handleDockerStatus({ filter: params.filter });
      return jsonContent(result);
    }
  );

  mcpServer.tool(
    'tirith_port_check',
    'Check if specific ports are listening',
    {
      ports: z
        .union([z.array(z.number()), z.literal('manifest')])
        .describe('Port numbers to check (array of numbers) or "manifest" to check all manifest ports'),
      protocol: z.enum(['tcp', 'udp', 'both']).optional().default('tcp').describe('Protocol filter'),
    },
    async (params) => {
      const result = await handlePortCheck({ ports: params.ports, protocol: params.protocol });
      return jsonContent(result);
    }
  );

  mcpServer.tool('tirith_cron_health', 'Check health of cron jobs defined in estate manifest', async () => {
    const result = await handleCronHealth();
    return jsonContent(result);
  });

  mcpServer.tool(
    'tirith_network_status',
    'Check network interfaces, DNS resolution, and Tailscale connectivity',
    async () => {
      const result = await handleNetworkStatus();
      return jsonContent(result);
    }
  );

  mcpServer.tool(
    'tirith_redis_info',
    'Get Redis server info and optionally scan keys',
    {
      keyPattern: z.string().optional().describe('Glob pattern for key scan (e.g. "ithildin:*")'),
      keyLimit: z.number().optional().default(50).describe('Max keys to return from scan'),
    },
    async (params) => {
      const result = await handleRedisInfo({ keyPattern: params.keyPattern, keyLimit: params.keyLimit });
      return jsonContent(result);
    }
  );

  mcpServer.tool(
    'tirith_estate_diff',
    'Compare running state against estate manifest and report drift',
    {
      section: z
        .string()
        .optional()
        .default('all')
        .describe('Limit diff to section: systemd, docker, cron, endpoints, or all'),
    },
    async (params) => {
      const result = await handleEstateDiff({ section: params.section });
      return jsonContent(result);
    }
  );

  // ── Resources ──────────────────────────────────────────────────────

  mcpServer.resource('health-current', 'tirith://health/current', async (uri) => {
    const data = await handleHealthCurrent(store);
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  });

  mcpServer.resource('health-history', 'tirith://health/history', async (uri) => {
    const data = await handleHealthHistory(store);
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  });

  mcpServer.resource('services-manifest', 'tirith://services/manifest', async (uri) => {
    const data = await handleManifestResource();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  });

  return { mcpServer, store };
}

export async function tirithMcpPlugin(fastify: FastifyInstance) {
  // ── Fastify mount ──────────────────────────────────────────────────
  // Create a fresh McpServer per request for stateless Streamable HTTP.
  // McpServer.connect() is one-shot — reusing across requests causes
  // "Already connected to a transport" errors.

  fastify.all('/mcp', async (request, reply) => {
    const { mcpServer, store } = createTirithMcpServer();

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless — no session persistence
    });

    await mcpServer.connect(transport);

    await transport.handleRequest(request.raw, reply.raw, request.body as Record<string, unknown> | undefined);

    // Clean up: close transport + server after handling
    await mcpServer.close();
    await store.disconnect();

    // Prevent Fastify from sending its own response — transport already wrote to reply.raw
    reply.hijack();
  });

  fastify.log.info('Tirith MCP server registered at /mcp (10 tools, 3 resources)');
}
