// src/modules/tirith/commands/registry.ts
/**
 * @fileoverview Command execution registry for Tirith.
 * Wraps child_process.execFile with timeout, audit logging, and no shell interpolation.
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import type { CommandResult } from '../types.js';

const execFile = promisify(execFileCb);

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 10000;

/** All known services in the Mithrandir estate. */
export const KNOWN_SERVICES = new Set([
  'ithildin',
  'transcription-palantir',
  'mithrandir-unified-api',
  'mithrandir-admin',
  'n8n',
  'ssh',
  'syncthing',
  'redis',
] as const);

export type KnownService = typeof KNOWN_SERVICES extends Set<infer T> ? T : never;

/** User-scoped systemd services (use --user flag). */
export const USER_SERVICES = new Set([
  'ithildin',
  'transcription-palantir',
  'mithrandir-unified-api',
  'mithrandir-admin',
] as const);

/**
 * Validates a service name against the known services set.
 * Returns the validated name or throws.
 */
export function validateServiceName(name: string): string {
  if (!KNOWN_SERVICES.has(name as KnownService)) {
    throw new Error(`Unknown service: "${name}". Known services: ${[...KNOWN_SERVICES].join(', ')}`);
  }
  return name;
}

/**
 * Whether a service is user-scoped (needs --user flag for systemctl).
 */
export function isUserService(name: string): boolean {
  return USER_SERVICES.has(name as typeof USER_SERVICES extends Set<infer T> ? T : never);
}

/**
 * Execute a command with array arguments (no shell interpolation).
 * Enforces timeout, logs every invocation with command, args, duration, and exit code.
 */
export async function runCommand(cmd: string, args: string[], options?: { timeout?: number }): Promise<CommandResult> {
  const timeout = Math.min(options?.timeout ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execFile(cmd, args, {
      timeout,
      maxBuffer: 1024 * 1024, // 1MB
    });

    const duration = Date.now() - startTime;
    console.log(`[tirith:cmd] ${cmd} ${args.join(' ')} | exit=0 duration=${duration}ms`);

    return { stdout: stdout ?? '', stderr: stderr ?? '', exitCode: 0 };
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const err = error as {
      code?: string;
      killed?: boolean;
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    // execFile populates stdout/stderr even on non-zero exit
    const exitCode = err.killed ? 124 : err.code === 'ENOENT' ? 127 : 1;

    console.warn(
      `[tirith:cmd] ${cmd} ${args.join(' ')} | exit=${exitCode} duration=${duration}ms err=${err.message ?? 'unknown'}`
    );

    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? err.message ?? '',
      exitCode,
    };
  }
}
