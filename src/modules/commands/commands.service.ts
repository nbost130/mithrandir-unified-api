import { randomUUID } from 'node:crypto';
import { getDatabase } from '../reconciliation/reconciliation.service';
import { broadcastCommandUpdate } from './commands.controller';

/**
 * @fileoverview Business logic for the commands module.
 */

export async function runCommand(commandId: string, command: string, params: any) {
  const db = getDatabase();
  const _startTime = Date.now();

  // 1. Log "queued" status
  broadcastCommandUpdate({ commandId, phase: 'queued', logs: ['Command received'] });

  const auditId = randomUUID();
  const stmt = db.prepare('INSERT INTO command_audit (id, actor, action_type, target, outcome) VALUES (?, ?, ?, ?, ?)');
  stmt.run(auditId, 'system', command, params?.target || 'unknown', 'running');

  let outcome: 'success' | 'failure';
  let logs: string[];

  try {
    // 2. Log "running" status
    broadcastCommandUpdate({ commandId, phase: 'running', logs: [`Executing command: ${command}`] });

    // TODO: Implement actual command execution logic here
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate work

    logs = [`Command ${command} completed successfully.`];
    outcome = 'success';

    // 3. Log "success" status
    broadcastCommandUpdate({ commandId, phase: 'success', logs, verified: true });
  } catch (error: any) {
    logs = [`Command ${command} failed.`, error.message];
    outcome = 'failure';

    // 4. Log "error" status
    broadcastCommandUpdate({ commandId, phase: 'error', logs });
  } finally {
    // Update audit log with final outcome (runs whether success or failure)
    db.prepare('UPDATE command_audit SET outcome = ?, logs_json = ? WHERE id = ?').run(
      outcome!,
      JSON.stringify(logs!),
      auditId
    );
  }
}
