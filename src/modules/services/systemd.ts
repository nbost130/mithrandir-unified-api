// src/modules/services/systemd.ts
/**
 * @fileoverview systemd integration for service management.
 * Provides functions to restart services via systemctl and retrieve journal logs.
 *
 * Story 2.3-Backend: Service Restart Backend Implementation
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// Configuration constants
const HEALTH_CHECK_POLL_INTERVAL_MS = 500; // Poll every 500ms
const HEALTH_CHECK_MAX_ATTEMPTS = 10; // Max 5 seconds (500ms * 10)
const HEALTH_CHECK_TIMEOUT_MS = 5000; // Overall timeout
const JOURNAL_LOG_LINES_DEFAULT = 50;
const DASHBOARD_RESTART_DELAY_MS = 500;
const COUNTDOWN_INTERVAL_MS = 1000;

// Whitelist of allowed services to prevent command injection
const ALLOWED_SERVICES: Record<string, string> = {
  'transcription-palantir': 'transcription-palantir.service',
  'mithrandir-unified-api': 'mithrandir-unified-api.service',
  'mithrandir-admin': 'mithrandir-admin.service',
};

export type RestartPhase = 'stopping' | 'starting' | 'health-check' | 'success' | 'error';

export interface ServiceState {
  status: 'running' | 'stopped' | 'failed' | 'unknown';
  uptime?: number;
  pid?: number;
  activeState?: string;
}

export interface RestartProgress {
  phase: RestartPhase;
  service: string;
  timestamp: string;
  message: string;
  logs?: string[];
  beforeState?: ServiceState;
  afterState?: ServiceState;
  journalLogs?: string[];
  error?: string;
}

/**
 * Validates that a service ID is in the allowed whitelist.
 * Prevents command injection attacks.
 */
export function validateServiceId(serviceId: string): string {
  const serviceName = ALLOWED_SERVICES[serviceId];
  if (!serviceName) {
    throw new Error(`Service not allowed: ${serviceId}. Allowed services: ${Object.keys(ALLOWED_SERVICES).join(', ')}`);
  }
  return serviceName;
}

/**
 * Gets the current state of a systemd service.
 */
export async function getServiceState(serviceId: string): Promise<ServiceState> {
  const serviceName = validateServiceId(serviceId);

  try {
    const { stdout } = await execAsync(
      `systemctl show ${serviceName} --property=ActiveState,MainPID,ExecMainStartTimestamp --no-pager`
    );

    const props: Record<string, string> = {};
    for (const line of stdout.trim().split('\n')) {
      const [key, value] = line.split('=', 2);
      if (key && value !== undefined) {
        props[key] = value;
      }
    }

    let status: ServiceState['status'] = 'unknown';
    const activeState = props.ActiveState;
    if (activeState === 'active') status = 'running';
    else if (activeState === 'inactive') status = 'stopped';
    else if (activeState === 'failed') status = 'failed';

    const pid = Number.parseInt(props.MainPID || '0', 10);
    let uptime: number | undefined;

    if (props.ExecMainStartTimestamp && props.ExecMainStartTimestamp !== '') {
      const startTime = new Date(props.ExecMainStartTimestamp);
      if (!Number.isNaN(startTime.getTime())) {
        uptime = Math.floor((Date.now() - startTime.getTime()) / 1000);
      }
    }

    return {
      status,
      pid: pid > 0 ? pid : undefined,
      uptime,
      activeState,
    };
  } catch (error) {
    return {
      status: 'unknown',
      activeState: 'error',
    };
  }
}

/**
 * Stops a systemd service.
 */
export async function stopService(serviceId: string): Promise<void> {
  const serviceName = validateServiceId(serviceId);
  await execAsync(`systemctl stop ${serviceName}`);
}

/**
 * Starts a systemd service.
 */
export async function startService(serviceId: string): Promise<void> {
  const serviceName = validateServiceId(serviceId);
  await execAsync(`systemctl start ${serviceName}`);
}

/**
 * Retrieves the last N lines from the systemd journal for a service.
 */
