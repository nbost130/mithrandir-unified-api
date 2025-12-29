import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

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

// Tests re-enabled after fixing response handling patterns
// Testing with fastify.inject() using Node.js runtime (via npx vitest) instead of Bun
describe('Server Routes', () => {
    let fastify: FastifyInstance;

    beforeEach(async () => {
        vi.clearAllMocks();
        fastify = await createServer();
    });

    afterEach(async () => {
        await fastify.close();
    });

    describe('GET /health', () => {
        it('should return healthy status', async () => {
            const response = await fastify.inject({
                method: 'GET',
                url: '/health',
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.status).toBe('healthy');
            expect(body).toHaveProperty('uptime');
            expect(body).toHaveProperty('version');
            expect(body).toHaveProperty('timestamp');
            expect(body.checks).toEqual({
                ssh: false,
                vnc: false,
                system: true
            });
        });
    });

    describe('GET /info', () => {
        it('should return API information', async () => {
            const response = await fastify.inject({
                method: 'GET',
                url: '/info',
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.name).toBe('Mithrandir Unified API');
            expect(body).toHaveProperty('version');
            expect(body).toHaveProperty('endpoints');
            expect(Array.isArray(body.endpoints)).toBe(true);
        });
    });
});

