import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Severity } from '../types.js';

/**
 * Semantic-memory health for the PAI LanceDB stack.
 *
 * Checks the whole chain rather than each service in isolation, because the
 * 2026-08-15 failure was invisible to every per-service check: the indexer ran
 * green every five minutes, the daemon answered every query, Ollama was up, and
 * every answer came from a memory tree that had frozen in July. Nothing was
 * "down". The only signal that would have caught it is asking whether the
 * CONTENT reaching search is current, which is what checkIndexContent does.
 */

const MIRROR_DIR = process.env.PAI_MEMORY_MIRROR ?? '/home/nbost/lancedb/sources/pai-memory';
const INDEX_LOG = process.env.PAI_MEMORY_INDEX_LOG ?? '/home/nbost/lancedb/memory_update_and_index.log';
const LOCK_FILE = process.env.PAI_MEMORY_LOCK ?? '/tmp/pai-memory-indexer.lock';
const DAEMON_URL = process.env.PAI_MEMORY_DAEMON ?? 'http://localhost:8889';
const OLLAMA_URL = process.env.PAI_OLLAMA_URL ?? 'http://localhost:11434';
const EMBED_MODEL = process.env.PAI_EMBED_MODEL ?? 'nomic-embed-text';

const HOUR_MS = 3_600_000;
/** The Mac sleeps, so an overnight-stale mirror is normal; a full day is not. */
const MIRROR_WARN_MS = 24 * HOUR_MS;
const MIRROR_CRIT_MS = 72 * HOUR_MS;
/** Mithrandir is always on and the indexer cron runs every 5 minutes. */
const INDEX_WARN_MS = 0.5 * HOUR_MS;
const INDEX_CRIT_MS = 3 * HOUR_MS;

interface MemoryCheck {
  name: string;
  severity: Severity;
  detail: string;
}

interface MemoryHealthResult {
  timestamp: string;
  overallSeverity: Severity;
  summary: string;
  checks: MemoryCheck[];
}

function worstSeverity(...severities: Severity[]): Severity {
  if (severities.includes('critical')) return 'critical';
  if (severities.includes('warning')) return 'warning';
  if (severities.includes('unknown')) return 'unknown';
  return 'ok';
}

function describeAge(ms: number): string {
  if (ms < HOUR_MS) return `${Math.round(ms / 60_000)}m ago`;
  return `${(ms / HOUR_MS).toFixed(1)}h ago`;
}

/** Count .md files under a tree and find the most recent mtime, in one walk. */
async function walkMarkdown(dir: string): Promise<{ count: number; newestMs: number }> {
  let count = 0;
  let newestMs = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await walkMarkdown(full);
      count += sub.count;
      if (sub.newestMs > newestMs) newestMs = sub.newestMs;
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      count += 1;
      const info = await stat(full);
      if (info.mtimeMs > newestMs) newestMs = info.mtimeMs;
    }
  }
  return { count, newestMs };
}

async function checkMirror(): Promise<MemoryCheck> {
  try {
    const { count, newestMs } = await walkMarkdown(MIRROR_DIR);
    if (count === 0) {
      return {
        name: 'mirror',
        severity: 'critical',
        detail: `no markdown under ${MIRROR_DIR} — the Mac push is not landing`,
      };
    }
    const age = Date.now() - newestMs;
    const severity: Severity = age > MIRROR_CRIT_MS ? 'critical' : age > MIRROR_WARN_MS ? 'warning' : 'ok';
    return {
      name: 'mirror',
      severity,
      detail: `${count} markdown files, newest written ${describeAge(age)}`,
    };
  } catch (err) {
    return {
      name: 'mirror',
      severity: 'critical',
      detail: `cannot read ${MIRROR_DIR}: ${(err as Error).message}`,
    };
  }
}

/**
 * Is an index run in flight right now? A bulk run takes tens of minutes, during
 * which the last COMPLETED run legitimately looks old; without this the check
 * cries warning (then critical) through every large re-index.
 */
async function indexRunInProgress(): Promise<{ running: boolean; elapsedMs?: number }> {
  try {
    const pid = Number((await readFile(LOCK_FILE, 'utf8')).trim());
    if (!Number.isInteger(pid) || pid <= 0) return { running: false };
    process.kill(pid, 0); // throws if no such process
    const info = await stat(`/proc/${pid}`);
    return { running: true, elapsedMs: Date.now() - info.ctimeMs };
  } catch {
    return { running: false };
  }
}

