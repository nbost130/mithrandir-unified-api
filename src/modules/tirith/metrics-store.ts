// src/modules/tirith/metrics-store.ts
/**
 * @fileoverview Redis-backed metrics storage for Tirith health snapshots.
 * Lazy Redis connection — operations fail gracefully if Redis is unavailable.
 */

import Redis from 'ioredis';
import type { HealthSnapshot } from './types.js';

const REDIS_KEY_HISTORY = 'tirith:health:history';
const REDIS_KEY_CURRENT = 'tirith:health:current';
const CURRENT_TTL_SECONDS = 900; // 15 minutes
const HISTORY_MAX_AGE_SECONDS = 25 * 3600; // 25 hours

export interface MetricsStore {
  storeSnapshot(snapshot: HealthSnapshot): Promise<void>;
  getHistory(fromEpoch: number, toEpoch: number): Promise<HealthSnapshot[]>;
  getCurrentSnapshot(): Promise<HealthSnapshot | null>;
  setCurrentSnapshot(snapshot: HealthSnapshot): Promise<void>;
  trimHistory(): Promise<void>;
  disconnect(): Promise<void>;
}

/**
 * Create a Redis-backed MetricsStore.
 * Redis connection is created lazily on first use.
 * All operations fail gracefully (return null/empty) if Redis is unavailable.
 */
export function createMetricsStore(redisUrl?: string): MetricsStore {
  let redis: Redis | null = null;
  let connectionFailed = false;

  function getRedis(): Redis | null {
    if (connectionFailed) return null;
    if (redis) return redis;

    try {
      redis = new Redis(redisUrl ?? 'redis://localhost:6379', {
        maxRetriesPerRequest: 1,
        retryStrategy(times: number) {
          if (times > 3) {
            connectionFailed = true;
            return null;
          }
          return Math.min(times * 200, 1000);
        },
        lazyConnect: true,
        connectTimeout: 3000,
        enableOfflineQueue: false,
      });

      redis.on('error', (err) => {
        console.warn(`[tirith:metrics] Redis error: ${err.message}`);
      });

      // Don't await connect — let it happen in background
      redis.connect().catch(() => {
        connectionFailed = true;
      });

      return redis;
    } catch {
      connectionFailed = true;
      return null;
    }
  }

  return {
    async storeSnapshot(snapshot: HealthSnapshot): Promise<void> {
      const client = getRedis();
      if (!client) return;

      try {
        const epoch = new Date(snapshot.timestamp).getTime();
        const json = JSON.stringify(snapshot);
        await client.zadd(REDIS_KEY_HISTORY, epoch, json);
      } catch (err) {
        console.warn(`[tirith:metrics] Failed to store snapshot: ${(err as Error).message}`);
      }
    },

    async getHistory(fromEpoch: number, toEpoch: number): Promise<HealthSnapshot[]> {
      const client = getRedis();
      if (!client) return [];

      try {
        const results = await client.zrangebyscore(REDIS_KEY_HISTORY, fromEpoch, toEpoch);
        return results.map((r) => JSON.parse(r) as HealthSnapshot);
      } catch (err) {
        console.warn(`[tirith:metrics] Failed to get history: ${(err as Error).message}`);
        return [];
      }
    },

    async getCurrentSnapshot(): Promise<HealthSnapshot | null> {
      const client = getRedis();
      if (!client) return null;

      try {
        const raw = await client.get(REDIS_KEY_CURRENT);
        if (!raw) return null;
        return JSON.parse(raw) as HealthSnapshot;
      } catch (err) {
        console.warn(`[tirith:metrics] Failed to get current snapshot: ${(err as Error).message}`);
        return null;
      }
    },

    async setCurrentSnapshot(snapshot: HealthSnapshot): Promise<void> {
      const client = getRedis();
      if (!client) return;

      try {
        const json = JSON.stringify(snapshot);
        await client.setex(REDIS_KEY_CURRENT, CURRENT_TTL_SECONDS, json);
      } catch (err) {
        console.warn(`[tirith:metrics] Failed to set current snapshot: ${(err as Error).message}`);
      }
    },

    async trimHistory(): Promise<void> {
      const client = getRedis();
      if (!client) return;

      try {
        const cutoff = Date.now() - HISTORY_MAX_AGE_SECONDS * 1000;
        await client.zremrangebyscore(REDIS_KEY_HISTORY, '-inf', cutoff);
      } catch (err) {
        console.warn(`[tirith:metrics] Failed to trim history: ${(err as Error).message}`);
      }
    },

    async disconnect(): Promise<void> {
      if (redis) {
        await redis.quit().catch(() => {});
        redis = null;
      }
    },
  };
}
