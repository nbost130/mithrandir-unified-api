// test/reconciliation.test.ts

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createServer } from '../src/server';

let app: FastifyInstance;

beforeAll(async () => {
  app = await createServer();
  await app.ready();
});

afterAll(async () => {
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
