// src/modules/services/services.controller.ts

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ApiResponse } from '../../types';
// import { getRegisteredServices, getServicesHealth, restartService } from './services.service';
import type { ServicesHealthResponse } from './services.types';

/**
 * @fileoverview REST endpoints for the services module.
 */

export function serviceRoutes(fastify: FastifyInstance) {
  // Get list of registered services
  fastify.get('/services/registered', async (request, reply) => {
    try {
      // const services = await getRegisteredServices();
      reply.send([]);
    } catch (error) {
      request.log.error(error, 'Error getting registered services');
      reply.status(500).send({ message: 'Error getting registered services' });
    }
  });

  // Get health status for all services
  fastify.get<{
    Reply: ApiResponse<ServicesHealthResponse> | import('../../types').APIError;
  }>('/api/services/health', async (request, reply) => {
    try {
      // const healthData = await getServicesHealth();

      // Return 200 even if some services are unhealthy
      // The frontend will handle displaying unhealthy states
      return reply.code(200).send({
        status: 'success',
        data: { services: [], summary: { total: 0, healthy: 0, unhealthy: 0, healthPercentage: 0 } },
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

  // Restart a service by ID
  fastify.post<{
    Params: { id: string };
    Reply: ApiResponse<{ message: string; jobId: string }> | import('../../types').APIError;
  }>('/api/services/:id/restart', async (request, reply) => {
    const { id } = request.params;

    try {
      // const result = await restartService(id);
      return reply.code(200).send({
        status: 'success',
        data: { message: 'Service restart initiated', jobId: 'stub' },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      // ...
      return reply.code(500).send({ status: 'error', message: 'stub', code: 'STUB', timestamp: new Date().toISOString() });
    }
  });
}

