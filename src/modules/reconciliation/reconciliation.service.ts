import { randomUUID } from 'node:crypto';
import type { AxiosInstance } from 'axios';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { FastifyLoggerInstance } from 'fastify';
import { broadcast } from '../../lib/sse.js';
import {
  commandAuditAppendOnlyTrigger,
  commandAuditTable,
  discrepancyEventTable,
} from './schemas/reconciliation.schema.js';
import type { DiscrepancyEvent } from './types/reconciliation.types.js';

let db: DatabaseType;
let _pollingInterval: NodeJS.Timeout;
let apiClient: AxiosInstance;
let logger: FastifyLoggerInstance;

/**
 * Initializes the reconciliation database and starts the polling service.
 * @param dbPath - The path to the SQLite database file.
 * @param client - The Axios instance for making API requests.
 * @param log - The Fastify logger instance.
 */
export async function initializeReconciliation(dbPath: string, client: AxiosInstance, log: FastifyLoggerInstance) {
  try {
    const { default: Database } = await import('better-sqlite3');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    logger = log;
    apiClient = client;

    // Initialize tables
    db.exec(commandAuditTable);
    db.exec(discrepancyEventTable);
    db.exec(commandAuditAppendOnlyTrigger);

    logger.info(`Reconciliation service initialized with DB at ${dbPath}`);

    // Start polling
    if (process.env.NODE_ENV !== 'test') {
      _pollingInterval = setInterval(pollReconciliation, 5000);
      logger.info('Reconciliation polling started.');
    }
  } catch (error) {
    throw new Error(`Failed to load better-sqlite3 or initialize DB: ${error}`);
  }
}

export function closeDatabase() {
  if (db && db.open) {
    db.close();
  }
}

export function stopPolling() {
  if (_pollingInterval) {
    clearInterval(_pollingInterval);
  }
}

export function getDatabase(): DatabaseType {
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
  const { page, limit, sortBy: querySortBy, sortOrder: querySortOrder, actionType, target, startDate, endDate } = query;
  const offset = (page - 1) * limit;

  const ALLOWED_SORT_COLUMNS = ['timestamp', 'actor', 'action_type', 'target', 'outcome'];
  const ALLOWED_SORT_ORDERS = ['asc', 'desc'];

  const sortBy = ALLOWED_SORT_COLUMNS.includes(querySortBy) ? querySortBy : 'timestamp';
  const sortOrder = ALLOWED_SORT_ORDERS.includes(querySortOrder) ? querySortOrder : 'desc';

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
  const totalResult = db.prepare(`SELECT count(*) as count FROM command_audit ${where}`).get(...(params as any[])) as
    | { count: number }
    | undefined;
  const total = totalResult?.count ?? 0;

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
