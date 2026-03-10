// src/modules/tirith/commands/system.ts
/**
 * @fileoverview System health metrics for Tirith.
 * CPU, memory, disk, load average, uptime, and process listing.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { runCommand } from './registry.js';

export interface SystemHealth {
  cpu: {
    usagePercent: number;
    cores: number;
    model: string;
  };
  memory: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    usagePercent: number;
  };
  disk: {
    filesystem: string;
    totalFormatted: string;
    usedFormatted: string;
    availableFormatted: string;
    usagePercent: number;
    mountPoint: string;
  };
  loadAvg: {
    avg1m: number;
    avg5m: number;
    avg15m: number;
    cpuCores: number;
  };
  uptime: {
    seconds: number;
    formatted: string;
    bootTime: string;
  };
}

export interface ProcessEntry {
  user: string;
  pid: number;
  cpuPercent: number;
  memPercent: number;
  vsz: number;
  rss: number;
  tty: string;
  stat: string;
  start: string;
  time: string;
  command: string;
}

/**
 * Collect system health metrics: CPU, memory, disk, load, uptime.
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  const [diskInfo, loadAvg] = await Promise.all([getDiskUsage(), getLoadAverage()]);

  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const uptimeSec = os.uptime();

  return {
    cpu: {
      usagePercent: computeCpuUsage(cpus),
      cores: cpus.length,
      model: cpus[0]?.model ?? 'unknown',
    },
    memory: {
      totalBytes: totalMem,
      freeBytes: freeMem,
      usedBytes: usedMem,
      usagePercent: Math.round((usedMem / totalMem) * 10000) / 100,
    },
    disk: diskInfo,
    loadAvg: {
      ...loadAvg,
      cpuCores: cpus.length,
    },
    uptime: {
      seconds: uptimeSec,
      formatted: formatUptime(uptimeSec),
      bootTime: new Date(Date.now() - uptimeSec * 1000).toISOString(),
    },
  };
}

/**
 * List running processes, sorted by CPU or memory usage.
 */
export async function getProcessList(
  opts: { sortBy?: 'cpu' | 'memory'; limit?: number; filter?: string } = {}
): Promise<ProcessEntry[]> {
  const sortFlag = opts.sortBy === 'memory' ? '--sort=-pmem' : '--sort=-pcpu';
  const result = await runCommand('ps', ['aux', sortFlag], { timeout: 5000 });

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return [];
  }

  const lines = result.stdout.trim().split('\n');
  const filterLower = opts.filter?.toLowerCase();
  const entries: ProcessEntry[] = [];

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const entry = parsePsLine(lines[i]);
    if (!entry) continue;
    if (filterLower && !entry.command.toLowerCase().includes(filterLower)) continue;
    entries.push(entry);
    if (opts.limit && entries.length >= opts.limit) break;
  }

  return entries;
}

function parsePsLine(line: string | undefined): ProcessEntry | null {
  if (!line) return null;
  // ps aux columns: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
  const parts = line.trim().split(/\s+/);
  if (parts.length < 11) return null;

  return {
    user: parts[0] ?? '',
    pid: Number.parseInt(parts[1] ?? '0', 10),
    cpuPercent: Number.parseFloat(parts[2] ?? '0'),
    memPercent: Number.parseFloat(parts[3] ?? '0'),
    vsz: Number.parseInt(parts[4] ?? '0', 10),
    rss: Number.parseInt(parts[5] ?? '0', 10),
    tty: parts[6] ?? '?',
    stat: parts[7] ?? '',
    start: parts[8] ?? '',
    time: parts[9] ?? '',
    command: parts.slice(10).join(' '),
  };
}

// --- Helpers ---

function computeCpuUsage(cpus: os.CpuInfo[]): number {
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    const { user, nice, sys, idle, irq } = cpu.times;
    totalIdle += idle;
    totalTick += user + nice + sys + idle + irq;
  }
  const usage = totalTick > 0 ? ((totalTick - totalIdle) / totalTick) * 100 : 0;
  return Math.round(usage * 100) / 100;
}

async function getDiskUsage(): Promise<SystemHealth['disk']> {
  const result = await runCommand('df', ['-h', '/'], { timeout: 5000 });

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return {
      filesystem: 'unknown',
      totalFormatted: '0',
      usedFormatted: '0',
      availableFormatted: '0',
      usagePercent: 0,
      mountPoint: '/',
    };
  }

  const lines = result.stdout.trim().split('\n');
  // Skip header, parse data line
  const dataLine = lines[1] ?? '';
  const parts = dataLine.trim().split(/\s+/);

  return {
    filesystem: parts[0] ?? 'unknown',
    totalFormatted: parts[1] ?? '0',
    usedFormatted: parts[2] ?? '0',
    availableFormatted: parts[3] ?? '0',
    usagePercent: Number.parseInt((parts[4] ?? '0').replace('%', ''), 10),
    mountPoint: parts[5] ?? '/',
  };
}

async function getLoadAverage(): Promise<{ avg1m: number; avg5m: number; avg15m: number }> {
  try {
    const content = await fs.readFile('/proc/loadavg', 'utf-8');
    const parts = content.trim().split(/\s+/);
    return {
      avg1m: Number.parseFloat(parts[0] ?? '0'),
      avg5m: Number.parseFloat(parts[1] ?? '0'),
      avg15m: Number.parseFloat(parts[2] ?? '0'),
    };
  } catch {
    // Fallback for non-Linux (macOS dev): use os.loadavg()
    const [avg1m, avg5m, avg15m] = os.loadavg();
    return {
      avg1m: Math.round((avg1m ?? 0) * 100) / 100,
      avg5m: Math.round((avg5m ?? 0) * 100) / 100,
      avg15m: Math.round((avg15m ?? 0) * 100) / 100,
    };
  }
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return parts.join(' ');
}
