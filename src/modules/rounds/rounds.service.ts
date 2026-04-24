// src/modules/rounds/rounds.service.ts
/**
 * @fileoverview Redis data access for Rounds & Tasks view.
 *
 * Reads from three data sources:
 * - estate-steward:nightly:* / estate-steward:debrief:* → Rounds timeline
 * - ithildin:queue:*                                     → Task queue state
 * - ainulindale:projects:active + ainulindale:project:*  → Project progress
 */

import Redis from 'ioredis';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StewardRound {
  key: string;
  type: 'nightly' | 'debrief';
  date: string;
  timestamp: string;
  summary?: string;
  tasksCreated?: number;
  reposWithChanges?: number;
  reposWithStaleBranches?: number;
  unhealthyServices?: number;
  diskAlerts?: number;
  overdueTasks?: number;
  overnightCompleted?: number;
  overnightFailed?: number;
  overnightCostUsd?: number;
}

export interface QueueTask {
  id: string;
  source: string;
  prompt: string;
  context?: string;
  todoistTaskId?: string;
  todoistContent?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  enqueuedAt: string;
  startedAt?: string;
  completedAt?: string;
  costUsd?: number;
  durationMs?: number;
  error?: string;
}

export interface QueueState {
  pending: QueueTask[];
  running: QueueTask[];
  failed: QueueTask[];
  completed: QueueTask[];
  totals: {
    pending: number;
    running: number;
    failed: number;
    completed: number;
  };
}

export interface AinulindaleProject {
  parentTodoistId: string;
  parentContent: string;
  status: 'active' | 'blocked' | 'completing' | 'done' | 'cancelled';
  mode: 'sequential' | 'parallel' | 'mixed';
  totalSubtasks: number;
  completedSubtasks: number;
  runningSubtasks: number;
  blockedSubtasks: number;
  progressPct: number;
  totalCostUsd: number;
  createdAt: string;
  updatedAt: string;
  subtasks: Array<{
    todoistId: string;
    content: string;
    status: string;
    isParallel: boolean;
    costUsd?: number;
  }>;
}

// ── Redis helpers ─────────────────────────────────────────────────────────────

function createRedis(url?: string): Redis {
  return new Redis(url ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 2) return null;
      return Math.min(times * 200, 500);
    },
    lazyConnect: true,
    connectTimeout: 3000,
    enableOfflineQueue: false,
  });
}

function safeJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ── Estate Steward history ────────────────────────────────────────────────────

async function scanStewardKeys(redis: Redis): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [nextCursor, found] = await redis.scan(cursor, 'MATCH', 'estate-steward:*', 'COUNT', 100);
    cursor = nextCursor;
    keys.push(...found);
  } while (cursor !== '0');
  return keys;
}

function enrichNightlyRound(round: StewardRound, data: any): void {
  round.tasksCreated = data.tasksCreated ?? 0;
  round.reposWithChanges = data.summary?.reposWithChanges ?? 0;
  round.reposWithStaleBranches = data.summary?.reposWithStaleBranches ?? 0;
  round.unhealthyServices = data.summary?.unhealthyServices ?? 0;
  round.diskAlerts = data.summary?.diskAlerts ?? 0;
  round.overdueTasks = data.summary?.overdueTasks ?? 0;
  round.summary = buildNightlySummary(data);
}

function enrichDebriefRound(round: StewardRound, data: any): void {
  round.overnightCompleted = data.overnightCompleted ?? 0;
  round.overnightFailed = data.overnightFailed ?? 0;
  round.overnightCostUsd = data.overnightCostUsd ?? 0;
  round.summary = buildDebriefSummary(data);
}

function buildBaseRound(key: string, type: 'nightly' | 'debrief', data: any): StewardRound {
  return {
    key,
    type,
    date: data.date ?? key.split(':').pop() ?? '',
    timestamp: data.timestamp ?? '',
  };
}

