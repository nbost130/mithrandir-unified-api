import type { MetricsStore } from '../metrics-store.js';
import { handleSystemHealth } from '../tools/system-health.js';

interface HealthCurrentResult {
  timestamp: string;
  source: 'cache' | 'live';
  cpu: number;
  memory: number;
  disk: number;
  loadPerCore: number;
  severity: string;
  uptimeHours: number;
}

export async function handleHealthCurrent(store: MetricsStore): Promise<HealthCurrentResult> {
  try {
    const cached = await store.getCurrentSnapshot();

    if (cached) {
      const loadPerCore =
        cached.loadAverage.cpuCores > 0
          ? Math.round((cached.loadAverage.avg1m / cached.loadAverage.cpuCores) * 100) / 100
          : cached.loadAverage.avg1m;

      return {
        timestamp: cached.timestamp,
        source: 'cache',
        cpu: cached.cpu.value,
        memory: cached.memory.value,
        disk: cached.disk.value,
        loadPerCore,
        severity: cached.overallSeverity,
        uptimeHours: Math.round((cached.uptime.seconds / 3600) * 10) / 10,
      };
    }

    const live = await handleSystemHealth();
    const loadPerCore =
      live.loadAverage.cpuCores > 0
        ? Math.round((live.loadAverage.avg1m / live.loadAverage.cpuCores) * 100) / 100
        : live.loadAverage.avg1m;

    return {
      timestamp: live.timestamp,
      source: 'live',
      cpu: live.cpu.value,
      memory: live.memory.value,
      disk: live.disk.value,
      loadPerCore,
      severity: live.overallSeverity,
      uptimeHours: Math.round((live.uptime.seconds / 3600) * 10) / 10,
    };
  } catch {
    return {
      timestamp: new Date().toISOString(),
      source: 'live',
      cpu: 0,
      memory: 0,
      disk: 0,
      loadPerCore: 0,
      severity: 'unknown',
      uptimeHours: 0,
    };
  }
}
