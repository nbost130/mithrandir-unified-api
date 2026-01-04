// src/modules/reconciliation/types/reconciliation.types.ts

export interface ReconciliationUpdateEvent {
  eventId: string;
  service: string;
  status: 'verified' | 'stale' | 'discrepancy';
  counts: Record<string, number>;
  checksum: string;
  latencyMs: number;
  discrepancyDetails?: {
    expected: Record<string, number>;
    actual: Record<string, number>;
    missingJobIds: string[];
  };
}

export interface CommandStatusEvent {
  commandId: string;
  service: string;
  phase: 'queued' | 'running' | 'success' | 'error' | 'timeout';
  logs: string[];
  verified?: boolean;
}

export interface DiscrepancyEvent {
  id: string;
  timestamp: string;
  service: string;
  status: 'verified' | 'stale' | 'discrepancy';
  counts_json: string;
  checksum: string;
  latency_ms: number;
  discrepancy_details_json?: string;
}

export interface CommandAudit {
  id: string;
  timestamp: string;
  actor: string;
  action_type: string;
  target: string;
  outcome: 'success' | 'failure' | 'timeout';
  before_state_json?: string;
  after_state_json?: string;
  command_params_json?: string;
  logs_json?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action_type: string;
  target: string;
  outcome: 'success' | 'failure' | 'timeout';
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
  command_params?: Record<string, unknown>;
  logs?: string[];
}

export interface PaginatedAuditResponse {
  data: AuditEntry[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
