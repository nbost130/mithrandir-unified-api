// src/modules/commands/commands.controller.ts

import type { FastifyInstance } from 'fastify';
import { broadcast } from '../../lib/sse';
import { runCommand } from './commands.service';

/**
 * @fileoverview REST/SSE endpoints for the commands module.
 */

export function commandRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/commands/run',
    {
      schema: {
        body: {
          type: 'object',
          required: ['commandId', 'command'],
          properties: {
            commandId: { type: 'string' },
            command: { type: 'string' },
            params: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { commandId, command, params } = request.body as any;
        runCommand(commandId, command, params);
        reply.status(202).send({ commandId, status: 'queued' });
      } catch (error) {
        request.log.error(error, 'Error running command');
        reply.status(500).send({ message: 'Error running command' });
      }
    }
  );
}

export function broadcastCommandUpdate(data: any) {
  broadcast('command.status', data);
}
