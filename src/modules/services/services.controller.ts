// src/modules/services/services.controller.ts

import type { FastifyInstance } from 'fastify';
import { getRegisteredServices } from './services.service';

/**
 * @fileoverview REST endpoints for the services module.
 */

export function serviceRoutes(fastify: FastifyInstance) {
  fastify.get('/services/registered', async (request, reply) => {
    try {
      const services = await getRegisteredServices();
      reply.send(services);
    } catch (error) {
      request.log.error(error, 'Error getting registered services');
      reply.status(500).send({ message: 'Error getting registered services' });
    }
  });
}
