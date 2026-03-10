// src/modules/tirith/commands/systemd.ts
/**
 * @fileoverview systemd service interrogation for Tirith.
 * Uses execFile (array args, no shell) and validates against KNOWN_SERVICES.
 */

import { isUserService, runCommand, validateServiceName } from './registry.js';

export interface ServiceState {
  name: string;
  activeState: string;
  subState: string;
  loadState: string;
  pid: number | null;
  uptimeSeconds: number | null;
  memoryBytes: number | null;
  description: string;
  fragmentPath: string;
}

export interface JournalEntry {
  timestamp: string;
  priority: number;
  unit: string;
  message: string;
}

const SYSTEMCTL_PROPERTIES = [
  'ActiveState',
  'SubState',
  'LoadState',
  'MainPID',
  'ExecMainStartTimestamp',
  'MemoryCurrent',
  'Description',
  'FragmentPath',
].join(',');

/**
 * Get current state of a systemd service.
 * Validates name against KNOWN_SERVICES, uses --user for user-scoped services.
 */
export async function getServiceState(name: string): Promise<ServiceState> {
  validateServiceName(name);

  const args = isUserService(name)
    ? ['--user', 'show', `${name}.service`, `--property=${SYSTEMCTL_PROPERTIES}`, '--no-pager']
    : ['show', `${name}.service`, `--property=${SYSTEMCTL_PROPERTIES}`, '--no-pager'];

  const result = await runCommand('systemctl', args);

  const props = parseProperties(result.stdout);

  return propsToServiceState(name, props);
}

function propsToServiceState(name: string, props: Record<string, string>): ServiceState {
  const uptimeSeconds = parseUptime(props.ExecMainStartTimestamp);
  const pid = Number.parseInt(props.MainPID || '0', 10);
  const memoryBytes = parseMemory(props.MemoryCurrent);

  return {
    name,
    activeState: props.ActiveState || 'unknown',
    subState: props.SubState || 'unknown',
    loadState: props.LoadState || 'unknown',
    pid: pid > 0 ? pid : null,
    uptimeSeconds,
    memoryBytes,
    description: props.Description || '',
    fragmentPath: props.FragmentPath || '',
  };
}

function parseUptime(startTs: string | undefined): number | null {
  if (!startTs || startTs === '') return null;
  const startDate = new Date(startTs);
  if (Number.isNaN(startDate.getTime())) return null;
  return Math.floor((Date.now() - startDate.getTime()) / 1000);
}

function parseMemory(raw: string | undefined): number | null {
  if (!raw || raw === '' || raw === '[not set]') return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Get journal entries for a systemd unit.
 * Supports time filtering, line limit, priority filter, and text search.
 */
export async function getJournalEntries(
  unit: string,
  opts: {
    since?: string;
    limit?: number;
    priority?: number;
    search?: string;
  } = {}
): Promise<JournalEntry[]> {
  validateServiceName(unit);

  const args = ['--output=json', '--no-pager', `-u`, `${unit}.service`];

  if (isUserService(unit)) {
    args.push('--user');
  }

  if (opts.since) {
    args.push(`--since=${opts.since}`);
  }

  if (opts.priority !== undefined) {
    args.push(`-p`, String(opts.priority));
  }

  if (opts.search) {
    args.push(`--grep=${opts.search}`);
  }

  const limit = opts.limit ?? 100;
  args.push(`-n`, String(limit));

  const result = await runCommand('journalctl', args, { timeout: 10000 });

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return [];
  }

  // journalctl --output=json emits one JSON object per line
  const entries: JournalEntry[] = [];
  for (const line of result.stdout.trim().split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line) as Record<string, string>;
      entries.push({
        timestamp: usecToIso(obj.__REALTIME_TIMESTAMP),
        priority: Number.parseInt(obj.PRIORITY || '6', 10),
        unit: obj._SYSTEMD_UNIT || unit,
        message: obj.MESSAGE || '',
      });
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

// --- Helpers ---

function parseProperties(stdout: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const line of stdout.split('\n')) {
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx);
    const value = line.slice(eqIdx + 1);
    props[key] = value;
  }
  return props;
}

function usecToIso(usecStr: string | undefined): string {
  if (!usecStr) return new Date().toISOString();
  const usec = Number.parseInt(usecStr, 10);
  if (Number.isNaN(usec)) return new Date().toISOString();
  return new Date(usec / 1000).toISOString();
}
