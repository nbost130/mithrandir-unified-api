import type { TailscaleStatus } from '../commands/network.js';
import { checkDns, checkInternet, getInterfaces, getTailscaleStatus } from '../commands/network.js';
import type { Severity } from '../types.js';

interface TailscaleInfo {
  available: boolean;
  connected: boolean;
  ip?: string;
  hostname?: string;
  severity: Severity;
}

interface NetworkStatusResult {
  timestamp: string;
  overallSeverity: Severity;
  summary: string;
  tailscale: TailscaleInfo;
  dns: { working: boolean; responseTimeMs?: number; severity: Severity };
  internet: { connected: boolean; responseTimeMs?: number; severity: Severity };
  interfaces: Array<{
    name: string;
    addresses: Array<{ address: string; family: string; internal: boolean }>;
    mac: string;
  }>;
}

function worstSeverity(...severities: Severity[]): Severity {
  if (severities.includes('critical')) return 'critical';
  if (severities.includes('warning')) return 'warning';
  if (severities.includes('unknown')) return 'unknown';
  return 'ok';
}

function buildTailscaleInfo(result: PromiseSettledResult<TailscaleStatus | null>): TailscaleInfo {
  if (result.status !== 'fulfilled' || !result.value) {
    return { available: false, connected: false, severity: 'warning' };
  }
  const ts = result.value;
  const isConnected = ts.backendState === 'Running';
  return {
    available: true,
    connected: isConnected,
    ip: ts.self.tailscaleIp,
    hostname: ts.self.hostname,
    severity: isConnected ? 'ok' : 'warning',
  };
}

export async function handleNetworkStatus(): Promise<NetworkStatusResult> {
  const timestamp = new Date().toISOString();

  const [tailscaleResult, dnsResult, internetResult, interfacesResult] = await Promise.allSettled([
    getTailscaleStatus(),
    checkDns(),
    checkInternet(),
    Promise.resolve(getInterfaces()),
  ]);

  const tailscale = buildTailscaleInfo(tailscaleResult);

  const dns =
    dnsResult.status === 'fulfilled'
      ? {
          working: dnsResult.value.working,
          responseTimeMs: dnsResult.value.responseTimeMs,
          severity: (dnsResult.value.working ? 'ok' : 'critical') as Severity,
        }
      : { working: false, severity: 'critical' as Severity };

  const internet =
    internetResult.status === 'fulfilled'
      ? {
          connected: internetResult.value.connected,
          responseTimeMs: internetResult.value.responseTimeMs,
          severity: (internetResult.value.connected ? 'ok' : 'critical') as Severity,
        }
      : { connected: false, severity: 'critical' as Severity };

  const interfaces =
    interfacesResult.status === 'fulfilled'
      ? interfacesResult.value.map((iface) => ({
          name: iface.name,
          addresses: iface.addresses.map((a) => ({ address: a.address, family: a.family, internal: a.internal })),
          mac: iface.mac,
        }))
      : [];

  const overallSeverity = worstSeverity(tailscale.severity, dns.severity, internet.severity);

  const issues: string[] = [];
  if (!internet.connected) issues.push('no internet');
  if (!dns.working) issues.push('DNS failing');
  if (!tailscale.connected) issues.push('Tailscale disconnected');

  const summary = issues.length === 0 ? 'All network checks passed' : `Network issues: ${issues.join(', ')}`;

  return { timestamp, overallSeverity, summary, tailscale, dns, internet, interfaces };
}