export async function getStewardHistory(redisUrl?: string, limit = 14): Promise<StewardRound[]> {
  const redis = createRedis(redisUrl);
  const rounds: StewardRound[] = [];

  try {
    await redis.connect();

    const keys = await scanStewardKeys(redis);
    const relevantKeys = keys
      .filter((k) => k.includes(':nightly:') || k.includes(':debrief:'))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, limit);

    const values = await Promise.all(relevantKeys.map((k) => redis.get(k)));

    for (let i = 0; i < relevantKeys.length; i++) {
      const key = relevantKeys[i];
      const raw = values[i];
      const data = safeJson<any>(raw);
      if (!data) continue;

      const type: 'nightly' | 'debrief' = key.includes(':nightly:') ? 'nightly' : 'debrief';
      const round = buildBaseRound(key, type, data);

      if (type === 'nightly') {
        enrichNightlyRound(round, data);
      } else {
        enrichDebriefRound(round, data);
      }

      rounds.push(round);
    }
  } catch (err) {
    console.warn('[rounds] getStewardHistory failed:', (err as Error).message);
  } finally {
    redis.disconnect();
  }

  return rounds;
}

function buildNightlySummary(data: any): string {
  const parts: string[] = [];
  const s = data.summary ?? {};
  if (s.reposWithChanges > 0) parts.push(`${s.reposWithChanges} repo(s) with uncommitted changes`);
  if (s.reposWithStaleBranches > 0) parts.push(`${s.reposWithStaleBranches} stale branch(es)`);
  if (s.unhealthyServices > 0) parts.push(`${s.unhealthyServices} unhealthy service(s)`);
  if (s.diskAlerts > 0) parts.push(`${s.diskAlerts} disk alert(s)`);
  if (s.overdueTasks > 0) parts.push(`${s.overdueTasks} overdue task(s)`);
  if (data.tasksCreated > 0) parts.push(`${data.tasksCreated} task(s) created`);
  return parts.length > 0 ? parts.join(' · ') : 'All clear';
}

function buildDebriefSummary(data: any): string {
  const parts: string[] = [];
  if (data.overnightCompleted > 0) parts.push(`${data.overnightCompleted} completed`);
  if (data.overnightFailed > 0) parts.push(`${data.overnightFailed} failed`);
  if (data.overnightCostUsd > 0) parts.push(`$${(data.overnightCostUsd as number).toFixed(4)} cost`);
  return parts.length > 0 ? parts.join(' · ') : 'No overnight activity';
}

// ── Task queue state ──────────────────────────────────────────────────────────

const QUEUE_KEYS = {
  pending: 'ithildin:queue:pending',
  running: 'ithildin:queue:running',
  failed: 'ithildin:queue:failed',
  completed: 'ithildin:queue:completed',
} as const;

export async function getQueueState(redisUrl?: string): Promise<QueueState> {
  const redis = createRedis(redisUrl);
  const state: QueueState = {
    pending: [],
    running: [],
    failed: [],
    completed: [],
    totals: { pending: 0, running: 0, failed: 0, completed: 0 },
  };

  try {
    await redis.connect();

    const [pendingRaw, runningHash, failedRaw, completedRaw] = await Promise.all([
      redis.lrange(QUEUE_KEYS.pending, 0, -1),
      redis.hgetall(QUEUE_KEYS.running),
      redis.lrange(QUEUE_KEYS.failed, 0, -1),
      redis.lrange(QUEUE_KEYS.completed, 0, 49),
    ]);

    state.pending = pendingRaw.map((r) => safeJson<QueueTask>(r)).filter(Boolean) as QueueTask[];
    state.running = Object.values(runningHash ?? {})
      .map((r) => safeJson<QueueTask>(r))
      .filter(Boolean) as QueueTask[];
    state.failed = failedRaw.map((r) => safeJson<QueueTask>(r)).filter(Boolean) as QueueTask[];
    state.completed = completedRaw.map((r) => safeJson<QueueTask>(r)).filter(Boolean) as QueueTask[];

    state.totals = {
      pending: state.pending.length,
      running: state.running.length,
      failed: state.failed.length,
      completed: state.completed.length,
    };
  } catch (err) {
    console.warn('[rounds] getQueueState failed:', (err as Error).message);
  } finally {
    redis.disconnect();
  }

  return state;
}

