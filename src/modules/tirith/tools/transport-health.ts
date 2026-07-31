import { getJournalEntries, type JournalEntry } from '../commands/systemd.js';
import type { Severity } from '../types.js';

/**
 * @fileoverview Transport-health diagnostic for the Ithildin gateway.
 *
 * Motivation: the standard checks (port_check, service_status, system_health)
 * report a service as healthy whenever its process is up and its port is
 * listening. But the Ithildin gateway can be fully "up" by that measure while a
 * chat transport is silently dead — e.g. after a power failure, the Matrix
 * initial sync hit ConnectionRefused (Synapse still starting) and never
 * retried, so the process looked green while Matrix chat was unreachable.
 *
 * This tool closes that blind spot. It (1) probes the Matrix homeserver
 * directly and (2) parses the gateway's recent journal to infer, per channel,
 * whether it is actually connected — not just whether the process is alive.
 *
 * Log patterns are specific to Ithildin's transport logging.
 */

type TransportName = 'matrix' | 'whatsapp' | 'telegram';
type TransportState = 'connected' | 'degraded' | 'down' | 'disabled' | 'unknown';

interface TransportReport {
  transport: TransportName;
  state: TransportState;
  severity: Severity;
  lastConnectedAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  detail: string;
  evidence: string[];
}

interface HomeserverProbe {
  url: string;
  reachable: boolean;
  status: number | null;
  error: string | null;
}

interface TransportHealthResult {
  timestamp: string;
  unit: string;
  overallSeverity: Severity;
  summary: string;
  homeserver: HomeserverProbe;
  transports: TransportReport[];
}

function worstSeverity(...severities: Severity[]): Severity {
  if (severities.includes('critical')) return 'critical';
  if (severities.includes('warning')) return 'warning';
  if (severities.includes('unknown')) return 'unknown';
  return 'ok';
}

/** Probe the Matrix homeserver's client-versions endpoint (cheap, unauthenticated). */
async function probeHomeserver(url: string, timeoutMs: number): Promise<HomeserverProbe> {
  const base = url.replace(/\/+$/, '');
  const target = `${base}/_matrix/client/versions`;
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(timeoutMs) });
    return {
      url: base,
      reachable: res.ok,
      status: res.status,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      url: base,
      reachable: false,
      status: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Newest-first entries whose message matches `re`. */
function matching(entries: JournalEntry[], re: RegExp): JournalEntry[] {
  return entries.filter((e) => re.test(e.message));
}

/** Most recent (newest) entry matching `re`, or undefined. */
function latest(entries: JournalEntry[], re: RegExp): JournalEntry | undefined {
  return matching(entries, re)[0];
}

function evidenceFrom(entries: JournalEntry[], re: RegExp, max = 3): string[] {
  return matching(entries, re)
    .slice(0, max)
    .map((e) => `${e.timestamp}  ${e.message}`.slice(0, 300));
}

function analyzeMatrix(entries: JournalEntry[], homeserver: HomeserverProbe): TransportReport {
  const listening = latest(
    entries,
    /Matrix transport: listening|matrix-sync\].*(Baseline established|Resumed from saved token)/
  );
  const error = latest(
    entries,
    /\[Matrix\] Sync startup failed|ConnectionRefused|\[matrix-sync\] (Error|Initial sync failed|Fresh sync also failed)/
  );

  const lastConnectedAt = listening?.timestamp ?? null;
  const lastErrorAt = error?.timestamp ?? null;
  const listeningNewer = listening && (!error || listening.timestamp >= error.timestamp);

  let state: TransportState;
  let severity: Severity;
  let detail: string;

  if (!homeserver.reachable) {
    state = 'down';
    severity = 'critical';
    detail = `Matrix homeserver unreachable (${homeserver.error ?? 'no response'}) — chat cannot flow even if the gateway process is up.`;
  } else if (listeningNewer) {
    state = 'connected';
    severity = 'ok';
    detail = 'Homeserver reachable and gateway last logged a live Matrix sync.';
  } else if (error) {
    state = 'down';
    severity = 'critical';
    detail =
      'Homeserver is reachable but the gateway last logged a Matrix sync failure with no subsequent recovery — restart the gateway.';
  } else if (listening) {
    state = 'connected';
    severity = 'ok';
    detail = 'Homeserver reachable and gateway logged a live Matrix sync.';
  } else {
    state = 'unknown';
    severity = 'unknown';
    detail = 'No Matrix transport log lines in the lookback window; increase lookbackMinutes to confirm.';
  }

  return {
    transport: 'matrix',
    state,
    severity,
    lastConnectedAt,
    lastErrorAt,
    lastError: error?.message ?? null,
    detail,
    evidence: evidenceFrom(entries, /[Mm]atrix|matrix-sync/),
  };
}

