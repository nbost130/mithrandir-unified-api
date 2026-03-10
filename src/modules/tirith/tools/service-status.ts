import { getServiceState } from '../commands/systemd.js';
import { loadManifest } from '../manifest.js';
import type { ManifestService, Severity } from '../types.js';

interface ServiceInfo {
  name: string;
  activeState: string;
  subState: string;
  loadState: string;
  description: string;
  severity: Severity;
  expectedState?: string;
  healthCheck?: { url: string; status: number | null; ok: boolean } | null;
}

interface ServiceStatusResult {
  timestamp: string;
  overallSeverity: Severity;
  summary: string;
  services: ServiceInfo[];
}

function worstSeverity(...severities: Severity[]): Severity {
  if (severities.includes('critical')) return 'critical';
  if (severities.includes('warning')) return 'warning';
  if (severities.includes('unknown')) return 'unknown';
  return 'ok';
}

async function checkHealthEndpoint(url: string): Promise<{ url: string; status: number | null; ok: boolean }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return { url, status: res.status, ok: res.ok };
  } catch {
    return { url, status: null, ok: false };
  }
}

async function checkSingleService(
  name: string,
  manifestEntry: ManifestService | undefined,
  doHealthCheck: boolean
): Promise<ServiceInfo> {
  try {
    const state = await getServiceState(name);
    const isActive = state.activeState === 'active';
    const expected = manifestEntry?.expected_state ?? 'active';
    const matchesExpected = state.activeState === expected;

    let severity: Severity = 'ok';
    if (!matchesExpected) severity = expected === 'active' ? 'critical' : 'warning';

    let healthCheck: ServiceInfo['healthCheck'] = null;
    if (doHealthCheck && manifestEntry?.health_check?.type === 'http' && isActive) {
      healthCheck = await checkHealthEndpoint(manifestEntry.health_check.target);
      if (!healthCheck.ok) severity = worstSeverity(severity, 'warning');
    }

    return {
      name,
      activeState: state.activeState,
      subState: state.subState,
      loadState: state.loadState,
      description: state.description,
      severity,
      expectedState: expected,
      healthCheck,
    };
  } catch (err) {
    return {
      name,
      activeState: 'unknown',
      subState: 'unknown',
      loadState: 'unknown',
      description: err instanceof Error ? err.message : 'Failed to query',
      severity: 'unknown',
      expectedState: manifestEntry?.expected_state ?? 'active',
      healthCheck: null,
    };
  }
}

export async function handleServiceStatus(input: {
  service: string;
  checkHealth?: boolean;
}): Promise<ServiceStatusResult> {
  try {
    const manifest = await loadManifest();
    const doHealth = input.checkHealth ?? false;
    let serviceNames: string[];

    if (input.service === 'all') {
      serviceNames = manifest.services.systemd.map((s) => s.name);
      if (serviceNames.length === 0) {
        return {
          timestamp: new Date().toISOString(),
          overallSeverity: 'warning',
          summary: 'No services defined in manifest',
          services: [],
        };
      }
    } else {
      serviceNames = [input.service];
    }

    const manifestMap = new Map(manifest.services.systemd.map((s) => [s.name, s]));

    const services = await Promise.all(
      serviceNames.map((name) => checkSingleService(name, manifestMap.get(name), doHealth))
    );

    const overallSeverity = worstSeverity(...services.map((s) => s.severity));
    const failed = services.filter((s) => s.severity !== 'ok');
    const summary =
      failed.length === 0
        ? `All ${services.length} services healthy`
        : `${failed.length}/${services.length} services need attention`;

    return {
      timestamp: new Date().toISOString(),
      overallSeverity,
      summary,
      services,
    };
  } catch (err) {
    return {
      timestamp: new Date().toISOString(),
      overallSeverity: 'unknown',
      summary: err instanceof Error ? err.message : String(err),
      services: [],
    };
  }
}
