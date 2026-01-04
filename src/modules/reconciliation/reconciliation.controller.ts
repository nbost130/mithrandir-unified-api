import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import SsePlugin from 'fastify-sse-v2';
import { addSseClient, broadcast, removeSseClient, getClientCount } from '../../lib/sse';
import { getAuditLog } from './reconciliation.service';

/**
 * @fileoverview REST/SSE endpoints for the reconciliation module.
 */

/**
 * Registers the reconciliation routes.
 * @param {FastifyInstance} fastify - The Fastify instance.
 */
interface AuditLogQuerystring {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: string;
  actionType?: string;
  target?: string;
  startDate?: string;
  endDate?: string;
}

export function reconciliationRoutes(fastify: FastifyInstance) {
  fastify.register(SsePlugin);

  fastify.get('/reconciliation/stream', (request: FastifyRequest, reply: FastifyReply) => {
    reply.sse(
      (async function* source() {
        addSseClient(reply);
        fastify.log.info(`Client connected to SSE stream. Total clients: ${getClientCount()}`);

        const heartbeatInterval = setInterval(() => {
          reply.sse({ event: 'heartbeat', data: new Date().toISOString() });
        }, 15000);

        try {
          for await (const _ of request.raw) {
            // Keep the connection alive
          }
        } catch (e) {
          fastify.log.error(e, 'SSE connection error');
        } finally {
          removeSseClient(reply);
          clearInterval(heartbeatInterval);
          fastify.log.info(`Client disconnected from SSE stream. Total clients: ${getClientCount()}`);
        }
      })()
    );
  });

  fastify.get<{
    Querystring: AuditLogQuerystring;
  }>(
    '/reconciliation/audit',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 50 },
            sortBy: { type: 'string', default: 'timestamp' },
            sortOrder: { type: 'string', default: 'desc' },
            actionType: { type: 'string' },
            target: { type: 'string' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await getAuditLog(request.query);
        return reply.send(result);
      } catch (error) {
        request.log.error(error, 'Error fetching audit log');
        reply.status(500).send({ message: 'Error fetching audit log' });
      }
    }
  );
}

/**
 * Broadcasts a reconciliation update to all connected SSE clients.
 * @param {any} data - The data to broadcast.
 */
export function broadcastReconciliationUpdate(data: any) {
  broadcast('reconciliation.update', data);
}
