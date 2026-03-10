import { loadManifest } from '../manifest.js';
import type { DriftItem, Severity } from '../types.js';
import { handleCronHealth } from './cron-health.js';
import { handleDockerStatus } from './docker-status.js';
import { handleNetworkStatus } from './network-status.js';
import { handlePortCheck } from './port-check.js';
import { handleRedisInfo } from './redis-info.js';
import { handleServiceStatus } from './service-status.js';
import { handleSystemHealth } from './system-health.js';

interface EstateDiffResult {
  timestamp: string;
  overallSeverity: Severity;
  summary: string;
  manifest: { loaded: boolean; path: string };
  driftItems: DriftItem[];
  counts: { ok: number; warning: number; critical: number; unknown: number };
  dimensions: string[];
  skippedSections: string[];
}

type DimensionName = 'system' | 'services' | 'docker' | 'ports' | 'cron' | 'network' | 'redis';

function worstSeverity(...severities: Severity[]): Severity {
  if (severities.includes('critical')) return 'critical';
  if (severities.includes('warning')) return 'warning';
  if (severities.includes('unknown')) return 'unknown';
  return 'ok';
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

export async function handleEstateDiff(input: { section?: string }): Promise<EstateDiffResult> {
  const timestamp = new Date().toISOString();
  const manifestPath = 'config/estate-manifest.yaml';
  const driftItems: DriftItem[] = [];
  const skippedSections: string[] = [];

  let manifestLoaded = false;
  try {
    await loadManifest();
    manifestLoaded = true;
  } catch {
    // Manifest may not exist; we continue with reduced checks
  }

  const allDimensions: DimensionName[] = ['system', 'services', 'docker', 'ports', 'cron', 'network', 'redis'];

  const targetDimensions =
    input.section && input.section !== 'all' ? allDimensions.filter((d) => d === input.section) : allDimensions;

  if (input.section && input.section !== 'all' && targetDimensions.length === 0) {
    return {
      timestamp,
      overallSeverity: 'unknown',
      summary: `Unknown section: ${input.section}`,
      manifest: { loaded: manifestLoaded, path: manifestPath },
      driftItems: [],
      counts: { ok: 0, warning: 0, critical: 0, unknown: 0 },
      dimensions: [],
      skippedSections: [],
    };
  }

  const checks: Array<{ dimension: DimensionName; fn: () => Promise<void> }> = [
    {
      dimension: 'system',
      fn: async () => {
        const health = await withTimeout(handleSystemHealth(), 5000, 'system');
        if (health.overallSeverity !== 'ok') {
          driftItems.push({
            dimension: 'system',
            entity: 'system-health',
            expected: 'All metrics within thresholds',
            actual: `CPU ${health.cpu.value}%, Mem ${health.memory.value}%, Disk ${health.disk.value}%`,
            severity: health.overallSeverity,
            recommendation: 'Investigate elevated system metrics',
          });
        }
      },
    },
    {
      dimension: 'services',
      fn: async () => {
        const result = await withTimeout(handleServiceStatus({ service: 'all', checkHealth: true }), 5000, 'services');
        for (const svc of result.services) {
          if (svc.severity !== 'ok') {
            driftItems.push({
              dimension: 'services',
              entity: svc.name,
              expected: svc.expectedState ?? 'active',
              actual: svc.activeState,
              severity: svc.severity,
              recommendation: `Check service ${svc.name} — expected ${svc.expectedState ?? 'active'} but got ${svc.activeState}`,
            });
          }
        }
      },
    },
    {
      dimension: 'docker',
      fn: async () => {
        const result = await withTimeout(handleDockerStatus({}), 5000, 'docker');
        for (const c of result.containers) {
          if (c.severity !== 'ok') {
            driftItems.push({
              dimension: 'docker',
              entity: c.name,
              expected: c.expectedState ?? 'running',
              actual: c.state,
              severity: c.severity,
              recommendation: `Container ${c.name} expected ${c.expectedState ?? 'running'} but is ${c.state}`,
            });
          }
        }
        for (const missing of result.missingFromManifest) {
          driftItems.push({
            dimension: 'docker',
            entity: missing,
            expected: 'running',
            actual: 'not found',
            severity: 'critical',
            recommendation: `Start container ${missing} or remove from manifest`,
          });
        }
      },
    },
    {
      dimension: 'ports',
      fn: async () => {
        const result = await withTimeout(handlePortCheck({ ports: 'manifest' }), 5000, 'ports');
        for (const p of result.ports) {
          if (p.severity !== 'ok') {
            driftItems.push({
              dimension: 'ports',
              entity: `port ${p.port}`,
              expected: 'listening',
              actual: 'not listening',
              severity: p.severity,
              recommendation: `Check why port ${p.port} is not listening`,
            });
          }
        }
      },
    },
    {
      dimension: 'cron',
      fn: async () => {
        const result = await withTimeout(handleCronHealth(), 5000, 'cron');
        for (const entry of result.entries) {
          if (entry.severity !== 'ok') {
            driftItems.push({
              dimension: 'cron',
              entity: entry.command,
              expected: 'healthy',
              actual: entry.scriptExists === false ? 'script missing' : 'not in manifest',
              severity: entry.severity,
              recommendation:
                entry.scriptExists === false
                  ? `Script for cron job "${entry.command}" is missing`
                  : `Cron job "${entry.command}" is not in the estate manifest`,
            });
          }
        }
        for (const missing of result.missingFromCrontab) {
          driftItems.push({
            dimension: 'cron',
            entity: missing,
            expected: 'in crontab',
            actual: 'missing',
            severity: 'warning',
            recommendation: `Add cron job "${missing}" or remove from manifest`,
          });
        }
      },
    },
    {
      dimension: 'network',
      fn: async () => {
        const result = await withTimeout(handleNetworkStatus(), 5000, 'network');
        if (!result.internet.connected) {
          driftItems.push({
            dimension: 'network',
            entity: 'internet',
            expected: 'connected',
            actual: 'unreachable',
            severity: 'critical',
            recommendation: 'Check internet connectivity',
          });
        }
        if (!result.dns.working) {
          driftItems.push({
            dimension: 'network',
            entity: 'dns',
            expected: 'working',
            actual: 'failing',
            severity: 'critical',
            recommendation: 'Check DNS resolver configuration',
          });
        }
        if (!result.tailscale.connected) {
          driftItems.push({
            dimension: 'network',
            entity: 'tailscale',
            expected: 'connected',
            actual: 'disconnected',
            severity: 'warning',
            recommendation: 'Check Tailscale status: tailscale status',
          });
        }
      },
    },
    {
      dimension: 'redis',
      fn: async () => {
        const result = await withTimeout(handleRedisInfo({}), 5000, 'redis');
        if (!result.available) {
          driftItems.push({
            dimension: 'redis',
            entity: 'redis-server',
            expected: 'available',
            actual: 'unavailable',
            severity: 'critical',
            recommendation: 'Check Redis service: systemctl status redis',
          });
        } else if (result.overallSeverity !== 'ok') {
          driftItems.push({
            dimension: 'redis',
            entity: 'redis-health',
            expected: 'healthy',
            actual: result.summary,
            severity: result.overallSeverity,
            recommendation: 'Check Redis memory fragmentation and slow log',
          });
        }
      },
    },
  ];

  const activeChecks = checks.filter((c) => targetDimensions.includes(c.dimension));

  const masterTimeout = setTimeout(() => {}, 15000);

  await Promise.allSettled(
    activeChecks.map((check) =>
      check.fn().catch((err) => {
        skippedSections.push(check.dimension);
        driftItems.push({
          dimension: check.dimension,
          entity: 'check-failed',
          expected: 'check completes',
          actual: err instanceof Error ? err.message : String(err),
          severity: 'unknown',
          recommendation: `Investigate why the ${check.dimension} check failed`,
        });
      })
    )
  );

  clearTimeout(masterTimeout);

  const counts = { ok: 0, warning: 0, critical: 0, unknown: 0 };
  for (const item of driftItems) {
    if (item.severity in counts) {
      counts[item.severity as keyof typeof counts]++;
    }
  }

  const checkedDimensions = targetDimensions.filter((d) => !skippedSections.includes(d));

  const overallSeverity = driftItems.length > 0 ? worstSeverity(...driftItems.map((d) => d.severity)) : 'ok';

  const summary =
    driftItems.length === 0
      ? `Estate healthy across ${checkedDimensions.length} dimensions`
      : `${driftItems.length} drift items found: ${counts.critical} critical, ${counts.warning} warning, ${counts.unknown} unknown`;

  return {
    timestamp,
    overallSeverity,
    summary,
    manifest: { loaded: manifestLoaded, path: manifestPath },
    driftItems,
    counts,
    dimensions: checkedDimensions,
    skippedSections,
  };
}
