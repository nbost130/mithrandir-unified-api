import { execFile } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { loadManifest } from '../manifest.js';
import type { Severity } from '../types.js';

interface CronEntry {
  schedule: string;
  command: string;
  inManifest: boolean;
  scriptExists?: boolean;
  severity: Severity;
}

interface CronHealthResult {
  timestamp: string;
  overallSeverity: Severity;
  summary: string;
  entries: CronEntry[];
  missingFromCrontab: string[];
}

function worstSeverity(...severities: Severity[]): Severity {
  if (severities.includes('critical')) return 'critical';
  if (severities.includes('warning')) return 'warning';
  if (severities.includes('unknown')) return 'unknown';
  return 'ok';
}

function execFilePromise(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) {
        if (stderr?.includes('no crontab for')) {
          resolve('');
          return;
        }
        reject(err);
        return;
      }
      resolve(stdout);
    });
  });
}

function parseCrontab(raw: string): Array<{ schedule: string; command: string }> {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const parts = line.split(/\s+/);
      if (parts.length < 6) return null;
      const schedule = parts.slice(0, 5).join(' ');
      const command = parts.slice(5).join(' ');
      return { schedule, command };
    })
    .filter((e): e is { schedule: string; command: string } => e !== null);
}

function extractScriptPath(command: string): string | null {
  const match = command.match(/(?:^|\s)(\/\S+)/);
  return match ? (match[1] ?? null) : null;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function handleCronHealth(): Promise<CronHealthResult> {
  try {
    const [raw, manifest] = await Promise.all([execFilePromise('crontab', ['-l']), loadManifest()]);

    const parsed = parseCrontab(raw);
    const manifestCrons = manifest.services.cron;
    const manifestCommands = new Set(manifestCrons.map((c) => c.command));

    const entries: CronEntry[] = await Promise.all(
      parsed.map(async (entry) => {
        const inManifest = manifestCommands.has(entry.command);
        const scriptPath = extractScriptPath(entry.command);
        const scriptExists = scriptPath ? await fileExists(scriptPath) : undefined;

        let severity: Severity = 'ok';
        if (scriptExists === false) severity = 'critical';
        if (!inManifest) severity = worstSeverity(severity, 'warning');

        return {
          schedule: entry.schedule,
          command: entry.command,
          inManifest,
          scriptExists,
          severity,
        };
      })
    );

    const activeCronCommands = new Set(parsed.map((p) => p.command));
    const missingFromCrontab = manifestCrons
      .filter((mc) => !activeCronCommands.has(mc.command))
      .map((mc) => mc.command);

    const allSeverities = entries.map((e) => e.severity);
    if (missingFromCrontab.length > 0) allSeverities.push('warning');

    const overallSeverity = allSeverities.length > 0 ? worstSeverity(...allSeverities) : 'ok';

    const problems = entries.filter((e) => e.severity !== 'ok').length;
    const summary =
      problems === 0 && missingFromCrontab.length === 0
        ? `${entries.length} cron entries healthy`
        : `${problems} issues found, ${missingFromCrontab.length} manifest entries missing from crontab`;

    return {
      timestamp: new Date().toISOString(),
      overallSeverity,
      summary,
      entries,
      missingFromCrontab,
    };
  } catch (err) {
    return {
      timestamp: new Date().toISOString(),
      overallSeverity: 'unknown',
      summary: err instanceof Error ? err.message : String(err),
      entries: [],
      missingFromCrontab: [],
    };
  }
}
