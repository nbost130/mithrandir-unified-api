// src/modules/services/services.types.ts

/**
 * @fileoverview Type definitions for the services module.
 */

export interface RegisteredService {
  id: string;
  name: string;
  type: string;
  healthEndpoint: string;
  registeredAt: string;
  metadata?: Record<string, unknown>;
}

export interface ServiceDetails {
  name: string;
  identifier: string;
  status: 'healthy' | 'unhealthy';
  url: string;
  port: number;
  uptime?: number;
  version?: string;
  error?: string;
  details?: Record<string, unknown>;
  lastChecked: string;
}

export interface ServicesSummary {
  total: number;
  healthy: number;
  unhealthy: number;
  healthPercentage: number;
}

export interface ServicesHealthResponse {
  services: ServiceDetails[];
  summary: ServicesSummary;
}
