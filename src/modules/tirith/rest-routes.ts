// src/modules/tirith/rest-routes.ts
/**
 * @fileoverview REST endpoints for the Tirith monitoring module.
 * Mirrors all MCP tools as standard HTTP GET routes under /api/tirith/.
 * Follows the same response envelope as services.controller.ts.
 */

import type { FastifyInstance } from 'fastify';
// Resource handlers
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

function success<T>(data: T) {
  return {
    status: 'success' as const,
    data,
    timestamp: new Date().toISOString(),
  };
}

function error(message: string, code: string, statusCode = 500) {
  return {
    statusCode,
    body: {
      status: 'error' as const,
      message,
      code,
      timestamp: new Date().toISOString(),
    },
  };
}

export function tirithRoutes(fastify: FastifyInstance) {
  // ── System Health ────────────────────────────────────────────────

  fastify.get('/api/tirith/health', async (request, reply) => {
    try {
      const result = await handleSystemHealth();
      return reply.code(200).send(success(result));
    } catch (err) {
      request.log.error(err, 'Tirith: system health check failed');
      const e = error('Failed to get system health', 'HEALTH_CHECK_FAILED');
      return reply.code(e.statusCode).send(e.body);
    }
  });

  // ── Service Status (all) ─────────────────────────────────────────

  fastify.get('/api/tirith/services', async (request, reply) => {
    try {
      const result = await handleServiceStatus({ service: 'all', checkHealth: true });
      return reply.code(200).send(success(result));
    } catch (err) {
      request.log.error(err, 'Tirith: service status check failed');
      const e = error('Failed to get service status', 'SERVICE_STATUS_FAILED');
      return reply.code(e.statusCode).send(e.body);
    }
  });

  // ── Service Status (single) ──────────────────────────────────────

  fastify.get<{
    Params: { name: string };
    Querystring: { checkHealth?: string };
  }>('/api/tirith/services/:name', async (request, reply) => {
    const { name } = request.params;
    const checkHealth = request.query.checkHealth !== 'false';

    try {
      const result = await handleServiceStatus({ service: name, checkHealth });
      return reply.code(200).send(success(result));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      request.log.error(err, 'Tirith: service status check failed for %s', name);

      if (msg.includes('not found')) {
        const e = error(`Service "${name}" not found`, 'SERVICE_NOT_FOUND', 404);
        return reply.code(e.statusCode).send(e.body);
      }
      const e = error('Failed to get service status', 'SERVICE_STATUS_FAILED');
      return reply.code(e.statusCode).send(e.body);
    }
  });

  // ── Process List ─────────────────────────────────────────────────

  fastify.get<{
    Querystring: { sortBy?: string; limit?: string; filter?: string };
  }>('/api/tirith/processes', async (request, reply) => {
    const { sortBy, limit, filter } = request.query;

    try {
      const parsedSortBy = sortBy === 'memory' ? 'memory' : 'cpu';
      const result = await handleProcessList({
        sortBy: parsedSortBy,
        limit: limit ? Number.parseInt(limit, 10) : undefined,
        filter,
      });
      return reply.code(200).send(success(result));
    } catch (err) {
      request.log.error(err, 'Tirith: process list failed');
      const e = error('Failed to get process list', 'PROCESS_LIST_FAILED');
      return reply.code(e.statusCode).send(e.body);
    }
  });

  // ── Journal Query ────────────────────────────────────────────────

  fastify.get<{
    Params: { unit: string };
    Querystring: { since?: string; until?: string; priority?: string; search?: string; limit?: string };
  }>('/api/tirith/journal/:unit', async (request, reply) => {
    const { unit } = request.params;
    const { since, until, priority, search, limit } = request.query;

    try {
      const result = await handleJournalQuery({
        unit,
        since,
        until,
        priority: priority ? Number.parseInt(priority, 10) : undefined,
        search,
        limit: limit ? Number.parseInt(limit, 10) : undefined,
      });
      return reply.code(200).send(success(result));
    } catch (err) {
      request.log.error(err, 'Tirith: journal query failed for %s', unit);
      const e = error('Failed to query journal', 'JOURNAL_QUERY_FAILED');
      return reply.code(e.statusCode).send(e.body);
    }
  });

  // ── Docker Status ────────────────────────────────────────────────

  fastify.get<{
    Querystring: { filter?: string };
  }>('/api/tirith/docker', async (request, reply) => {
    const { filter } = request.query;

    try {
      const result = await handleDockerStatus({ filter });
      return reply.code(200).send(success(result));
    } catch (err) {
      request.log.error(err, 'Tirith: docker status check failed');
      const e = error('Failed to get Docker status', 'DOCKER_STATUS_FAILED');
      return reply.code(e.statusCode).send(e.body);
    }
  });

  // ── Port Check ───────────────────────────────────────────────────

  fastify.get<{
    Querystring: { ports?: string; protocol?: string };
  }>('/api/tirith/ports', async (request, reply) => {
    const { ports, protocol } = request.query;

    try {
      // If ports query param given, parse as comma-separated numbers; otherwise check manifest ports
      const parsedPorts: number[] | 'manifest' = ports
        ? ports
            .split(',')
            .map((p) => Number.parseInt(p.trim(), 10))
            .filter((n) => !Number.isNaN(n))
        : 'manifest';
      const parsedProtocol = protocol === 'udp' || protocol === 'both' ? protocol : ('tcp' as const);
      const result = await handlePortCheck({ ports: parsedPorts, protocol: parsedProtocol });
      return reply.code(200).send(success(result));
    } catch (err) {
      request.log.error(err, 'Tirith: port check failed');
      const e = error('Failed to check ports', 'PORT_CHECK_FAILED');
      return reply.code(e.statusCode).send(e.body);
    }
  });

  // ── Cron Health ──────────────────────────────────────────────────

  fastify.get('/api/tirith/cron', async (request, reply) => {
    try {
      const result = await handleCronHealth();
      return reply.code(200).send(success(result));
    } catch (err) {
      request.log.error(err, 'Tirith: cron health check failed');
      const e = error('Failed to check cron health', 'CRON_HEALTH_FAILED');
      return reply.code(e.statusCode).send(e.body);
    }
  });

  // ── Network Status ───────────────────────────────────────────────

  fastify.get('/api/tirith/network', async (request, reply) => {
    try {
      const result = await handleNetworkStatus();
      return reply.code(200).send(success(result));
    } catch (err) {
      request.log.error(err, 'Tirith: network status check failed');
      const e = error('Failed to get network status', 'NETWORK_STATUS_FAILED');
      return reply.code(e.statusCode).send(e.body);
    }
  });

  // ── Redis Info ───────────────────────────────────────────────────

  fastify.get<{
    Querystring: { keyPattern?: string; keyLimit?: string };
  }>('/api/tirith/redis', async (request, reply) => {
    const { keyPattern, keyLimit } = request.query;

    try {
      const result = await handleRedisInfo({
        keyPattern,
        keyLimit: keyLimit ? Number.parseInt(keyLimit, 10) : undefined,
      });
      return reply.code(200).send(success(result));
    } catch (err) {
      request.log.error(err, 'Tirith: Redis info check failed');
      const e = error('Failed to get Redis info', 'REDIS_INFO_FAILED');
      return reply.code(e.statusCode).send(e.body);
    }
  });

  // ── Estate Diff ──────────────────────────────────────────────────

  fastify.get<{
    Querystring: { section?: string };
  }>('/api/tirith/diff', async (request, reply) => {
    const { section } = request.query;

    try {
      const result = await handleEstateDiff({ section });
      return reply.code(200).send(success(result));
    } catch (err) {
      request.log.error(err, 'Tirith: estate diff failed');
      const e = error('Failed to compute estate diff', 'ESTATE_DIFF_FAILED');
      return reply.code(e.statusCode).send(e.body);
    }
  });

  // ── Manifest Resource ────────────────────────────────────────────

  fastify.get('/api/tirith/manifest', async (request, reply) => {
    try {
      const result = await handleManifestResource();
      return reply.code(200).send(success(result));
    } catch (err) {
      request.log.error(err, 'Tirith: manifest resource failed');
      const e = error('Failed to get estate manifest', 'MANIFEST_FAILED');
      return reply.code(e.statusCode).send(e.body);
    }
  });
}
