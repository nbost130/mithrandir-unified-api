import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock SystemService
vi.mock('../src/services', () => {
  const mockGetService = {
    getSystemStatus: vi.fn(),
    setLogger: vi.fn(),
  };
  return {
    SystemService: {
      getInstance: () => mockGetService,
    },
  };
});

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

// Mock API Client
const mockAxios = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../src/lib/apiClient', () => ({
  createApiClient: () => mockAxios,
}));

// Import createServer AFTER mocks
import { createServer } from '../src/server';

// Tests re-enabled after fixing response handling patterns
// Using Node.js runtime (npm test) instead of Bun to avoid light-my-request compatibility issue
describe('Transcription Proxy Routes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = await createServer({
      apiClient: mockAxios,
    });
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /transcription/jobs', () => {
    it('should list jobs', async () => {
      const mockJobs = [{ id: '1', name: 'Test Job' }];
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: { data: mockJobs },
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/transcription/jobs',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({ data: mockJobs });
      expect(mockAxios.get).toHaveBeenCalledWith('/jobs', { params: {} });
    });

    it('should pass query parameters', async () => {
      mockAxios.get.mockResolvedValue({ status: 200, data: {} });

      await fastify.inject({
        method: 'GET',
        url: '/transcription/jobs?status=pending&limit=10',
      });

      expect(mockAxios.get).toHaveBeenCalledWith('/jobs', {
        params: { status: 'pending', limit: '10' },
      });
    });
  });

  describe('POST /transcription/jobs', () => {
    it('should create a job', async () => {
      const newJob = { name: 'New Job' };
      const createdJob = { id: '1', ...newJob };
      mockAxios.post.mockResolvedValue({
        status: 201,
        data: createdJob,
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/transcription/jobs',
        payload: newJob,
      });

      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.payload)).toEqual(createdJob);
      expect(mockAxios.post).toHaveBeenCalledWith('/jobs', newJob, expect.any(Object));
    });
  });

  describe('GET /transcription/jobs/:id', () => {
    it('should get a specific job', async () => {
      const job = { id: '1', name: 'Job 1' };
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: job,
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/transcription/jobs/1',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual(job);
      expect(mockAxios.get).toHaveBeenCalledWith('/jobs/1');
    });
  });

  describe('DELETE /transcription/jobs/:id', () => {
    it('should delete a job', async () => {
      mockAxios.delete.mockResolvedValue({
        status: 204,
        data: {},
      });

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/transcription/jobs/1',
      });

      expect(response.statusCode).toBe(204);
      expect(mockAxios.delete).toHaveBeenCalledWith('/jobs/1');
    });
  });

  describe('POST /transcription/jobs/:id/retry', () => {
    it('should retry a job', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { id: '1', status: 'pending' },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/transcription/jobs/1/retry',
      });

      expect(response.statusCode).toBe(200);
      expect(mockAxios.post).toHaveBeenCalledWith('/jobs/1/retry', undefined, expect.any(Object));
    });
  });
});
