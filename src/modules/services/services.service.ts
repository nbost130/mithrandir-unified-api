// src/modules/services/services.service.ts

import axios from 'axios';
import type { RegisteredService, ServiceDetails, ServicesHealthResponse } from './services.types';

/**
 * @fileoverview Business logic for the services module.
 */

/**
 * Get the list of registered services.
 * In a real application, this data would come from a service registry
 * or a configuration file.
 */
export async function getRegisteredServices(): Promise<RegisteredService[]> {
  return [
    {
      id: 'transcription-palantir',
      name: 'Transcription Palantir',
      type: 'api',
      healthEndpoint: 'http://100.77.230.53:9003/health',
      registeredAt: new Date().toISOString(),
      metadata: {
        description: 'Manages transcription jobs',
      },
    },
  ];
}

/**
 * Check the health of a single service by calling its health endpoint.
 * @param service - The registered service to check
 * @returns ServiceDetails with health status
 */
export async function checkServiceHealth(service: RegisteredService): Promise<ServiceDetails> {
  const startTime = Date.now();
  const url = new URL(service.healthEndpoint);

  try {
    const response = await axios.get(service.healthEndpoint, {
      timeout: 5000, // 5 second timeout
      validateStatus: (status) => status < 500, // Accept 4xx as valid responses
    });

    const latency = Date.now() - startTime;
    const isHealthy = response.status === 200 && response.data?.status === 'healthy';

    return {
      name: service.name,
      identifier: service.id,
      status: isHealthy ? 'healthy' : 'unhealthy',
      url: url.hostname,
      port: Number.parseInt(url.port) || 80,
      uptime: response.data?.uptime,
      version: response.data?.version,
      details: {
        latency,
        statusCode: response.status,
        checks: response.data?.checks,
      },
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      name: service.name,
      identifier: service.id,
      status: 'unhealthy',
      url: url.hostname,
      port: Number.parseInt(url.port) || 80,
      error: errorMessage,
      details: {
        latency,
        errorType: axios.isAxiosError(error) ? error.code : 'UNKNOWN',
      },
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Get health status for all registered services.
 * @returns ServicesHealthResponse with all service health details and summary
 */
export async function getServicesHealth(): Promise<ServicesHealthResponse> {
  const registeredServices = await getRegisteredServices();

  // Check health of all services in parallel
  const healthChecks = await Promise.all(registeredServices.map((service) => checkServiceHealth(service)));

  // Calculate summary statistics
  const total = healthChecks.length;
  const healthy = healthChecks.filter((s) => s.status === 'healthy').length;
  const unhealthy = total - healthy;
  const healthPercentage = total > 0 ? Math.round((healthy / total) * 100) : 0;

  return {
    services: healthChecks,
    summary: {
      total,
      healthy,
      unhealthy,
      healthPercentage,
    },
  };
}

/**
 * Restart a service by its ID using systemd.
 * Implements Story 2.3-Backend: Service Restart with systemd integration.
 *
 * @param serviceId - The ID of the service to restart
 * @throws Error if service ID is not found or not allowed
 */
export async function restartService(serviceId: string): Promise<void> {
  const registeredServices = await getRegisteredServices();
  const service = registeredServices.find((s) => s.id === serviceId);

  if (!service) {
    throw new Error(`Service not found: ${serviceId}`);
  }

  // For simple restart without progress streaming, use systemctl directly
  const { validateServiceId } = await import('./systemd.js');
  const serviceName = validateServiceId(serviceId);

  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);

  await execAsync(`systemctl restart ${serviceName}`);
}

/**
 * Get the current state of a service.
 * @param serviceId - The ID of the service
 * @returns The current service state
 */
export async function getServiceStatus(serviceId: string) {
  const { getServiceState } = await import('./systemd.js');
  return getServiceState(serviceId);
}

/**
 * Get journal logs for a service.
 * @param serviceId - The ID of the service
 * @param lines - Number of lines to retrieve (default: 50)
 * @returns Array of log lines
 */
export async function getServiceLogs(serviceId: string, lines = 50): Promise<string[]> {
  const { getJournalLogs } = await import('./systemd.js');
  return getJournalLogs(serviceId, lines);
}
