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

// Mock ALL Tirith tool handlers to avoid shell command execution
vi.mock('../src/modules/tirith/tools/system-health', () => ({
  handleSystemHealth: vi.fn().mockResolvedValue({
    cpu: { value: 15.5, unit: '%', warningThreshold: 70, criticalThreshold: 90, severity: 'ok', assessment: 'normal' },
    memory: {
      value: 30.2,
      unit: '%',
      warningThreshold: 80,
      criticalThreshold: 95,
      severity: 'ok',
      assessment: 'normal',
      totalBytes: 32e9,
      availableBytes: 22e9,
    },
    disk: {
      value: 45.0,
      unit: '%',
      warningThreshold: 85,
      criticalThreshold: 95,
      severity: 'ok',
      assessment: 'normal',
      totalFormatted: '500G',
      availableFormatted: '275G',
    },
    loadAverage: { avg1m: 1.2, avg5m: 1.5, avg15m: 1.3, cpuCores: 8, severity: 'ok', assessment: 'normal' },
    uptime: { seconds: 86400, formatted: '1d 0h 0m', bootTime: '2026-03-08T00:00:00Z' },
    summary: 'All systems nominal',
  }),
}));

vi.mock('../src/modules/tirith/tools/service-status', () => ({
  handleServiceStatus: vi.fn().mockResolvedValue({
    services: [{ name: 'ithildin', status: 'active', pid: 1234 }],
    summary: { total: 1, active: 1, inactive: 0 },
  }),
}));

vi.mock('../src/modules/tirith/tools/process-list', () => ({
  handleProcessList: vi.fn().mockResolvedValue({
    processes: [{ pid: 1, name: 'bun', cpu: 2.1, memory: 5.3 }],
    total: 1,
  }),
}));

vi.mock('../src/modules/tirith/tools/journal-query', () => ({
  handleJournalQuery: vi.fn().mockResolvedValue({
    entries: [{ timestamp: '2026-03-09T00:00:00Z', message: 'Started', unit: 'ithildin' }],
    count: 1,
  }),
}));

vi.mock('../src/modules/tirith/tools/docker-status', () => ({
  handleDockerStatus: vi.fn().mockResolvedValue({
    containers: [{ name: 'synapse', status: 'running', image: 'matrixdotorg/synapse' }],
    summary: { total: 1, running: 1, stopped: 0 },
  }),
}));

vi.mock('../src/modules/tirith/tools/port-check', () => ({
  handlePortCheck: vi.fn().mockResolvedValue({
    ports: [{ port: 3000, protocol: 'tcp', status: 'open', process: 'bun' }],
    summary: { total: 1, open: 1, closed: 0 },
  }),
}));

vi.mock('../src/modules/tirith/tools/cron-health', () => ({
  handleCronHealth: vi.fn().mockResolvedValue({
    jobs: [{ schedule: '0 7 * * *', command: 'email-triage', status: 'ok' }],
    summary: { total: 1, healthy: 1, unhealthy: 0 },
  }),
}));

vi.mock('../src/modules/tirith/tools/network-status', () => ({
  handleNetworkStatus: vi.fn().mockResolvedValue({
    tailscale: { status: 'connected', ip: '100.77.230.53', hostname: 'mithrandir' },
    interfaces: [{ name: 'eth0', ip: '192.168.1.10', status: 'up' }],
  }),
}));

vi.mock('../src/modules/tirith/tools/redis-info', () => ({
  handleRedisInfo: vi.fn().mockResolvedValue({
    server: { version: '7.0.0', uptimeSeconds: 86400 },
    memory: { usedHuman: '10M', peakHuman: '15M' },
    keys: [],
  }),
}));

vi.mock('../src/modules/tirith/tools/estate-diff', () => ({
  handleEstateDiff: vi.fn().mockResolvedValue({
    drifts: [],
    summary: { total: 0, sections: {} },
    status: 'in-sync',
  }),
}));