export async function getJournalLogs(serviceId: string, lines = JOURNAL_LOG_LINES_DEFAULT): Promise<string[]> {
  const serviceName = validateServiceId(serviceId);

  try {
    const { stdout } = await execAsync(`journalctl -u ${serviceName} -n ${lines} --no-pager --output=short`);
    return stdout.trim().split('\n').filter(Boolean);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to retrieve journal logs for ${serviceName}: ${errorMessage}`);
    return [`Failed to retrieve journal logs: ${errorMessage}`];
  }
}

/**
 * Polls for a service to reach a healthy (running) state.
 * Replaces fixed delay with active polling for more reliable health checks.
 */
async function pollForHealthyState(serviceId: string, serviceName: string): Promise<ServiceState> {
  const startTime = Date.now();
  let attempts = 0;

  while (attempts < HEALTH_CHECK_MAX_ATTEMPTS) {
    const state = await getServiceState(serviceId);

    if (state.status === 'running') {
      console.log(`Service ${serviceName} is healthy after ${attempts + 1} attempts (${Date.now() - startTime}ms)`);
      return state;
    }

    if (state.status === 'failed') {
      console.warn(`Service ${serviceName} entered failed state during health check`);
      return state;
    }

    // Check if we've exceeded overall timeout
    if (Date.now() - startTime > HEALTH_CHECK_TIMEOUT_MS) {
      console.warn(`Health check timeout for ${serviceName} after ${Date.now() - startTime}ms`);
      return state;
    }

    attempts++;
    await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_POLL_INTERVAL_MS));
  }

  // Max attempts reached, return current state
  const finalState = await getServiceState(serviceId);
  console.warn(`Health check max attempts reached for ${serviceName}, final status: ${finalState.status}`);
  return finalState;
}

/**
 * Performs a full restart of a service with phase tracking.
 * Returns a generator that yields progress updates.
 */
export async function* restartServiceWithProgress(serviceId: string): AsyncGenerator<RestartProgress> {
  const serviceName = validateServiceId(serviceId);

  // Capture before state
  const beforeState = await getServiceState(serviceId);
  yield {
    phase: 'stopping',
    service: serviceId,
    timestamp: new Date().toISOString(),
    message: `Stopping ${serviceName}...`,
    beforeState,
  };

  try {
    // Stop the service
    await stopService(serviceId);

    yield {
      phase: 'starting',
      service: serviceId,
      timestamp: new Date().toISOString(),
      message: `Starting ${serviceName}...`,
    };

    // Start the service
    await startService(serviceId);

    yield {
      phase: 'health-check',
      service: serviceId,
      timestamp: new Date().toISOString(),
      message: `Performing health check for ${serviceName}...`,
    };

    // Poll for service to become healthy instead of fixed delay
    const afterState = await pollForHealthyState(serviceId, serviceName);

    if (afterState.status === 'running') {
      yield {
        phase: 'success',
        service: serviceId,
        timestamp: new Date().toISOString(),
        message: `${serviceName} restarted successfully`,
        beforeState,
        afterState,
      };
    } else {
      const journalLogs = await getJournalLogs(serviceId);
      yield {
        phase: 'error',
        service: serviceId,
        timestamp: new Date().toISOString(),
        message: `${serviceName} failed to start. Status: ${afterState.status}`,
        beforeState,
        afterState,
        journalLogs,
        error: `Service ended in ${afterState.status} state`,
      };
    }
  } catch (error) {
    const journalLogs = await getJournalLogs(serviceId);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    yield {
      phase: 'error',
      service: serviceId,
      timestamp: new Date().toISOString(),
      message: `Failed to restart ${serviceName}: ${errorMessage}`,
      beforeState,
      journalLogs,
      error: errorMessage,
    };
  }
}

/**
 * Special handling for dashboard self-restart.
 * Returns progress updates and then triggers the actual restart with a delay.
 */
export async function* restartDashboardWithDelay(delaySeconds = 5): AsyncGenerator<RestartProgress> {
  const serviceId = 'mithrandir-admin';

  for (let countdown = delaySeconds; countdown > 0; countdown--) {
    yield {
      phase: 'stopping',
      service: serviceId,
      timestamp: new Date().toISOString(),
      message: `Dashboard restarting in ${countdown}s...`,
    };
    await new Promise((resolve) => setTimeout(resolve, COUNTDOWN_INTERVAL_MS));
  }

  // Trigger the restart - this will terminate the current process
  try {
    yield {
      phase: 'starting',
      service: serviceId,
      timestamp: new Date().toISOString(),
      message: 'Restarting dashboard now...',
    };

    // Give time for the SSE response to be sent
    setTimeout(async () => {
      await execAsync('systemctl restart mithrandir-admin.service');
    }, DASHBOARD_RESTART_DELAY_MS);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    yield {
      phase: 'error',
      service: serviceId,
      timestamp: new Date().toISOString(),
      message: `Failed to restart dashboard: ${errorMessage}`,
      error: errorMessage,
    };
  }
}
