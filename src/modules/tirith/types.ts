// src/modules/tirith/types.ts
/**
 * @fileoverview Core shared types for the Tirith monitoring module.
 * These types are the foundation — only what other files need to import.
 */

export type Severity = 'ok' | 'warning' | 'critical' | 'unknown';

export interface MetricWithContext {
  value: number;
  unit: string;
  warningThreshold: number;
  criticalThreshold: number;
  severity: Severity;
  assessment: string;
}

export interface DriftItem {
  dimension: string;
  entity: string;
  expected: string;
  actual: string;
  severity: Severity;
  recommendation: string;
}

export interface ToolError {
  error: true;
  code: 'TIMEOUT' | 'PERMISSION_DENIED' | 'NOT_FOUND' | 'INTERNAL' | 'UNAVAILABLE';
  message: string;
  partialData?: Record<string, unknown>;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Estate manifest types

export interface ManifestService {
  name: string;
  scope: 'user' | 'system';
  description: string;
  severity: 'critical' | 'warning' | 'info';
  expected_state: string;
  port: number | null;
  health_check?: {
    type: 'http' | 'tcp' | 'command';
    target: string;
    expected_status?: number;
    timeout_ms: number;
  };
  restart_command: string;
  depends_on: string[];
  group: string;
  tags: string[];
  notes?: string;
}

export interface ManifestDocker {
  name: string;
  image: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  expected_state: string;
  ports: string[] | Array<{ host: number; container: number }>;
  compose_file?: string | null;
  compose_project?: string;
  health_check?: {
    type: 'http';
    target: string;
    expected_status: number;
    timeout_ms: number;
  };
  restart_command: string;
  depends_on: string[];
  group: string;
  tags: string[];
  notes?: string;
}

export interface ManifestCron {
  name: string;
  schedule: string;
  command: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  user: string;
  group: string;
  tags: string[];
}

export interface ManifestEndpoint {
  name: string;
  url: string;
  expected_status: number;
  severity: 'critical' | 'warning' | 'info';
  check_interval_s: number;
  timeout_ms: number;
  group: string;
  depends_on: string[];
  notes?: string;
}

export interface EstateManifest {
  version: string;
  host: string;
  description: string;
  updated: string;
  network: {
    tailscale_ip: string;
    lan_ip: string;
  };
  services: {
    systemd: ManifestService[];
    docker: ManifestDocker[];
    cron: ManifestCron[];
    endpoints: ManifestEndpoint[];
  };
}

// Tool output types

export interface HealthSnapshot {
  timestamp: string;
  overallSeverity: Severity;
  summary: string;
  cpu: MetricWithContext;
  memory: MetricWithContext & { totalBytes: number; availableBytes: number };
  disk: MetricWithContext & { totalFormatted: string; availableFormatted: string };
  loadAverage: {
    avg1m: number;
    avg5m: number;
    avg15m: number;
    cpuCores: number;
    severity: Severity;
    assessment: string;
  };
  uptime: { seconds: number; formatted: string; bootTime: string };
}
