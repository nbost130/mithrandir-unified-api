// src/modules/reconciliation/schemas/reconciliation.schema.ts

export const discrepancyEventTable = `
CREATE TABLE IF NOT EXISTS discrepancy_event (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  service TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('verified', 'stale', 'discrepancy')),
  counts_json TEXT NOT NULL,
  checksum TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  discrepancy_details_json TEXT
);
`;

export const commandAuditTable = `
CREATE TABLE IF NOT EXISTS command_audit (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  actor TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('success', 'failure', 'timeout', 'running')),
  before_state_json TEXT,
  after_state_json TEXT,
  command_params_json TEXT,
  logs_json TEXT
);
`;

export const commandAuditAppendOnlyTrigger = `
CREATE TRIGGER IF NOT EXISTS command_audit_append_only
BEFORE DELETE ON command_audit
BEGIN
  SELECT RAISE(ABORT, 'Audit log entries cannot be deleted');
END;
`;
