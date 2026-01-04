import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock config validation
vi.mock('../src/config/validation', () => ({
  getConfig: () => ({
    port: 3000,
    host: 'localhost',
    transcriptionApiUrl: 'http://mock-api',
    palantirApiUrl: 'http://mock-palantir',
    logLevel: 'info',
  }),
}));

// Import createServer AFTER mocks
import { createServer } from '../src/server';

describe('Services Endpoints', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = await createServer();
  });

  afterEach(async () => {
    if (fastify) {
      await fastify.close();
    }
  });

  describe('GET /services/registered', () => {
    it('should return list of registered services', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/services/registered',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      expect(body[0]).toHaveProperty('id');
      expect(body[0]).toHaveProperty('name');
      expect(body[0]).toHaveProperty('healthEndpoint');
    });
  });

  describe('GET /api/services/health', () => {
    it('should return health status structure', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/services/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('success');
      expect(body.data).toHaveProperty('services');
      expect(body.data).toHaveProperty('summary');
      expect(body.data.services).toBeInstanceOf(Array);
      expect(body.data.summary).toHaveProperty('total');
      expect(body.data.summary).toHaveProperty('healthy');
      expect(body.data.summary).toHaveProperty('unhealthy');
      expect(body.data.summary).toHaveProperty('healthPercentage');
    });

    it('should include service details in response', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/services/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.services.length).toBeGreaterThan(0);

      const service = body.data.services[0];
      expect(service).toHaveProperty('name');
      expect(service).toHaveProperty('identifier');
      expect(service).toHaveProperty('status');
      expect(service).toHaveProperty('url');
      expect(service).toHaveProperty('port');
      expect(service).toHaveProperty('lastChecked');
      expect(['healthy', 'unhealthy']).toContain(service.status);
    });

    it('should return valid summary statistics', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/services/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      const { summary } = body.data;

      expect(summary.total).toBeGreaterThan(0);
      expect(summary.healthy + summary.unhealthy).toBe(summary.total);
      expect(summary.healthPercentage).toBeGreaterThanOrEqual(0);
      expect(summary.healthPercentage).toBeLessThanOrEqual(100);
    });
  });

  describe('POST /api/services/:id/restart', () => {
    it('should return 200 for valid service', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/services/transcription-palantir/restart',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('success');
      expect(body.data.message).toContain('Service restart initiated');
    });

    it('should return 404 for unknown service', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/services/invalid-service/restart',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('error');
      expect(body.code).toBe('SERVICE_NOT_FOUND');
      expect(body.message).toContain('not found');
    });

    it('should include timestamp in response', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/services/transcription-palantir/restart',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty('timestamp');
      expect(new Date(body.timestamp).getTime()).toBeGreaterThan(0);
    });
  });
});
