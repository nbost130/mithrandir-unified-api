// src/lib/sse.ts

import type { FastifyReply } from 'fastify';

const clients = new Set<FastifyReply>();

export function addSseClient(client: FastifyReply) {
  clients.add(client);
}

export function removeSseClient(client: FastifyReply) {
  clients.delete(client);
}

export function getClientCount(): number {
  return clients.size;
}

export function broadcast(event: string, data: any) {
  for (const client of clients) {
    client.sse({ event, data: JSON.stringify(data) });
  }
}
