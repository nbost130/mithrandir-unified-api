import { getSystemHealth } from '../commands/system.js';
import type { HealthSnapshot, MetricWithContext, Severity } from '../types.js';

/** CPU is a 1-second delta sample (see computeCpuUsage); only a pegged box is actionable. */
const CPU_WARN = 95;
const CPU_CRIT = 99;
/** Percent of RAM not available (MemAvailable-based). 85% used = 4.5 GB headroom on 30 GB. */
const MEM_WARN = 85;
const MEM_CRIT = 95;
const DISK_WARN = 85;
const DISK_CRIT = 92;
/** 5-minute load average per core. Two Whisper jobs sit near 1.5; 2.0 means real queueing. */
const LOAD_PER_CORE_WARN = 2.0;
const LOAD_PER_CORE_CRIT = 4.0;

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

    // Thresholds are set ABOVE what this box does on purpose. Two Whisper
    // transcriptions run ~3.3 cores each on 8 cores (load ~12, CPU ~80%) for
    // 10+ minutes at a time; the old 70% CPU / 1.5 load-per-core (1-min)
    // thresholds graded that as 'warning' and paged on every job
    // (2026-09-06: 41 flaps in 24 h). What IS actionable here: memory
    // pressure (the 2026-09-04 OOM), a full disk, and runaway load that
    // outlasts the 5-minute average.
    const cpuMetric = makeMetric(health.cpu.usagePercent, '%', CPU_WARN, CPU_CRIT);
    const memMetric = makeMetric(health.memory.usagePercent, '%', MEM_WARN, MEM_CRIT);
    const diskMetric = makeMetric(health.disk.usagePercent, '%', DISK_WARN, DISK_CRIT);

    const loadPerCore =
      health.loadAvg.cpuCores > 0 ? health.loadAvg.avg5m / health.loadAvg.cpuCores : health.loadAvg.avg5m;
    const loadSeverity = assessSeverity(loadPerCore, LOAD_PER_CORE_WARN, LOAD_PER_CORE_CRIT);
    const loadAssessment =
      loadSeverity === 'ok'
        ? `5-min load ${health.loadAvg.avg5m} across ${health.loadAvg.cpuCores} cores — normal`
        : `5-min load ${health.loadAvg.avg5m} across ${health.loadAvg.cpuCores} cores (${loadPerCore.toFixed(2)}/core, warn ${LOAD_PER_CORE_WARN}, crit ${LOAD_PER_CORE_CRIT}) — elevated`;

    const overallSeverity = worstSeverity(cpuMetric.severity, memMetric.severity, diskMetric.severity, loadSeverity);

    // Name the offending metric(s) so the alert says what to look at.
    const offenders = [
      cpuMetric.severity !== 'ok' ? `CPU ${health.cpu.usagePercent}%` : null,
      memMetric.severity !== 'ok' ? `memory ${health.memory.usagePercent}% used` : null,
      diskMetric.severity !== 'ok' ? `disk ${health.disk.usagePercent}% full` : null,
      loadSeverity !== 'ok' ? `load ${loadPerCore.toFixed(2)}/core (5m)` : null,
    ].filter((x): x is string => x !== null);
    const summary =
      overallSeverity === 'ok'
        ? 'All system metrics within normal range'
        : `System health ${overallSeverity}: ${offenders.join(', ')}`;

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
        warningThreshold: CPU_WARN,
        criticalThreshold: CPU_CRIT,
        severity: 'unknown',
        assessment: 'Unable to read CPU metrics',
      },
      memory: {
        value: 0,
        unit: '%',
        warningThreshold: MEM_WARN,
        criticalThreshold: MEM_CRIT,
        severity: 'unknown',
        assessment: 'Unable to read memory metrics',
        totalBytes: 0,
        availableBytes: 0,
      },
      disk: {
        value: 0,
        unit: '%',
        warningThreshold: DISK_WARN,
        criticalThreshold: DISK_CRIT,
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
