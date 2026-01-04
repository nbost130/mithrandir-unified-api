// test/reconciliation.test.ts

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';

// Mock config validation BEFORE importing server
vi.mock('../src/config/validation', () => ({
  getConfig: () => ({
    port: 3000,
    host: 'localhost',
    transcriptionApiUrl: 'http://mock-api',
    palantirApiUrl: 'http://mock-palantir',
    logLevel: 'info',
  }),
}));

import { closeDatabase, stopPolling } from '../src/modules/reconciliation/reconciliation.service';
import { createServer } from '../src/server';

let app: FastifyInstance;

beforeAll(async () => {
  app = await createServer();
  await app.ready();
});

afterAll(async () => {
  stopPolling();
  closeDatabase();
  await app.close();
});

test('GET /reconciliation/audit', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/reconciliation/audit',
  });

  expect(response.statusCode).toBe(200);
  const payload = JSON.parse(response.payload);
  expect(payload).toHaveProperty('data');
  expect(payload).toHaveProperty('meta');
});

test('GET /services/registered', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/services/registered',
  });

  expect(response.statusCode).toBe(200);
  const payload = JSON.parse(response.payload);
  expect(Array.isArray(payload)).toBe(true);
});

test('POST /commands/run', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/commands/run',
    payload: {
      commandId: 'test-cmd-1',
      command: 'test-command',
      params: { target: 'test-target' },
    },
  });

  expect(response.statusCode).toBe(202);
  const payload = JSON.parse(response.payload);
  expect(payload.status).toBe('queued');
});
