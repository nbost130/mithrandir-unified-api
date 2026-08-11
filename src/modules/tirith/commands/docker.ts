// src/modules/tirith/commands/docker.ts
/**
 * @fileoverview Docker container interrogation for Tirith.
 * Uses execFile with array arguments — no shell interpolation.
 */

import { runCommand } from './registry.js';

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
  createdAt: string;
  networks: string;
}

/**
 * List all Docker containers (running and stopped).
 * Parses `docker ps -a --format json` output (one JSON object per line).
 */
export async function getContainers(): Promise<ContainerInfo[]> {
  const result = await runCommand('docker', ['ps', '-a', '--format', '{{json .}}', '--no-trunc'], { timeout: 10000 });

  // Returning [] on failure made handleDockerStatus()'s isDockerUnavailable
  // branch dead code — it can only fire on a throw, and nothing ever threw.
  // A dead daemon looked identical to a host with no containers.
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    throw new Error(
      `docker ps failed (exit ${result.exitCode}): ${result.stderr.trim() || 'no output'} — container list is unknown, not empty`
    );
  }

  return result.stdout
    .trim()
    .split('\n')
    .map(parseContainerLine)
    .filter((c): c is ContainerInfo => c !== null);
}

/** Parse one `docker ps --format {{json .}}` line. Returns null for unusable lines. */
function parseContainerLine(line: string): ContainerInfo | null {
  if (!line.trim()) return null;
  try {
    const obj = JSON.parse(line) as Record<string, string>;
    return {
      id: obj.ID || '',
      name: obj.Names || '',
      image: obj.Image || '',
      state: obj.State || '',
      status: obj.Status || '',
      ports: obj.Ports || '',
      createdAt: obj.CreatedAt || '',
      networks: obj.Networks || '',
    };
  } catch {
    return null;
  }
}

/**
 * Inspect a specific Docker container by name.
 * Returns the full inspect JSON (first element of the array).
 */
export async function getContainerInspect(name: string): Promise<Record<string, unknown> | null> {
  // Validate: only allow alphanumeric, hyphens, underscores, dots
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error(`Invalid container name: "${name}"`);
  }

  const result = await runCommand('docker', ['inspect', name], { timeout: 10000 });

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>[];
    return parsed[0] ?? null;
  } catch {
    return null;
  }
}
