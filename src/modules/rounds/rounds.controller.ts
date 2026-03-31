// src/modules/rounds/rounds.controller.ts
/**
 * @fileoverview REST endpoints for the Rounds & Tasks dashboard view.
 *
 * GET  /api/rounds/steward      → Estate Steward history (last 14 rounds)
 * GET  /api/rounds/tasks        → Queue state (pending/running/failed/completed)
 * POST /api/rounds/tasks/:id/retry → Retry a failed task
 * GET  /api/rounds/projects     → Ainulindale project progress
 */

import type { FastifyInstance } from 'fastify';
import { getProjects, getQueueState, getStewardHistory, retryTask } from './rounds.service.js';

export function roundsRoutes(fastify: FastifyInstance) {
  const redisUrl = process.env.REDIS_URL;

  // ── Estate Steward history ──────────────────────────────────────────────────
  fastify.get('/api/rounds/steward', async (_request, reply) => {
    try {
      const rounds = await getStewardHistory(redisUrl);
      return reply.send({
        status: 'success',
        data: rounds,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      fastify.log.error(err, '[rounds] /api/rounds/steward error');
      return reply.code(500).send({ status: 'error', message: 'Failed to fetch steward history' });
    }
  });

  // ── Task queue state ────────────────────────────────────────────────────────
  fastify.get('/api/rounds/tasks', async (_request, reply) => {
    try {
      const state = await getQueueState(redisUrl);
      return reply.send({
        status: 'success',
        data: state,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      fastify.log.error(err, '[rounds] /api/rounds/tasks error');
      return reply.code(500).send({ status: 'error', message: 'Failed to fetch task queue' });
    }
  });

  // ── Retry failed task ───────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>('/api/rounds/tasks/:id/retry', async (request, reply) => {
    try {
      const { id } = request.params;
      const success = await retryTask(id, redisUrl);

      if (!success) {
        return reply.code(404).send({
          status: 'error',
          message: `Task ${id} not found in failed queue`,
        });
      }

      return reply.send({
        status: 'success',
        data: { taskId: id, requeued: true },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      fastify.log.error(err, '[rounds] /api/rounds/tasks/:id/retry error');
      return reply.code(500).send({ status: 'error', message: 'Failed to retry task' });
    }
  });

  // ── Ainulindale project progress ────────────────────────────────────────────
  fastify.get('/api/rounds/projects', async (_request, reply) => {
    try {
      const projects = await getProjects(redisUrl);
      return reply.send({
        status: 'success',
        data: projects,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      fastify.log.error(err, '[rounds] /api/rounds/projects error');
      return reply.code(500).send({ status: 'error', message: 'Failed to fetch projects' });
    }
  });
}
