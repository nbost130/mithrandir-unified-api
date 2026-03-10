import { getSystemHealth } from '../commands/system.js';
import type { HealthSnapshot, MetricWithContext, Severity } from '../types.js';

function assessSeverity(value: number, warnThreshold: number, critThreshold: number): Severity {
  if (value >= critThreshold) return 'critical';
  if (value >= warnThreshold) return 'warning';
  return 'ok';
}

function worstSeverity(...severities: Severity[]): Severity {
  if (severities.includes('critical')) return 'critical';
  if (severities.includes('warning')) return 'warning';
  if (severities.includes('unknown')) return 'unknown';
  return 'ok';
}

function makeMetric(value: number, unit: string, warnThreshold: number, critThreshold: number): MetricWithContext {
  const severity = assessSeverity(value, warnThreshold, critThreshold);
  let assessment: string;
  if (severity === 'critical') assessment = `${value}${unit} exceeds critical threshold (${critThreshold}${unit})`;
  else if (severity === 'warning') assessment = `${value}${unit} above warning threshold (${warnThreshold}${unit})`;
  else assessment = `${value}${unit} within normal range`;

  return { value, unit, warningThreshold: warnThreshold, criticalThreshold: critThreshold, severity, assessment };
}

export async function handleSystemHealth(): Promise<HealthSnapshot> {
  try {
    const health = await getSystemHealth();

    const cpuMetric = makeMetric(health.cpu.usagePercent, '%', 70, 90);
    const memMetric = makeMetric(health.memory.usagePercent, '%', 80, 95);
    const diskMetric = makeMetric(health.disk.usagePercent, '%', 80, 90);

    const loadPerCore =
      health.loadAvg.cpuCores > 0 ? health.loadAvg.avg1m / health.loadAvg.cpuCores : health.loadAvg.avg1m;
    const loadSeverity = assessSeverity(loadPerCore, 1.5, 2.0);
    const loadAssessment =
      loadSeverity === 'ok'
        ? `Load ${health.loadAvg.avg1m} across ${health.loadAvg.cpuCores} cores — normal`
        : `Load ${health.loadAvg.avg1m} across ${health.loadAvg.cpuCores} cores — elevated`;

    const overallSeverity = worstSeverity(cpuMetric.severity, memMetric.severity, diskMetric.severity, loadSeverity);

    const summary =
      overallSeverity === 'ok'
        ? 'All system metrics within normal range'
        : `System health ${overallSeverity}: CPU ${health.cpu.usagePercent}%, Mem ${health.memory.usagePercent}%, Disk ${health.disk.usagePercent}%`;

    return {
      timestamp: new Date().toISOString(),
      overallSeverity,
      summary,
      cpu: cpuMetric,
      memory: {
        ...memMetric,
        totalBytes: health.memory.totalBytes,
        availableBytes: health.memory.freeBytes,
      },
      disk: {
        ...diskMetric,
        totalFormatted: health.disk.totalFormatted,
        availableFormatted: health.disk.availableFormatted,
      },
      loadAverage: {
        avg1m: health.loadAvg.avg1m,
        avg5m: health.loadAvg.avg5m,
        avg15m: health.loadAvg.avg15m,
        cpuCores: health.loadAvg.cpuCores,
        severity: loadSeverity,
        assessment: loadAssessment,
      },
      uptime: {
        seconds: health.uptime.seconds,
        formatted: health.uptime.formatted,
        bootTime: health.uptime.bootTime,
      },
    };
  } catch (err) {
    return {
      timestamp: new Date().toISOString(),
      overallSeverity: 'unknown',
      summary: err instanceof Error ? err.message : String(err),
      cpu: {
        value: 0,
        unit: '%',
        warningThreshold: 70,
        criticalThreshold: 90,
        severity: 'unknown',
        assessment: 'Unable to read CPU metrics',
      },
      memory: {
        value: 0,
        unit: '%',
        warningThreshold: 80,
        criticalThreshold: 95,
        severity: 'unknown',
        assessment: 'Unable to read memory metrics',
        totalBytes: 0,
        availableBytes: 0,
      },
      disk: {
        value: 0,
        unit: '%',
        warningThreshold: 80,
        criticalThreshold: 90,
        severity: 'unknown',
        assessment: 'Unable to read disk metrics',
        totalFormatted: '0',
        availableFormatted: '0',
      },
      loadAverage: {
        avg1m: 0,
        avg5m: 0,
        avg15m: 0,
        cpuCores: 0,
        severity: 'unknown',
        assessment: 'Unable to read load metrics',
      },
      uptime: { seconds: 0, formatted: '0m', bootTime: new Date().toISOString() },
    };
  }
}