vi.mock('../src/modules/tirith/resources/manifest-resource', () => ({
  handleManifestResource: vi.fn().mockResolvedValue({
    version: '1.0',
    services: { systemd: [], docker: [], cron: [], endpoints: [] },
  }),
}));

vi.mock('../src/modules/tirith/metrics-store', () => ({
  createMetricsStore: vi.fn().mockReturnValue({
    record: vi.fn(),
    getLatest: vi.fn().mockResolvedValue(null),
    storeSnapshot: vi.fn(),
    getCurrentSnapshot: vi.fn().mockResolvedValue(null),
    setCurrentSnapshot: vi.fn(),
    getHistory: vi.fn().mockResolvedValue([]),
    trimHistory: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

vi.mock('../src/modules/tirith/manifest', () => ({
  loadManifest: vi.fn().mockResolvedValue({
    version: '1.0',
    services: { systemd: [], docker: [], cron: [], endpoints: [] },
  }),
}));

// Import AFTER all mocks
import { createServer } from '../src/server';

/** Helper to verify the standard Tirith response envelope */
function expectEnvelope(body: Record<string, unknown>) {
  expect(body.status).toBe('success');
  expect(body).toHaveProperty('data');
  expect(body).toHaveProperty('timestamp');
  expect(new Date(body.timestamp as string).getTime()).toBeGreaterThan(0);
}

describe('Tirith REST Endpoints', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = await createServer();
  });

  afterEach(async () => {
    if (fastify) await fastify.close();
  });

  it('GET /api/tirith/health returns system health snapshot', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/tirith/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expectEnvelope(body);
    expect(body.data).toHaveProperty('cpu');
    expect(body.data).toHaveProperty('memory');
    expect(body.data).toHaveProperty('disk');
    expect(body.data).toHaveProperty('loadAverage');
    expect(body.data).toHaveProperty('uptime');
    expect(body.data).toHaveProperty('summary');
  });

  it('GET /api/tirith/services returns service status', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/tirith/services' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expectEnvelope(body);
    expect(body.data).toHaveProperty('services');
    expect(body.data).toHaveProperty('summary');
  });

  it('GET /api/tirith/processes returns process list', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/tirith/processes' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expectEnvelope(body);
    expect(body.data).toHaveProperty('processes');
    expect(body.data).toHaveProperty('total');
  });

  it('GET /api/tirith/journal/:unit returns journal entries', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/tirith/journal/ithildin' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expectEnvelope(body);
    expect(body.data).toHaveProperty('entries');
    expect(body.data).toHaveProperty('count');
  });

  it('GET /api/tirith/docker returns container status', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/tirith/docker' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expectEnvelope(body);
    expect(body.data).toHaveProperty('containers');
    expect(body.data).toHaveProperty('summary');
  });

  it('GET /api/tirith/ports returns port status', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/tirith/ports' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expectEnvelope(body);
    expect(body.data).toHaveProperty('ports');
    expect(body.data).toHaveProperty('summary');
  });

  it('GET /api/tirith/cron returns cron health', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/tirith/cron' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expectEnvelope(body);
    expect(body.data).toHaveProperty('jobs');
    expect(body.data).toHaveProperty('summary');
  });

  it('GET /api/tirith/network returns network status with tailscale', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/tirith/network' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expectEnvelope(body);
    expect(body.data).toHaveProperty('tailscale');
    expect(body.data).toHaveProperty('interfaces');
  });

  it('GET /api/tirith/redis returns Redis info', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/tirith/redis' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expectEnvelope(body);
    expect(body.data).toHaveProperty('server');
    expect(body.data).toHaveProperty('memory');
  });

  it('GET /api/tirith/diff returns estate drift report', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/tirith/diff' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expectEnvelope(body);
    expect(body.data).toHaveProperty('drifts');
    expect(body.data).toHaveProperty('status');
  });

  it('GET /api/tirith/manifest returns estate manifest', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/tirith/manifest' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expectEnvelope(body);
    expect(body.data).toHaveProperty('version');
    expect(body.data).toHaveProperty('services');
  });
});
