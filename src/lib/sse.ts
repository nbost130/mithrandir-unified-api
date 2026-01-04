// src/lib/sse.ts

import type { FastifyReply } from 'fastify';

const clients: FastifyReply[] = [];

export function addSseClient(client: FastifyReply) {
  clients.push(client);
}

export function removeSseClient(client: FastifyReply) {
  const index = clients.indexOf(client);
  if (index !== -1) {
    clients.splice(index, 1);
  }
}

export function broadcast(event: string, data: any) {
  for (const client of clients) {
    client.sse({ event, data: JSON.stringify(data) });
  }
}