function analyzeWhatsApp(entries: JournalEntry[]): TransportReport {
  const connected = latest(entries, /\[WhatsApp\] Connected/);
  const closed = latest(entries, /\[WhatsApp\] Connection closed/);
  const anyWhatsApp = latest(entries, /WhatsApp|baileys/);

  const lastConnectedAt = connected?.timestamp ?? null;
  const connectedNewer = connected && (!closed || connected.timestamp >= closed.timestamp);

  let state: TransportState;
  let severity: Severity;
  let detail: string;

  if (connectedNewer) {
    state = 'connected';
    severity = 'ok';
    detail = 'WhatsApp last logged a successful connection.';
  } else if (closed) {
    state = 'degraded';
    severity = 'warning';
    detail = 'WhatsApp last logged a dropped connection (reconnect loop expected — verify it recovers).';
  } else if (anyWhatsApp) {
    state = 'unknown';
    severity = 'unknown';
    detail = 'WhatsApp activity present but no clear connect/close in the lookback window.';
  } else {
    state = 'unknown';
    severity = 'unknown';
    detail = 'No WhatsApp log lines in the lookback window.';
  }

  return {
    transport: 'whatsapp',
    state,
    severity,
    lastConnectedAt,
    lastErrorAt: closed?.timestamp ?? null,
    lastError: closed?.message ?? null,
    detail,
    evidence: evidenceFrom(entries, /\[WhatsApp\]/),
  };
}

function analyzeTelegram(entries: JournalEntry[]): TransportReport {
  const disabled = latest(entries, /Telegram polling DISABLED/);
  const active = latest(entries, /Telegram polling (started|enabled|active)|getUpdates/);

  let state: TransportState;
  let severity: Severity;
  let detail: string;

  if (disabled && (!active || disabled.timestamp >= active.timestamp)) {
    state = 'disabled';
    severity = 'ok';
    detail = 'Telegram polling is intentionally disabled (another process owns getUpdates) — not a fault.';
  } else if (active) {
    state = 'connected';
    severity = 'ok';
    detail = 'Telegram polling is active.';
  } else {
    state = 'unknown';
    severity = 'unknown';
    detail = 'No Telegram transport log lines in the lookback window.';
  }

  return {
    transport: 'telegram',
    state,
    severity,
    lastConnectedAt: active?.timestamp ?? null,
    lastErrorAt: null,
    lastError: null,
    detail,
    evidence: evidenceFrom(entries, /Telegram/),
  };
}

/**
 * Diagnose the Ithildin gateway's chat transports.
 * Probes the Matrix homeserver and analyzes recent logs to report, per channel,
 * whether it is actually connected — catching the "process up but chat dead" case.
 */
export async function handleTransportHealth(input: {
  unit?: string;
  homeserverUrl?: string;
  lookbackMinutes?: number;
}): Promise<TransportHealthResult> {
  const unit = input.unit ?? 'ithildin';
  const homeserverUrl = input.homeserverUrl ?? 'http://localhost:8008';
  const lookbackMinutes = input.lookbackMinutes ?? 120;

  const [homeserver, entriesAsc] = await Promise.all([
    probeHomeserver(homeserverUrl, 5000),
    getJournalEntries(unit, {
      since: `${lookbackMinutes} minutes ago`,
      search: 'Matrix|matrix|WhatsApp|Telegram|baileys',
      limit: 800,
    }).catch(() => [] as JournalEntry[]),
  ]);

  // Work newest-first so "latest" helpers read naturally.
  const entries = [...entriesAsc].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  const transports: TransportReport[] = [
    analyzeMatrix(entries, homeserver),
    analyzeWhatsApp(entries),
    analyzeTelegram(entries),
  ];

  const overallSeverity = worstSeverity(homeserver.reachable ? 'ok' : 'critical', ...transports.map((t) => t.severity));

  const summary = transports.map((t) => `${t.transport}: ${t.state}`).join(', ');

  return {
    timestamp: new Date().toISOString(),
    unit,
    overallSeverity,
    summary,
    homeserver,
    transports,
  };
}
