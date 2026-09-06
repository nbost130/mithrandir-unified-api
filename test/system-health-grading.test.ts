import { describe, expect, it } from 'vitest';
import type { SystemHealth } from '../src/modules/tirith/commands/system.js';
import { gradeSystemHealth } from '../src/modules/tirith/tools/system-health.js';

function snapshot(overrides: { cpu?: number; mem?: number; disk?: number; load5m?: number }): SystemHealth {
  return {
    cpu: { usagePercent: overrides.cpu ?? 12, cores: 8, model: 'test' },
    memory: { totalBytes: 32e9, freeBytes: 14e9, usedBytes: 18e9, usagePercent: overrides.mem ?? 57 },
    disk: {
      filesystem: '/dev/root',
      totalFormatted: '129G',
      usedFormatted: '97G',
      availableFormatted: '31G',
      usagePercent: overrides.disk ?? 75,
      mountPoint: '/',
    },
    loadAvg: { avg1m: 1, avg5m: overrides.load5m ?? 1, avg15m: 1, cpuCores: 8 },
    uptime: { seconds: 1, formatted: '1s', bootTime: '2026-07-29T01:14:21.372Z' },
  };
}

describe('gradeSystemHealth', () => {
  it('grades an idle box ok', () => {
    const graded = gradeSystemHealth(snapshot({}));
    expect(graded.overallSeverity).toBe('ok');
    expect(graded.summary).toBe('All system metrics within normal range');
  });

  it('two Whisper workers (CPU 100%, 5-min load 1.25/core) are a warning, never critical', () => {
    // Measured 2026-09-06 17:28 EDT: CPU 100% with load 10.04 on 8 cores paged the Kuma monitor.
    const graded = gradeSystemHealth(snapshot({ cpu: 100, load5m: 10.04 }));
    expect(graded.cpu.severity).toBe('warning');
    expect(graded.cpu.assessment).toMatch(/saturated/);
    expect(graded.loadAverage.severity).toBe('ok');
    expect(graded.overallSeverity).toBe('warning');
    expect(graded.summary).toBe('System health warning: CPU 100%');
  });

  it('CPU between warn and crit is still a plain warning', () => {
    const graded = gradeSystemHealth(snapshot({ cpu: 96 }));
    expect(graded.cpu.severity).toBe('warning');
    expect(graded.cpu.assessment).toMatch(/above warning threshold/);
    expect(graded.overallSeverity).toBe('warning');
  });

  it('a pegged CPU that is also queueing (load 4+/core) is critical via load', () => {
    const graded = gradeSystemHealth(snapshot({ cpu: 100, load5m: 40 }));
    expect(graded.loadAverage.severity).toBe('critical');
    expect(graded.overallSeverity).toBe('critical');
    expect(graded.summary).toBe('System health critical: CPU 100%, load 5.00/core (5m)');
  });

  it('memory pressure still grades critical on its own (the 2026-09-04 OOM)', () => {
    const graded = gradeSystemHealth(snapshot({ mem: 96 }));
    expect(graded.memory.severity).toBe('critical');
    expect(graded.overallSeverity).toBe('critical');
    expect(graded.summary).toBe('System health critical: memory 96% used');
  });

  it('a full disk still grades critical on its own', () => {
    const graded = gradeSystemHealth(snapshot({ disk: 93 }));
    expect(graded.overallSeverity).toBe('critical');
    expect(graded.summary).toBe('System health critical: disk 93% full');
  });
});