/**
 * Retry a failed task: remove from failed list, reset status/attempts,
 * push to pending list.
 * Returns true if the task was found and re-queued.
 */
export async function retryTask(taskId: string, redisUrl?: string): Promise<boolean> {
  const redis = createRedis(redisUrl);

  try {
    await redis.connect();
    const failedRaw = await redis.lrange(QUEUE_KEYS.failed, 0, -1);

    let targetTask: QueueTask | null = null;
    let targetIndex = -1;

    for (let i = 0; i < failedRaw.length; i++) {
      const task = safeJson<QueueTask>(failedRaw[i]);
      if (task && task.id === taskId) {
        targetTask = task;
        targetIndex = i;
        break;
      }
    }

    if (!targetTask || targetIndex === -1) return false;

    // Remove from failed list (use a sentinel approach — mark the item then trim)
    // Redis LSET + LREM is the correct pattern
    await redis.lset(QUEUE_KEYS.failed, targetIndex, '__REMOVE__');
    await redis.lrem(QUEUE_KEYS.failed, 1, '__REMOVE__');

    // Reset task state
    targetTask.status = 'pending';
    targetTask.attempts = 0;
    targetTask.error = undefined;
    targetTask.startedAt = undefined;
    targetTask.completedAt = undefined;
    targetTask.enqueuedAt = new Date().toISOString();

    // Push to pending (left push — highest priority retry)
    await redis.rpush(QUEUE_KEYS.pending, JSON.stringify(targetTask));

    return true;
  } catch (err) {
    console.warn('[rounds] retryTask failed:', (err as Error).message);
    return false;
  } finally {
    redis.disconnect();
  }
}

// ── Ainulindale projects ──────────────────────────────────────────────────────

const AINULINDALE_ACTIVE = 'ainulindale:projects:active';
const AINULINDALE_CLAIMED = 'ainulindale:projects:claimed';

export async function getProjects(redisUrl?: string): Promise<AinulindaleProject[]> {
  const redis = createRedis(redisUrl);
  const projects: AinulindaleProject[] = [];

  try {
    await redis.connect();

    const [activeIds, claimedIds] = await Promise.all([
      redis.smembers(AINULINDALE_ACTIVE),
      redis.smembers(AINULINDALE_CLAIMED),
    ]);

    const allIds = [...new Set([...activeIds, ...claimedIds])];
    if (allIds.length === 0) return projects;

    const raws = await Promise.all(allIds.map((id) => redis.get(`ainulindale:project:${id}`)));

    for (const raw of raws) {
      const data = safeJson<any>(raw);
      if (!data) continue;

      const subtasks: AinulindaleProject['subtasks'] = (data.subtasks ?? []).map((st: any) => ({
        todoistId: st.todoistId,
        content: st.content,
        status: st.status,
        isParallel: st.isParallel ?? false,
        costUsd: st.costUsd,
      }));

      const completedSubtasks = subtasks.filter((s) => s.status === 'completed').length;
      const runningSubtasks = subtasks.filter((s) => s.status === 'running').length;
      const blockedSubtasks = subtasks.filter((s) => s.status === 'blocked').length;
      const total = subtasks.length;
      const progressPct = total > 0 ? Math.round((completedSubtasks / total) * 100) : 0;

      projects.push({
        parentTodoistId: data.parentTodoistId,
        parentContent: data.parentContent,
        status: data.status,
        mode: data.mode,
        totalSubtasks: total,
        completedSubtasks,
        runningSubtasks,
        blockedSubtasks,
        progressPct,
        totalCostUsd: data.totalCostUsd ?? 0,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        subtasks,
      });
    }

    // Sort: active first, then by updated (newest first)
    projects.sort((a, b) => {
      const statusOrder: Record<string, number> = {
        active: 0,
        blocked: 1,
        completing: 2,
        done: 3,
        cancelled: 4,
      };
      const sa = statusOrder[a.status] ?? 5;
      const sb = statusOrder[b.status] ?? 5;
      if (sa !== sb) return sa - sb;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  } catch (err) {
    console.warn('[rounds] getProjects failed:', (err as Error).message);
  } finally {
    redis.disconnect();
  }

  return projects;
}
