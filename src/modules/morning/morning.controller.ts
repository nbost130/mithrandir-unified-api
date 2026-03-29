// src/modules/morning/morning.controller.ts

import type { FastifyInstance } from 'fastify';
import { getDailyBread, getTelosGoal, getTopTasks } from './morning.service.js';

/**
 * Morning Focus Forge — REST endpoints
 *
 * GET /api/morning/bread   — Daily scripture + wisdom pair
 * GET /api/morning/tasks   — Top 3 P1/P2 Todoist tasks
 * GET /api/morning/telos   — Current weekly TELOS goal
 * GET /api/morning/all     — All three in one call (preferred for dashboard)
 */
export function morningRoutes(fastify: FastifyInstance) {
  const todoistToken = process.env.TODOIST_API_TOKEN;

  fastify.get('/api/morning/bread', async (_request, reply) => {
    const bread = getDailyBread();
    return reply.code(200).send({ success: true, data: bread, timestamp: new Date().toISOString() });
  });

  fastify.get('/api/morning/telos', async (_request, reply) => {
    const goal = getTelosGoal();
    return reply.code(200).send({ success: true, data: goal, timestamp: new Date().toISOString() });
  });

  fastify.get('/api/morning/tasks', async (_request, reply) => {
    if (!todoistToken) {
      return reply.code(503).send({
        success: false,
        error: 'TODOIST_API_TOKEN not configured',
        timestamp: new Date().toISOString(),
      });
    }
    try {
      const tasks = await getTopTasks(todoistToken);
      return reply.code(200).send({ success: true, data: tasks, timestamp: new Date().toISOString() });
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Failed to fetch Todoist tasks');
      return reply.code(502).send({
        success: false,
        error: error.message || 'Failed to fetch tasks',
        timestamp: new Date().toISOString(),
      });
    }
  });

  fastify.get('/api/morning/all', async (_request, reply) => {
    const bread = getDailyBread();
    const telos = getTelosGoal();

    let tasks: any[] = [];
    let tasksError: string | null = null;

    if (todoistToken) {
      try {
        tasks = await getTopTasks(todoistToken);
      } catch (error: any) {
        tasksError = error.message || 'Failed to fetch tasks';
        fastify.log.warn({ err: error }, 'Morning: Todoist fetch failed, returning partial data');
      }
    } else {
      tasksError = 'TODOIST_API_TOKEN not configured';
    }

    return reply.code(200).send({
      success: true,
      data: {
        bread,
        telos,
        tasks,
        tasksError,
      },
      timestamp: new Date().toISOString(),
    });
  });
}
