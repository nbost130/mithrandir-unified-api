// src/modules/services/services.controller.ts

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ApiResponse } from '../../types';
import type { ServicesHealthResponse } from './services.types';
import { getRegisteredServices, getServicesHealth, restartService } from './services.service';

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
    Reply: ApiResponse<ServicesHealthResponse> | import('../../types').APIError;
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

  // Restart a service by ID
  fastify.post<{
    Params: { id: string };
  }>('/api/services/:id/restart', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id: serviceId } = request.params;

    try {
      await restartService(serviceId);

      request.log.info({ serviceId }, 'Service restart initiated (mock implementation)');

      return reply.code(200).send({
        status: 'success',
        message: 'Service restart initiated (mock implementation)',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('not found')) {
        request.log.warn({ serviceId }, 'Service not found for restart');
        return reply.code(404).send({
          status: 'error',
          message: `Service not found: ${serviceId}`,
          code: 'SERVICE_NOT_FOUND',
          timestamp: new Date().toISOString(),
        });
      }

      request.log.error({ error, serviceId }, 'Error restarting service');
      return reply.code(500).send({
        status: 'error',
        message: `Failed to restart service: ${errorMessage}`,
        code: 'RESTART_FAILED',
        timestamp: new Date().toISOString(),
      });
    }
  });
}

