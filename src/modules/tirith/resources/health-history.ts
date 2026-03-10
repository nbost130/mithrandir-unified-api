import type { MetricsStore } from '../metrics-store.js';
import type { HealthSnapshot } from '../types.js';

interface HistoryStats {
  cpu: { min: number; max: number; avg: number; p95: number };
  memory: { min: number; max: number; avg: number; p95: number };
  disk: { min: number; max: number; avg: number; p95: number };
}

interface HealthHistoryResult {
  timeRange: { start: string; end: string };
  intervalSeconds: number;
  dataPoints: number;
  series: Array<{
    timestamp: string;
    cpu: number;
    memory: number;
    disk: number;
    loadPerCore: number;
    severity: string;
  }>;
  stats: HistoryStats;
}

function computeStats(values: number[]): {
  min: number;
  max: number;
  avg: number;
  p95: number;
} {
  if (values.length === 0) return { min: 0, max: 0, avg: 0, p95: 0 };

  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const avg = Math.round((sorted.reduce((sum, v) => sum + v, 0) / sorted.length) * 100) / 100;
  const p95Index = Math.ceil(sorted.length * 0.95) - 1;
  const p95 = sorted[Math.max(0, p95Index)] ?? 0;

  return { min, max, avg, p95 };
}

export async function handleHealthHistory(store: MetricsStore): Promise<HealthHistoryResult> {
  try {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const snapshots: HealthSnapshot[] = await store.getHistory(oneDayAgo, now);

    if (snapshots.length === 0) {
      return {
        timeRange: {
          start: new Date().toISOString(),
          end: new Date().toISOString(),
        },
        intervalSeconds: 0,
        dataPoints: 0,
        series: [],
        stats: {
          cpu: { min: 0, max: 0, avg: 0, p95: 0 },
          memory: { min: 0, max: 0, avg: 0, p95: 0 },
          disk: { min: 0, max: 0, avg: 0, p95: 0 },
        },
      };
    }

    const series = snapshots.map((s) => {
      const loadPerCore =
        s.loadAverage.cpuCores > 0
          ? Math.round((s.loadAverage.avg1m / s.loadAverage.cpuCores) * 100) / 100
          : s.loadAverage.avg1m;

      return {
        timestamp: s.timestamp,
        cpu: s.cpu.value,
        memory: s.memory.value,
        disk: s.disk.value,
        loadPerCore,
        severity: s.overallSeverity,
      };
    });

    const cpuValues = snapshots.map((s) => s.cpu.value);
    const memValues = snapshots.map((s) => s.memory.value);
    const diskValues = snapshots.map((s) => s.disk.value);

    let intervalSeconds = 0;
    if (snapshots.length >= 2) {
      const first = new Date(snapshots[0]!.timestamp).getTime();
      const last = new Date(snapshots[snapshots.length - 1]!.timestamp).getTime();
      intervalSeconds = Math.round((last - first) / ((snapshots.length - 1) * 1000));
    }

    return {
      timeRange: {
        start: snapshots[0]!.timestamp,
        end: snapshots[snapshots.length - 1]!.timestamp,
      },
      intervalSeconds,
      dataPoints: snapshots.length,
      series,
      stats: {
        cpu: computeStats(cpuValues),
        memory: computeStats(memValues),
        disk: computeStats(diskValues),
      },
    };
  } catch {
    return {
      timeRange: {
        start: new Date().toISOString(),
        end: new Date().toISOString(),
      },
      intervalSeconds: 0,
      dataPoints: 0,
      series: [],
      stats: {
        cpu: { min: 0, max: 0, avg: 0, p95: 0 },
        memory: { min: 0, max: 0, avg: 0, p95: 0 },
        disk: { min: 0, max: 0, avg: 0, p95: 0 },
      },
    };
  }
}
