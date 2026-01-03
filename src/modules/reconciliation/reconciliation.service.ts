import { randomUUID } from 'node:crypto';
import type { AxiosInstance } from 'axios';
import Database from 'better-sqlite3';
import type { FastifyLoggerInstance } from 'fastify';
import { broadcast } from '../../lib/sse';
import {
  commandAuditAppendOnlyTrigger,
  commandAuditTable,
  discrepancyEventTable,
} from './schemas/reconciliation.schema';
import type { DiscrepancyEvent } from './types/reconciliation.types';

let db: Database.Database;
let _pollingInterval: NodeJS.Timeout;
let apiClient: AxiosInstance;
let logger: FastifyLoggerInstance;

/**
 * Initializes the reconciliation database and starts the polling service.
 * @param dbPath - The path to the SQLite database file.
 * @param client - The API client for making requests.
 * @param log - The logger instance.
 */
export function initializeReconciliation(
  dbPath: string = './reconciliation.db',
  client: AxiosInstance,
  log: FastifyLoggerInstance
) {
  db = new Database(dbPath);
  db.exec(discrepancyEventTable);
  db.exec(commandAuditTable);
  db.exec(commandAuditAppendOnlyTrigger);
  logger = log;
  logger.info('Database initialized.');
  apiClient = client;

  // Start polling
  _pollingInterval = setInterval(pollReconciliation, 5000);
  logger.info('Reconciliation polling started.');
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export async function getAuditLog(query: {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: string;
  actionType?: string;
  target?: string;
  startDate?: string;
  endDate?: string;
}) {
  const { page, limit, sortBy, sortOrder, actionType, target, startDate, endDate } = query;
  const offset = (page - 1) * limit;

  let whereClause = '';
  const params: any[] = [];

  if (actionType) {
    whereClause += 'action_type = ?';
    params.push(actionType);
  }
  if (target) {
    whereClause += `${whereClause ? ' AND ' : ''}target = ?`;
    params.push(target);
  }
  if (startDate) {
    whereClause += `${whereClause ? ' AND ' : ''}timestamp >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    whereClause += `${whereClause ? ' AND ' : ''}timestamp <= ?`;
    params.push(endDate);
  }

  const where = whereClause ? `WHERE ${whereClause}` : '';
  const totalResult = db.prepare(`SELECT count(*) as count FROM command_audit ${where}`).get(...params);
  const total = totalResult ? (totalResult as any).count : 0;

  const data = db
    .prepare(`SELECT * FROM command_audit ${where} ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function pollReconciliation() {
  logger.info('Polling for reconciliation...');
  try {
    const response = await apiClient.get('/jobs');
    const jobs = response.data.data || [];
    const counts = {
      total: jobs.length,
      completed: jobs.filter((j: any) => j.status === 'completed').length,
      failed: jobs.filter((j: any) => j.status === 'failed').length,
      pending: jobs.filter((j: any) => j.status === 'pending').length,
    };

    const event: DiscrepancyEvent = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      service: 'transcription-palantir',
      status: 'verified',
      counts_json: JSON.stringify(counts),
      checksum: '', // Calculate checksum
      latency_ms: 0, // Calculate latency
    };

    // Insert into DB
    const stmt = db.prepare(
      'INSERT INTO discrepancy_event (id, service, status, counts_json, checksum, latency_ms) VALUES (?, ?, ?, ?, ?, ?)'
    );
    stmt.run(event.id, event.service, event.status, event.counts_json, event.checksum, event.latency_ms);

    // Broadcast to SSE
    broadcast('reconciliation.update', event);
    logger.info('Reconciliation poll completed.');
  } catch (error) {
    logger.error(error, 'Error during reconciliation poll');
  }
}
