// src/modules/commands/commands.controller.ts

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { broadcast } from '../../lib/sse';
import { runCommand } from './commands.service';

/**
 * @fileoverview REST/SSE endpoints for the commands module.
 */

interface CommandRequestBody {
  commandId: string;
  command: string;
  params?: any;
}

export function commandRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: CommandRequestBody;
  }>(
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
    async (request: FastifyRequest<{ Body: CommandRequestBody }>, reply) => {
      try {
        const { commandId, command, params } = request.body;
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
