import Redis from 'ioredis';
import type { Severity } from '../types.js';

interface RedisInfoResult {
  timestamp: string;
  overallSeverity: Severity;
  summary: string;
  available: boolean;
  server?: {
    version: string;
    uptimeSeconds: number;
    connectedClients: number;
  };
  memory?: {
    usedBytes: number;
    usedHuman: string;
    peakBytes: number;
    peakHuman: string;
    fragRatio: number;
  };
  clients?: {
    connected: number;
    blocked: number;
    maxClients: number;
  };
  keyspace?: {
    totalKeys: number;
    databases: Array<{ db: string; keys: number; expires: number }>;
  };
  slowLog?: Array<{
    id: number;
    timestampSeconds: number;
    durationMicros: number;
    command: string;
  }>;
  keyInspection?: {
    pattern: string;
    matchCount: number;
    keys: Array<{ key: string; type: string; ttl: number }>;
  };
  error?: string;
}

let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST ?? '127.0.0.1',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      lazyConnect: true,
    });
  }
  return redisClient;
}

function parseInfoSection(info: string, section: string): Record<string, string> {
  const lines = info.split('\n');
  const result: Record<string, string> = {};
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(`# ${section}`)) {
      inSection = true;
      continue;
    }
    if (trimmed.startsWith('#')) {
      if (inSection) break;
      continue;
    }
    if (inSection && trimmed.includes(':')) {
      const [key, val] = trimmed.split(':');
      result[key] = val;
    }
  }
  return result;
}

function parseKeyspaceInfo(info: string): Array<{ db: string; keys: number; expires: number }> {
  const section = parseInfoSection(info, 'Keyspace');
  return Object.entries(section).map(([db, val]) => {
    const match = val.match(/keys=(\d+),expires=(\d+)/);
    return {
      db,
      keys: match ? Number(match[1]) : 0,
      expires: match ? Number(match[2]) : 0,
    };
  });
}

function parseSlowLog(raw: unknown[]): RedisInfoResult['slowLog'] {
  return raw.map((entry: unknown) => {
    const e = entry as [number, number, number, string[]];
    return {
      id: e[0],
      timestampSeconds: e[1],
      durationMicros: e[2],
      command: Array.isArray(e[3]) ? e[3].join(' ') : String(e[3]),
    };
  });
}

async function scanKeys(redis: Redis, pattern: string, limit: number): Promise<RedisInfoResult['keyInspection']> {
  const keys: string[] = [];
  let cursor = '0';

  do {
    const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    keys.push(...batch);
    if (keys.length >= limit) break;
  } while (cursor !== '0');

  const inspected = keys.slice(0, limit);
  const keyDetails = await Promise.all(
    inspected.map(async (key) => {
      const [type, ttl] = await Promise.all([redis.type(key), redis.ttl(key)]);
      return { key, type, ttl };
    })
  );

  return {
    pattern,
    matchCount: keys.length,
    keys: keyDetails,
  };
}

function fragSeverity(fragRatio: number): Severity {
  if (fragRatio > 2.0) return 'critical';
  if (fragRatio > 1.5) return 'warning';
  return 'ok';
}

function buildInfoResult(
  timestamp: string,
  info: string,
  dbsize: number,
  slowlog: unknown[],
  keyInspection: RedisInfoResult['keyInspection']
): RedisInfoResult {
  const serverInfo = parseInfoSection(info, 'Server');
  const memInfo = parseInfoSection(info, 'Memory');
  const clientInfo = parseInfoSection(info, 'Clients');
  const databases = parseKeyspaceInfo(info);
  const fragRatio = Number.parseFloat(memInfo.mem_fragmentation_ratio ?? '1');

  return {
    timestamp,
    overallSeverity: fragSeverity(fragRatio),
    summary: `Redis v${serverInfo.redis_version ?? 'unknown'}, ${dbsize} keys, frag ${fragRatio.toFixed(2)}`,
    available: true,
    server: {
      version: serverInfo.redis_version ?? 'unknown',
      uptimeSeconds: Number(serverInfo.uptime_in_seconds ?? 0),
      connectedClients: Number(clientInfo.connected_clients ?? 0),
    },
    memory: {
      usedBytes: Number(memInfo.used_memory ?? 0),
      usedHuman: memInfo.used_memory_human ?? '0B',
      peakBytes: Number(memInfo.used_memory_peak ?? 0),
      peakHuman: memInfo.used_memory_peak_human ?? '0B',
      fragRatio,
    },
    clients: {
      connected: Number(clientInfo.connected_clients ?? 0),
      blocked: Number(clientInfo.blocked_clients ?? 0),
      maxClients: Number(clientInfo.maxclients ?? 0),
    },
    keyspace: {
      totalKeys: dbsize,
      databases,
    },
    slowLog: Array.isArray(slowlog) ? parseSlowLog(slowlog) : [],
    keyInspection,
  };
}

export async function handleRedisInfo(input: { keyPattern?: string; keyLimit?: number }): Promise<RedisInfoResult> {
  const timestamp = new Date().toISOString();
  const redis = getRedis();

  try {
    await redis.connect();
  } catch {
    // May already be connected
  }

  try {
    await redis.ping();
  } catch (err) {
    return {
      timestamp,
      overallSeverity: 'critical',
      summary: 'Redis unavailable',
      available: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  try {
    const [info, dbsize, slowlog] = await Promise.all([
      redis.info(),
      redis.dbsize(),
      redis.call('SLOWLOG', 'GET', '10') as Promise<unknown[]>,
    ]);

    const keyInspection = input.keyPattern ? await scanKeys(redis, input.keyPattern, input.keyLimit ?? 50) : undefined;

    return buildInfoResult(timestamp, info, dbsize, slowlog, keyInspection);
  } catch (err) {
    return {
      timestamp,
      overallSeverity: 'unknown',
      summary: err instanceof Error ? err.message : String(err),
      available: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
