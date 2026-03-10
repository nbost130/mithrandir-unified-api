import { getContainers } from '../commands/docker.js';
import { loadManifest } from '../manifest.js';
import type { Severity } from '../types.js';

interface ContainerInfo {
  name: string;
  image: string;
  state: string;
  status: string;
  severity: Severity;
  expectedState?: string;
  ports?: string;
}

interface DockerStatusResult {
  timestamp: string;
  overallSeverity: Severity;
  summary: string;
  dockerAvailable: boolean;
  containers: ContainerInfo[];
  missingFromManifest: string[];
}

function worstSeverity(...severities: Severity[]): Severity {
  if (severities.includes('critical')) return 'critical';
  if (severities.includes('warning')) return 'warning';
  if (severities.includes('unknown')) return 'unknown';
  return 'ok';
}

export async function handleDockerStatus(input: { filter?: string }): Promise<DockerStatusResult> {
  try {
    const [rawContainers, manifest] = await Promise.all([getContainers(), loadManifest()]);

    const expectedContainers = new Map(manifest.services.docker.map((d) => [d.name, d]));

    let containers = rawContainers;
    if (input.filter) {
      const filterLower = input.filter.toLowerCase();
      containers = containers.filter(
        (c) => c.name.toLowerCase().includes(filterLower) || c.image.toLowerCase().includes(filterLower)
      );
    }

    const containerInfos: ContainerInfo[] = containers.map((c) => {
      const expected = expectedContainers.get(c.name);
      const expectedState = expected?.expected_state ?? 'running';
      const isRunning = c.state === 'running';
      let severity: Severity = 'ok';

      if (expectedState === 'running' && !isRunning) severity = 'critical';
      if (expectedState !== 'running' && isRunning) severity = 'warning';

      return {
        name: c.name,
        image: c.image,
        state: c.state,
        status: c.status,
        severity,
        expectedState,
        ports: c.ports,
      };
    });

    const runningNames = new Set(containers.map((c) => c.name));
    const missingFromManifest = manifest.services.docker
      .filter((d) => d.expected_state === 'running' && !runningNames.has(d.name))
      .map((d) => d.name);

    const allSeverities = containerInfos.map((c) => c.severity);
    if (missingFromManifest.length > 0) allSeverities.push('critical');

    const overallSeverity = allSeverities.length > 0 ? worstSeverity(...allSeverities) : 'ok';

    const problems = containerInfos.filter((c) => c.severity !== 'ok').length;
    const summary =
      problems === 0 && missingFromManifest.length === 0
        ? `All ${containerInfos.length} containers healthy`
        : `${problems} unhealthy containers, ${missingFromManifest.length} missing from manifest`;

    return {
      timestamp: new Date().toISOString(),
      overallSeverity,
      summary,
      dockerAvailable: true,
      containers: containerInfos,
      missingFromManifest,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isDockerUnavailable = msg.includes('docker') || msg.includes('ENOENT');

    return {
      timestamp: new Date().toISOString(),
      overallSeverity: isDockerUnavailable ? 'warning' : 'unknown',
      summary: isDockerUnavailable ? 'Docker not available on this host' : msg,
      dockerAvailable: !isDockerUnavailable,
      containers: [],
      missingFromManifest: [],
    };
  }
}
