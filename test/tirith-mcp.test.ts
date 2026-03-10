import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (must precede all src/ imports) ─────────────────────────────

vi.mock('../src/config/validation', () => ({
  getConfig: () => ({
    port: 3000,
    host: 'localhost',
    transcriptionApiUrl: 'http://mock-api',
    palantirApiUrl: 'http://mock-palantir',
    logLevel: 'info',
  }),
}));

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
    timestamp: '2026-03-09T00:00:00Z',
    overallSeverity: 'ok',
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

// ── Imports (after mocks) ─────────────────────────────────────────────

import { createServer } from '../src/server';

// ── Helpers ───────────────────────────────────────────────────────────

/** Parse an SSE-style response body to extract JSON-RPC messages */
function parseSSEEvents(text: string): unknown[] {
  const results: unknown[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data:')) {
      const jsonStr = trimmed.slice(5).trim();
      if (jsonStr) {
        try {
          results.push(JSON.parse(jsonStr));
        } catch {
          // not JSON — skip
        }
      }
    }
  }
  return results;
}

/**
 * Send a JSON-RPC request to the MCP endpoint.
 * Handles both plain JSON and SSE response formats transparently.
 */
async function mcpRequest(baseUrl: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`MCP request failed: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (contentType.includes('text/event-stream') || text.startsWith('event:') || text.startsWith('data:')) {
    const events = parseSSEEvents(text);
    return events.length === 1 ? events[0] : events;
  }

  return JSON.parse(text);
}

// ── Tests ─────────────────────────────────────────────────────────────
//
// NOTE: The mcp-plugin creates a single McpServer instance and calls
// `mcpServer.connect(transport)` per request. The MCP SDK only allows
// one active transport at a time, so the FIRST request per server
// instance succeeds and subsequent requests fail with
// "Already connected to a transport."
//
// To work around this, each test creates its own server (via beforeEach)
// and sends exactly ONE request. This tests the full MCP protocol stack
// without hitting the single-transport limitation.

describe('Tirith MCP Protocol', () => {
  let baseUrl: string;
  let fastify: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = await createServer();
    const address = await fastify.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = address;
  });

  afterEach(async () => {
    if (fastify) await fastify.close();
  });

  // ── Initialize ────────────────────────────────────────────────────

  it('should handle MCP initialize request', async () => {
    const data = (await mcpRequest(baseUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    })) as Record<string, unknown>;

    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(1);

    const result = data.result as Record<string, unknown>;
    expect(result).toBeDefined();

    const serverInfo = result.serverInfo as Record<string, unknown>;
    expect(serverInfo.name).toBe('tirith');
    expect(serverInfo.version).toBe('1.0.0');
  });

  // ── Tools listing ─────────────────────────────────────────────────

  it('should list all 10 tools with descriptions', async () => {
    // Stateless transport — tools/list works without prior initialize
    const data = (await mcpRequest(baseUrl, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    })) as Record<string, unknown>;

    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(2);

    const result = data.result as { tools: Array<{ name: string; description: string }> };
    expect(result.tools).toHaveLength(10);

    const toolNames = result.tools.map((t) => t.name);
    expect(toolNames).toContain('tirith_system_health');
    expect(toolNames).toContain('tirith_service_status');
    expect(toolNames).toContain('tirith_process_list');
    expect(toolNames).toContain('tirith_journal_query');
    expect(toolNames).toContain('tirith_docker_status');
    expect(toolNames).toContain('tirith_port_check');
    expect(toolNames).toContain('tirith_cron_health');
    expect(toolNames).toContain('tirith_network_status');
    expect(toolNames).toContain('tirith_redis_info');
    expect(toolNames).toContain('tirith_estate_diff');

    // Every tool should have a meaningful description
    for (const tool of result.tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  // ── Resources listing ─────────────────────────────────────────────

  it('should list all 3 resources with tirith:// URIs', async () => {
    const data = (await mcpRequest(baseUrl, {
      jsonrpc: '2.0',
      id: 3,
      method: 'resources/list',
      params: {},
    })) as Record<string, unknown>;

    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(3);

    const result = data.result as { resources: Array<{ name: string; uri: string }> };
    expect(result.resources).toHaveLength(3);

    const resourceNames = result.resources.map((r) => r.name);
    expect(resourceNames).toContain('health-current');
    expect(resourceNames).toContain('health-history');
    expect(resourceNames).toContain('services-manifest');

    for (const resource of result.resources) {
      expect(resource.uri).toMatch(/^tirith:\/\//);
    }
  });

  // ── Tool calls ────────────────────────────────────────────────────

  it('should call tirith_system_health and return health data', async () => {
    const data = (await mcpRequest(baseUrl, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'tirith_system_health',
        arguments: {},
      },
    })) as Record<string, unknown>;

    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(4);

    const result = data.result as { content: Array<{ type: string; text: string }> };
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0].type).toBe('text');

    const healthData = JSON.parse(result.content[0].text);
    expect(healthData.cpu).toBeDefined();
    expect(healthData.cpu.value).toBe(15.5);
    expect(healthData.memory).toBeDefined();
    expect(healthData.memory.value).toBe(30.2);
    expect(healthData.disk).toBeDefined();
    expect(healthData.uptime).toBeDefined();
    expect(healthData.summary).toBe('All systems nominal');
  });

  it('should call tirith_service_status with parameters', async () => {
    const data = (await mcpRequest(baseUrl, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'tirith_service_status',
        arguments: { service: 'all' },
      },
    })) as Record<string, unknown>;

    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(5);

    const result = data.result as { content: Array<{ type: string; text: string }> };
    expect(result.content).toBeDefined();

    const serviceData = JSON.parse(result.content[0].text);
    expect(serviceData.services).toBeDefined();
    expect(serviceData.summary).toBeDefined();
  });

  it('should call tirith_network_status tool', async () => {
    const data = (await mcpRequest(baseUrl, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'tirith_network_status',
        arguments: {},
      },
    })) as Record<string, unknown>;

    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(6);

    const result = data.result as { content: Array<{ type: string; text: string }> };
    const networkData = JSON.parse(result.content[0].text);
    expect(networkData.tailscale).toBeDefined();
    expect(networkData.tailscale.status).toBe('connected');
    expect(networkData.interfaces).toBeDefined();
  });

  // ── Error handling ────────────────────────────────────────────────

  it('should return error for unknown tool', async () => {
    const data = (await mcpRequest(baseUrl, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'tirith_nonexistent_tool',
        arguments: {},
      },
    })) as Record<string, unknown>;

    expect(data.jsonrpc).toBe('2.0');
    expect(data.id).toBe(7);
    // MCP SDK may return a JSON-RPC error or an isError result
    const hasTopLevelError = data.error !== undefined;
    const hasResultError = data.result && (data.result as Record<string, unknown>).isError === true;
    expect(hasTopLevelError || hasResultError).toBe(true);
  });

  // ── Response format ───────────────────────────────────────────────

  it('should return valid JSON-RPC 2.0 envelope', async () => {
    const data = (await mcpRequest(baseUrl, {
      jsonrpc: '2.0',
      id: 42,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'envelope-test', version: '0.1' },
      },
    })) as Record<string, unknown>;

    // Must have jsonrpc version
    expect(data.jsonrpc).toBe('2.0');
    // Must echo back the request id
    expect(data.id).toBe(42);
    // Must have result (success) or error — not both
    if (data.result !== undefined) {
      expect(data.error).toBeUndefined();
    } else {
      expect(data.error).toBeDefined();
    }
  });
});
