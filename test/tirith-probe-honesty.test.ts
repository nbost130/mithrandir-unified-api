import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Probe honesty regression tests.
 *
 * The bug these lock down: a FAILED MEASUREMENT was being reported as a
 * measured state. `getServiceState()` ignored `runCommand`'s exitCode and
 * parsed whatever stdout existed, so an unreachable systemd produced
 * activeState:'unknown' — which the caller then graded 'critical'. Four
 * healthy services were reported critical for months because of it.
 *
 * The contract now: a probe that could not measure MUST throw. Callers
 * distinguish "I know it is bad" from "I could not look".
 */

const runCommand = vi.fn();

vi.mock('../src/modules/tirith/commands/registry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/tirith/commands/registry.js')>();
  return { ...actual, runCommand };
});

const { getServiceState } = await import('../src/modules/tirith/commands/systemd.js');

beforeEach(() => {
  runCommand.mockReset();
});

describe('getServiceState — failed probes must throw, not fabricate state', () => {
  it('throws when systemctl fails with no output (the --user environment bug)', async () => {
    runCommand.mockResolvedValue({
      stdout: '',
      stderr: 'Failed to connect to bus: No medium found',
      exitCode: 1,
    });

    await expect(getServiceState('ithildin')).rejects.toThrow(/failed \(exit 1\)/);
    await expect(getServiceState('ithildin')).rejects.toThrow(/No medium found/);
  });

  it('surfaces the --user scope in the error so the cause is diagnosable', async () => {
    runCommand.mockResolvedValue({ stdout: '', stderr: 'boom', exitCode: 1 });
    await expect(getServiceState('ithildin')).rejects.toThrow(/--user/);
  });

  it('throws when output parses to an empty prop bag', async () => {
    runCommand.mockResolvedValue({ stdout: 'garbage without equals signs\n', stderr: '', exitCode: 0 });
    await expect(getServiceState('n8n')).rejects.toThrow(/no LoadState/);
  });

  it('does NOT throw for a genuinely absent unit — not-found is a real answer', async () => {
    // systemctl exits 0 for an unknown unit and truthfully reports not-found.
    // This is the redis case: correct measurement, wrong unit name.
    runCommand.mockResolvedValue({
      stdout: [
        'ActiveState=inactive',
        'SubState=dead',
        'LoadState=not-found',
        'MainPID=0',
        'Description=redis.service',
      ].join('\n'),
      stderr: '',
      exitCode: 0,
    });

    const state = await getServiceState('redis');
    expect(state.loadState).toBe('not-found');
    expect(state.activeState).toBe('inactive');
  });

  it('returns real state for a healthy unit', async () => {
    runCommand.mockResolvedValue({
      stdout: [
        'ActiveState=active',
        'SubState=running',
        'LoadState=loaded',
        'MainPID=4242',
        'Description=n8n workflow automation',
      ].join('\n'),
      stderr: '',
      exitCode: 0,
    });

    const state = await getServiceState('n8n');
    expect(state.activeState).toBe('active');
    expect(state.pid).toBe(4242);
    expect(state.description).toBe('n8n workflow automation');
  });

  it('tolerates a non-zero exit that still produced usable output', async () => {
    runCommand.mockResolvedValue({
      stdout: 'ActiveState=failed\nSubState=failed\nLoadState=loaded\nMainPID=0\n',
      stderr: 'warning noise',
      exitCode: 3,
    });

    const state = await getServiceState('n8n');
    expect(state.activeState).toBe('failed');
  });
});

describe('false negatives — a failed probe must never read as all-clear', () => {
  it('getContainers throws rather than reporting an empty container list', async () => {
    const { getContainers } = await import('../src/modules/tirith/commands/docker.js');
    runCommand.mockResolvedValue({ stdout: '', stderr: 'Cannot connect to the Docker daemon', exitCode: 1 });

    await expect(getContainers()).rejects.toThrow(/docker ps failed/);
    await expect(getContainers()).rejects.toThrow(/not empty/);
  });

  it('getPortListeners throws rather than reporting zero listeners', async () => {
    // Returning [] here marked EVERY manifest port critical — one failure, N alarms.
    const { getPortListeners } = await import('../src/modules/tirith/commands/network.js');
    runCommand.mockResolvedValue({ stdout: '', stderr: 'ss: command not found', exitCode: 127 });

    await expect(getPortListeners()).rejects.toThrow(/ss -tlnp failed/);
  });

  it('getContainers still parses a healthy docker ps', async () => {
    const { getContainers } = await import('../src/modules/tirith/commands/docker.js');
    runCommand.mockResolvedValue({
      stdout: JSON.stringify({
        ID: 'abc',
        Names: 'grafana',
        Image: 'grafana/grafana',
        State: 'running',
        Status: 'Up 13 days',
      }),
      stderr: '',
      exitCode: 0,
    });

    const containers = await getContainers();
    expect(containers).toHaveLength(1);
    expect(containers[0].name).toBe('grafana');
  });
});
