// src/modules/services/services.controller.ts

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ApiResponse } from '../../types.js';
import {
  getRegisteredServices,
  getServiceLogs,
  getServiceStatus,
  getServicesHealth,
  restartService,
} from './services.service.js';
import type { ServicesHealthResponse } from './services.types.js';
import { restartDashboardWithDelay, restartServiceWithProgress } from './systemd.js';

/**
 * @fileoverview REST endpoints for the services module.
 */

export function serviceRoutes(fastify: FastifyInstance) {
  // Get list of registered services
  fastify.get('/services/registered', async (request, reply) => {
    try {
      const services = await getRegisteredServices();
      reply.send(services);
    } catch (error) {
      request.log.error(error, 'Error getting registered services');
      reply.status(500).send({ message: 'Error getting registered services' });
    }
  });

  // Get health status for all services
  fastify.get<{
    Reply: ApiResponse<ServicesHealthResponse> | import('../../types.js').APIError;
  }>('/api/services/health', async (request, reply) => {
    try {
      const healthData = await getServicesHealth();

      // Return 200 even if some services are unhealthy
      // The frontend will handle displaying unhealthy states
      return reply.code(200).send({
        status: 'success',
        data: healthData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      request.log.error(error, 'Error checking services health');
      return reply.code(500).send({
        status: 'error',
        message: 'Failed to check services health',
        code: 'HEALTH_CHECK_FAILED',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Get service status by ID
  fastify.get<{
    Params: { id: string };
  }>('/api/services/:id/status', async (request, reply) => {
    const { id } = request.params;

    try {
      const status = await getServiceStatus(id);
      return reply.code(200).send({
        status: 'success',
        data: status,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      request.log.error(error, 'Error getting service status');

      if (errorMessage.includes('not allowed')) {
        return reply.code(403).send({
          status: 'error',
          message: errorMessage,
          code: 'SERVICE_NOT_ALLOWED',
          timestamp: new Date().toISOString(),
        });
      }

      return reply.code(500).send({
        status: 'error',
        message: 'Failed to get service status',
        code: 'INTERNAL_SERVER_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Get service logs by ID
  fastify.get<{
    Params: { id: string };
    Querystring: { lines?: string };
  }>('/api/services/:id/logs', async (request, reply) => {
    const { id } = request.params;
    const lines = Number.parseInt(request.query.lines || '50', 10);

    try {
      const logs = await getServiceLogs(id, lines);
      return reply.code(200).send({
        status: 'success',
        data: { logs },
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      request.log.error(error, 'Error getting service logs');

      if (errorMessage.includes('not allowed')) {
        return reply.code(403).send({
          status: 'error',
          message: errorMessage,
          code: 'SERVICE_NOT_ALLOWED',
          timestamp: new Date().toISOString(),
        });
      }

      return reply.code(500).send({
        status: 'error',
        message: 'Failed to get service logs',
        code: 'INTERNAL_SERVER_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Restart a service by ID (simple, non-streaming)
  fastify.post<{
    Params: { id: string };
    Reply: ApiResponse<{ message: string; jobId: string }> | import('../../types.js').APIError;
  }>('/api/services/:id/restart', async (request, reply) => {
    const { id } = request.params;

    try {
      await restartService(id);
      return reply.code(200).send({
        status: 'success',
        data: { message: 'Service restart initiated', jobId: 'pending' },
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      request.log.error(error, 'Error restarting service');

      if (errorMessage.includes('not found')) {
        return reply.code(404).send({
          status: 'error',
          message: errorMessage,
          code: 'SERVICE_NOT_FOUND',
          timestamp: new Date().toISOString(),
        });
      }

      if (errorMessage.includes('not allowed')) {
        return reply.code(403).send({
          status: 'error',
          message: errorMessage,
          code: 'SERVICE_NOT_ALLOWED',
          timestamp: new Date().toISOString(),
        });
      }

      return reply.code(500).send({
        status: 'error',
        message: 'Failed to restart service',
        code: 'INTERNAL_SERVER_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Restart a service with SSE streaming progress (Story 2.3-Backend)
  fastify.get<{
    Params: { id: string };
  }>('/api/services/:id/restart/stream', async (request, reply) => {
    const { id } = request.params;

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    try {
      const generator = id === 'mithrandir-admin' ? restartDashboardWithDelay(5) : restartServiceWithProgress(id);

      for await (const progress of generator) {
        const data = JSON.stringify(progress);
        reply.raw.write(`event: restart-progress\ndata: ${data}\n\n`);
      }

      reply.raw.write('event: done\ndata: {}\n\n');
      reply.raw.end();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      request.log.error(error, 'Error during streaming restart');

      const errorData = JSON.stringify({
        phase: 'error',
        service: id,
        timestamp: new Date().toISOString(),
        message: errorMessage,
        error: errorMessage,
      });
      reply.raw.write(`event: restart-progress\ndata: ${errorData}\n\n`);
      reply.raw.end();
    }
  });
}
