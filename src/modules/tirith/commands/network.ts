// src/modules/tirith/commands/network.ts
/**
 * @fileoverview Network diagnostics for Tirith.
 * Tailscale status, port listeners, DNS checks, internet connectivity.
 */

import * as os from 'node:os';
import { runCommand } from './registry.js';

export interface TailscalePeer {
  hostname: string;
  tailscaleIp: string;
  os: string;
  online: boolean;
  lastSeen: string;
}

export interface TailscaleStatus {
  self: {
    hostname: string;
    tailscaleIp: string;
    os: string;
  };
  peers: TailscalePeer[];
  backendState: string;
}

export interface PortListener {
  protocol: string;
  localAddress: string;
  localPort: number;
  process: string;
}

export interface NetworkInterface {
  name: string;
  addresses: Array<{
    address: string;
    family: 'IPv4' | 'IPv6';
    netmask: string;
    internal: boolean;
  }>;
  mac: string;
}

/**
 * Get Tailscale network status.
 */
export async function getTailscaleStatus(): Promise<TailscaleStatus | null> {
  const result = await runCommand('tailscale', ['status', '--json'], { timeout: 5000 });

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return null;
  }

  try {
    const raw = JSON.parse(result.stdout) as Record<string, unknown>;
    const selfNode = raw.Self as Record<string, unknown> | undefined;
    const peerMap = (raw.Peer ?? {}) as Record<string, Record<string, unknown>>;

    const peers: TailscalePeer[] = Object.values(peerMap).map((p) => ({
      hostname: String(p.HostName ?? ''),
      tailscaleIp: Array.isArray(p.TailscaleIPs) ? String(p.TailscaleIPs[0] ?? '') : '',
      os: String(p.OS ?? ''),
      online: Boolean(p.Online),
      lastSeen: String(p.LastSeen ?? ''),
    }));

    return {
      self: {
        hostname: String(selfNode?.HostName ?? os.hostname()),
        tailscaleIp: Array.isArray(selfNode?.TailscaleIPs) ? String((selfNode.TailscaleIPs as string[])[0] ?? '') : '',
        os: String(selfNode?.OS ?? ''),
      },
      peers,
      backendState: String(raw.BackendState ?? 'unknown'),
    };
  } catch {
    return null;
  }
}

/**
 * Get listening TCP ports via `ss -tlnp`.
 * Parses the tabular output into structured data.
 */
export async function getPortListeners(): Promise<PortListener[]> {
  const result = await runCommand('ss', ['-tlnp'], { timeout: 5000 });

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return [];
  }

  const lines = result.stdout.trim().split('\n');
  const listeners: PortListener[] = [];

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const listener = parseSsLine(lines[i]);
    if (listener) listeners.push(listener);
  }

  return listeners;
}

function parseSsLine(line: string | undefined): PortListener | null {
  if (!line) return null;
  const parts = line.trim().split(/\s+/);
  if (parts.length < 5) return null;

  const localAddr = parts[3] ?? '';
  const lastColon = localAddr.lastIndexOf(':');
  const address = lastColon >= 0 ? localAddr.slice(0, lastColon) : '*';
  const port = lastColon >= 0 ? Number.parseInt(localAddr.slice(lastColon + 1), 10) : 0;

  if (Number.isNaN(port) || port <= 0) return null;

  const processCol = parts.slice(5).join(' ');
  const processMatch = processCol.match(/\("([^"]+)"/);

  return {
    protocol: 'tcp',
    localAddress: address,
    localPort: port,
    process: processMatch?.[1] ?? '',
  };
}

/**
 * Check DNS resolution (resolves google.com via dig).
 */
export async function checkDns(): Promise<{
  working: boolean;
  responseTimeMs: number;
  resolvedIp: string | null;
}> {
  const start = Date.now();
  const result = await runCommand('dig', ['+short', '+time=3', 'google.com', 'A'], { timeout: 5000 });
  const elapsed = Date.now() - start;

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return { working: false, responseTimeMs: elapsed, resolvedIp: null };
  }

  const firstLine = result.stdout.trim().split('\n')[0] ?? '';
  const ipMatch = firstLine.match(/^\d+\.\d+\.\d+\.\d+$/);

  return {
    working: Boolean(ipMatch),
    responseTimeMs: elapsed,
    resolvedIp: ipMatch ? firstLine : null,
  };
}

/**
 * Check basic internet connectivity via curl to a reliable endpoint.
 */
export async function checkInternet(): Promise<{
  connected: boolean;
  responseTimeMs: number;
}> {
  const start = Date.now();
  const result = await runCommand(
    'curl',
    [
      '-s',
      '-o',
      '/dev/null',
      '-w',
      '%{http_code}',
      '--connect-timeout',
      '3',
      '--max-time',
      '5',
      'https://www.google.com',
    ],
    { timeout: 7000 }
  );
  const elapsed = Date.now() - start;

  const httpCode = Number.parseInt(result.stdout.trim(), 10);
  return {
    connected: result.exitCode === 0 && httpCode >= 200 && httpCode < 400,
    responseTimeMs: elapsed,
  };
}

/**
 * Get network interfaces from the OS module.
 */
export function getInterfaces(): NetworkInterface[] {
  const raw = os.networkInterfaces();
  const interfaces: NetworkInterface[] = [];

  for (const [name, addrs] of Object.entries(raw)) {
    if (!addrs) continue;
    interfaces.push({
      name,
      addresses: addrs.map((a) => ({
        address: a.address,
        family: a.family as 'IPv4' | 'IPv6',
        netmask: a.netmask,
        internal: a.internal,
      })),
      mac: addrs[0]?.mac ?? '00:00:00:00:00:00',
    });
  }

  return interfaces;
}
