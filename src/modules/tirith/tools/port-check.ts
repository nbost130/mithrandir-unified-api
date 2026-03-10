import { getPortListeners } from '../commands/network.js';
import { loadManifest } from '../manifest.js';
import type { Severity } from '../types.js';

interface PortInfo {
  port: number;
  protocol: string;
  listening: boolean;
  process?: string;
  severity: Severity;
  expected?: boolean;
}

interface PortCheckResult {
  timestamp: string;
  overallSeverity: Severity;
  summary: string;
  ports: PortInfo[];
}

function worstSeverity(...severities: Severity[]): Severity {
  if (severities.includes('critical')) return 'critical';
  if (severities.includes('warning')) return 'warning';
  if (severities.includes('unknown')) return 'unknown';
  return 'ok';
}

export async function handlePortCheck(input: {
  ports: number[] | 'manifest';
  protocol?: 'tcp' | 'udp' | 'both';
}): Promise<PortCheckResult> {
  try {
    const listeners = await getPortListeners();
    const manifest = await loadManifest();

    let portsToCheck: number[];

    if (input.ports === 'manifest') {
      // Gather expected ports from systemd services and docker containers
      const servicePorts = manifest.services.systemd.map((s) => s.port).filter((p): p is number => p != null);
      const dockerPorts = manifest.services.docker.flatMap((d) => {
        if (!Array.isArray(d.ports)) return [];
        return d.ports
          .map((p) => {
            if (typeof p === 'string') {
              const match = p.match(/(\d+):/);
              return match ? Number.parseInt(match[1], 10) : null;
            }
            return p.host;
          })
          .filter((p): p is number => p != null);
      });
      portsToCheck = [...new Set([...servicePorts, ...dockerPorts])];
    } else {
      portsToCheck = input.ports;
    }

    const listenerMap = new Map(listeners.map((l) => [l.localPort, l]));

    const portInfos: PortInfo[] = portsToCheck.map((port) => {
      const listener = listenerMap.get(port);
      const isListening = !!listener;
      const severity: Severity = isListening ? 'ok' : 'critical';

      return {
        port,
        protocol: input.protocol ?? 'tcp',
        listening: isListening,
        process: listener?.process,
        severity,
        expected: true,
      };
    });

    const overallSeverity = portInfos.length > 0 ? worstSeverity(...portInfos.map((p) => p.severity)) : 'ok';

    const notListening = portInfos.filter((p) => !p.listening).length;
    const summary =
      notListening === 0
        ? `All ${portInfos.length} expected ports are listening`
        : `${notListening}/${portInfos.length} expected ports are NOT listening`;

    return {
      timestamp: new Date().toISOString(),
      overallSeverity,
      summary,
      ports: portInfos,
    };
  } catch (err) {
    return {
      timestamp: new Date().toISOString(),
      overallSeverity: 'unknown',
      summary: err instanceof Error ? err.message : String(err),
      ports: [],
    };
  }
}