async function checkIndexer(): Promise<MemoryCheck> {
  try {
    const inFlight = await indexRunInProgress();
    if (inFlight.running) {
      return {
        name: 'indexer',
        severity: 'ok',
        detail: `run in progress (${describeAge(inFlight.elapsedMs ?? 0).replace(' ago', ' elapsed')})`,
      };
    }
    const raw = await readFile(INDEX_LOG, 'utf8');
    const tail = raw.slice(-40_000);
    const done = [...tail.matchAll(/^\[([^\]]+)\] Done$/gm)].at(-1);
    const stats = [...tail.matchAll(/Indexed (\d+) files, skipped (\d+), removed (\d+)/g)].at(-1);
    if (!done) {
      return { name: 'indexer', severity: 'critical', detail: 'no completed run in the recent log' };
    }
    const age = Date.now() - new Date(done[1] as string).getTime();
    const severity: Severity = age > INDEX_CRIT_MS ? 'critical' : age > INDEX_WARN_MS ? 'warning' : 'ok';
    const statLine = stats
      ? `last run indexed ${stats[1]}, skipped ${stats[2]}, removed ${stats[3]}`
      : 'no stats line found';
    return {
      name: 'indexer',
      severity,
      detail: `last completed run ${describeAge(age)}; ${statLine}`,
    };
  } catch (err) {
    return {
      name: 'indexer',
      severity: 'critical',
      detail: `cannot read ${INDEX_LOG}: ${(err as Error).message}`,
    };
  }
}

async function checkEmbeddings(): Promise<MemoryCheck> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return { name: 'embeddings', severity: 'critical', detail: `Ollama returned HTTP ${res.status}` };
    }
    const body = (await res.json()) as { models?: Array<{ name: string }> };
    const names = (body.models ?? []).map((m) => m.name);
    const present = names.some((n) => n.startsWith(EMBED_MODEL));
    return {
      name: 'embeddings',
      severity: present ? 'ok' : 'critical',
      detail: present
        ? `${EMBED_MODEL} available`
        : `${EMBED_MODEL} MISSING — every future index write will fail (have: ${names.join(', ') || 'none'})`,
    };
  } catch (err) {
    return { name: 'embeddings', severity: 'critical', detail: `Ollama unreachable: ${(err as Error).message}` };
  }
}

async function search(query: string, limit: number): Promise<Array<{ path?: string }>> {
  const res = await fetch(`${DAEMON_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit, scope: null }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`search returned HTTP ${res.status}`);
  const body = (await res.json()) as { results?: Array<{ path?: string }> };
  return body.results ?? [];
}

async function checkDaemon(): Promise<MemoryCheck> {
  try {
    const results = await search('knowledge archive note', 10);
    return results.length > 0
      ? { name: 'daemon', severity: 'ok', detail: `search returned ${results.length} results` }
      : { name: 'daemon', severity: 'critical', detail: 'search returned zero results' };
  } catch (err) {
    return { name: 'daemon', severity: 'critical', detail: `unreachable at ${DAEMON_URL}: ${(err as Error).message}` };
  }
}

/**
 * The freshness check. KNOWLEDGE/ exists only in the Mac's live memory tree and
 * never existed in the old on-box archive, so its presence in results proves the
 * mirror actually reached the index rather than merely that a service replied.
 */
async function checkIndexContent(): Promise<MemoryCheck> {
  try {
    const results = await search('Geyser Floodgate Bedrock tablets Minecraft', 25);
    const paths = results.map((r) => r.path ?? '');
    const sawKnowledge = paths.some((p) => p.startsWith('KNOWLEDGE/'));
    return {
      name: 'index-content',
      severity: sawKnowledge ? 'ok' : 'critical',
      detail: sawKnowledge
        ? 'KNOWLEDGE/ notes present in results — the live tree is reaching search'
        : `no KNOWLEDGE/ paths in results — the index is stale or built from the wrong tree (saw: ${paths.slice(0, 3).join(', ') || 'nothing'})`,
    };
  } catch (err) {
    return { name: 'index-content', severity: 'unknown', detail: `could not probe: ${(err as Error).message}` };
  }
}

export async function handleMemoryHealth(): Promise<MemoryHealthResult> {
  const checks = await Promise.all([
    checkMirror(),
    checkIndexer(),
    checkEmbeddings(),
    checkDaemon(),
    checkIndexContent(),
  ]);

  const overallSeverity = worstSeverity(...checks.map((c) => c.severity));
  const bad = checks.filter((c) => c.severity !== 'ok');
  const summary =
    bad.length === 0 ? 'Semantic memory healthy end to end' : bad.map((c) => `${c.name}: ${c.detail}`).join(' | ');

  return {
    timestamp: new Date().toISOString(),
    overallSeverity,
    summary,
    checks,
  };
}
