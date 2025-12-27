import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import axios from 'axios';
import { SystemService } from './services.js';
import type {
  SystemStatus,
  RestartResult,
  VNCResult,
  APIError,
  HealthCheck,
  DashboardStats,
  ActivityItem,
  TrendDataPoint,
  TranscriptionJob,
  JobsResponse,
  JobResponse,
  ApiResponse
} from './types.js';

const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    }
  }
});

// Security middleware
await fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:']
    }
  }
});

// CORS middleware
await fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
});

// Rate limiting removed - not needed for internal Tailscale service

const systemService = SystemService.getInstance();

// Configuration
const TRANSCRIPTION_API_URL = process.env.TRANSCRIPTION_API_URL || 'http://localhost:9003/api/v1';

// Health check endpoint
fastify.get<{ Reply: HealthCheck }>('/health', async (request, reply) => {
  const startTime = Date.now();
  
  try {
    const status = await systemService.getSystemStatus();
    
    const healthCheck: HealthCheck = {
      status: 'healthy',
      uptime: process.uptime(),
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      checks: {
        ssh: status.ssh_active,
        vnc: status.vnc_running,
        system: true
      }
    };
    
    reply.code(200).send(healthCheck);
  } catch (error) {
    const errorResponse: HealthCheck = {
      status: 'unhealthy',
      uptime: process.uptime(),
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      checks: {
        ssh: false,
        vnc: false,
        system: false
      }
    };
    
    reply.code(503).send(errorResponse);
  }
});

// SSH Status endpoint (with legacy alias support)
fastify.get<{ Reply: SystemStatus | APIError }>('/ssh-status', async (request, reply) => {
  try {
    const status = await systemService.getSystemStatus();
    reply.code(200).send(status);
  } catch (error) {
    const errorResponse: APIError = {
      status: 'error',
      message: `Failed to get system status: ${error}`,
      code: 'SYSTEM_STATUS_ERROR',
      timestamp: new Date().toISOString(),
      endpoint: '/ssh-status'
    };
    reply.code(500).send(errorResponse);
  }
});

// Legacy alias for ssh-status
fastify.get<{ Reply: SystemStatus | APIError }>('/status', async (request, reply) => {
  return fastify.inject({
    method: 'GET',
    url: '/ssh-status'
  }).then(response => {
    reply.code(response.statusCode).send(JSON.parse(response.payload));
  });
});

// SSH Restart endpoint
fastify.post<{ Reply: RestartResult | APIError }>('/restart-ssh', async (request, reply) => {
  try {
    fastify.log.info('SSH restart requested');
    const result = await systemService.restartSSH();
    
    const statusCode = result.status === 'success' ? 200 : 500;
    reply.code(statusCode).send(result);
    
    fastify.log.info(`SSH restart completed: ${result.status}`);
  } catch (error) {
    const errorResponse: APIError = {
      status: 'error',
      message: `Failed to restart SSH: ${error}`,
      code: 'SSH_RESTART_ERROR',
      timestamp: new Date().toISOString(),
      endpoint: '/restart-ssh'
    };
    reply.code(500).send(errorResponse);
  }
});

// VNC Start endpoint
fastify.post<{ Reply: VNCResult | APIError }>('/start-vnc', async (request, reply) => {
  try {
    fastify.log.info('VNC start requested');
    const result = await systemService.startVNC();
    
    const statusCode = result.status === 'success' ? 200 : 500;
    reply.code(statusCode).send(result);
    
    fastify.log.info(`VNC start completed: ${result.status}`);
  } catch (error) {
    const errorResponse: APIError = {
      status: 'error',
      message: `Failed to start VNC: ${error}`,
      code: 'VNC_START_ERROR',
      timestamp: new Date().toISOString(),
      endpoint: '/start-vnc'
    };
    reply.code(500).send(errorResponse);
  }
});

// ============================================================================
// DASHBOARD ROUTES
// ============================================================================

// Dashboard Stats endpoint
fastify.get<{ Reply: ApiResponse<DashboardStats> | APIError }>('/api/dashboard/stats', async (request, reply) => {
  try {
    // Fetch job stats from Palantir (max limit is 100)
    const response = await axios.get<JobsResponse>(`${TRANSCRIPTION_API_URL}/jobs?limit=100`);
    const jobs = response.data.data || [];

    const stats: DashboardStats = {
      totalJobs: jobs.length,
      pendingJobs: jobs.filter(j => j.status === 'pending').length,
      processingJobs: jobs.filter(j => j.status === 'processing').length,
      completedJobs: jobs.filter(j => j.status === 'completed').length,
      failedJobs: jobs.filter(j => j.status === 'failed').length,
      systemUptime: process.uptime().toString(),
      lastUpdated: new Date().toISOString()
    };

    reply.code(200).send({
      status: 'success',
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    fastify.log.error({ error }, 'Failed to fetch dashboard stats');
    const errorResponse: APIError = {
      status: 'error',
      message: `Failed to fetch dashboard stats: ${error}`,
      code: 'DASHBOARD_STATS_ERROR',
      timestamp: new Date().toISOString(),
      endpoint: '/api/dashboard/stats'
    };
    reply.code(500).send(errorResponse);
  }
});

// Dashboard Activity endpoint
fastify.get<{
  Querystring: { limit?: string },
  Reply: ApiResponse<ActivityItem[]> | APIError
}>('/api/dashboard/activity', async (request, reply) => {
  try {
    const limit = parseInt(request.query.limit || '10', 10);

    // Fetch recent jobs from Palantir
    const response = await axios.get<JobsResponse>(`${TRANSCRIPTION_API_URL}/jobs?limit=${limit * 2}`);
    const jobs = response.data.data || [];

    // Convert jobs to activity items
    const activities: ActivityItem[] = jobs
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit)
      .map(job => ({
        id: job.id,
        type: job.status === 'completed' ? 'job_completed' as const :
              job.status === 'failed' ? 'job_failed' as const :
              'job_created' as const,
        message: `Job "${job.name}" ${job.status}`,
        timestamp: job.updatedAt,
        metadata: { jobId: job.id, status: job.status }
      }));

    reply.code(200).send({
      status: 'success',
      data: activities,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    fastify.log.error({ error }, 'Failed to fetch dashboard activity');
    const errorResponse: APIError = {
      status: 'error',
      message: `Failed to fetch dashboard activity: ${error}`,
      code: 'DASHBOARD_ACTIVITY_ERROR',
      timestamp: new Date().toISOString(),
      endpoint: '/api/dashboard/activity'
    };
    reply.code(500).send(errorResponse);
  }
});

// Dashboard Trends endpoint
fastify.get<{
  Querystring: { days?: string },
  Reply: ApiResponse<TrendDataPoint[]> | APIError
}>('/api/dashboard/trends', async (request, reply) => {
  try {
    const days = parseInt(request.query.days || '7', 10);

    // Fetch all jobs from Palantir (max limit is 100)
    const response = await axios.get<JobsResponse>(`${TRANSCRIPTION_API_URL}/jobs?limit=100`);
    const jobs = response.data.data || [];

    // Group jobs by date
    const trendMap = new Map<string, { completed: number; failed: number; pending: number }>();
    const now = new Date();

    // Initialize trend data for the last N days
    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      trendMap.set(dateStr, { completed: 0, failed: 0, pending: 0 });
    }

    // Count jobs by date and status
    jobs.forEach(job => {
      const dateStr = job.updatedAt.split('T')[0];
      const trend = trendMap.get(dateStr);
      if (trend) {
        if (job.status === 'completed') trend.completed++;
        else if (job.status === 'failed') trend.failed++;
        else if (job.status === 'pending') trend.pending++;
      }
    });

    // Convert to array and sort by date
    const trends: TrendDataPoint[] = Array.from(trendMap.entries())
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    reply.code(200).send({
      status: 'success',
      data: trends,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    fastify.log.error({ error }, 'Failed to fetch dashboard trends');
    const errorResponse: APIError = {
      status: 'error',
      message: `Failed to fetch dashboard trends: ${error}`,
      code: 'DASHBOARD_TRENDS_ERROR',
      timestamp: new Date().toISOString(),
      endpoint: '/api/dashboard/trends'
    };
    reply.code(500).send(errorResponse);
  }
});

// API Info endpoint
fastify.get('/info', async (request, reply) => {
  reply.send({
    name: 'Mithrandir Unified API',
    version: '2.1.0',
    description: 'TypeScript-based unified API gateway for Mithrandir services',
    framework: 'Fastify',
    node_version: process.version,
    uptime: process.uptime(),
    endpoints: [
      'GET /health - Health check',
      'GET /ssh-status - System status',
      'GET /status - Legacy alias for ssh-status',
      'POST /restart-ssh - Restart SSH service',
      'POST /start-vnc - Start VNC server',
      'GET /api/dashboard/stats - Dashboard statistics',
      'GET /api/dashboard/activity - Recent activity',
      'GET /api/dashboard/trends - Trend data',
      'GET /transcription/jobs - List transcription jobs',
      'POST /transcription/jobs - Create transcription job',
      'GET /transcription/jobs/:id - Get job details',
      'DELETE /transcription/jobs/:id - Delete job',
      'POST /transcription/jobs/:id/retry - Retry failed job',
      'GET /info - API information'
    ],
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// TRANSCRIPTION PROXY ROUTES
// ============================================================================

// List transcription jobs
fastify.get<{
  Querystring: { status?: string; limit?: string },
  Reply: JobsResponse
}>('/transcription/jobs', async (request, reply) => {
  try {
    const params = new URLSearchParams();
    if (request.query.status) params.append('status', request.query.status);
    if (request.query.limit) params.append('limit', request.query.limit);

    const url = `${TRANSCRIPTION_API_URL}/jobs${params.toString() ? '?' + params.toString() : ''}`;
    fastify.log.info(`Proxying GET request to: ${url}`);

    const response = await axios.get<JobsResponse>(url);
    reply.code(response.status).send(response.data);
  } catch (error: any) {
    fastify.log.error({ error }, 'Failed to proxy transcription jobs request');
    const statusCode = error.response?.status || 500;
    const errorResponse: APIError = {
      status: 'error',
      message: error.response?.data?.message || `Failed to fetch transcription jobs: ${error.message}`,
      code: 'TRANSCRIPTION_PROXY_ERROR',
      timestamp: new Date().toISOString(),
      endpoint: '/transcription/jobs'
    };
    reply.code(statusCode).send(errorResponse);
  }
});

// Create transcription job
fastify.post<{
  Body: any,
  Reply: JobResponse
}>('/transcription/jobs', async (request, reply) => {
  try {
    const url = `${TRANSCRIPTION_API_URL}/jobs`;
    fastify.log.info(`Proxying POST request to: ${url}`);

    const response = await axios.post<JobResponse>(url, request.body);
    reply.code(response.status).send(response.data);
  } catch (error: any) {
    fastify.log.error({ error }, 'Failed to proxy create job request');
    const statusCode = error.response?.status || 500;
    const errorResponse: APIError = {
      status: 'error',
      message: error.response?.data?.message || `Failed to create transcription job: ${error.message}`,
      code: 'TRANSCRIPTION_PROXY_ERROR',
      timestamp: new Date().toISOString(),
      endpoint: '/transcription/jobs'
    };
    reply.code(statusCode).send(errorResponse);
  }
});

// Get specific transcription job
fastify.get<{
  Params: { id: string },
  Reply: JobResponse
}>('/transcription/jobs/:id', async (request, reply) => {
  try {
    const url = `${TRANSCRIPTION_API_URL}/jobs/${request.params.id}`;
    fastify.log.info(`Proxying GET request to: ${url}`);

    const response = await axios.get<JobResponse>(url);
    reply.code(response.status).send(response.data);
  } catch (error: any) {
    fastify.log.error({ error }, 'Failed to proxy get job request');
    const statusCode = error.response?.status || 500;
    const errorResponse: APIError = {
      status: 'error',
      message: error.response?.data?.message || `Failed to fetch job: ${error.message}`,
      code: 'TRANSCRIPTION_PROXY_ERROR',
      timestamp: new Date().toISOString(),
      endpoint: `/transcription/jobs/${request.params.id}`
    };
    reply.code(statusCode).send(errorResponse);
  }
});

// Update transcription job
fastify.put<{
  Params: { id: string },
  Body: any,
  Reply: JobResponse
}>('/transcription/jobs/:id', async (request, reply) => {
  try {
    const url = `${TRANSCRIPTION_API_URL}/jobs/${request.params.id}`;
    fastify.log.info(`Proxying PUT request to: ${url}`);

    const response = await axios.put<JobResponse>(url, request.body);
    reply.code(response.status).send(response.data);
  } catch (error: any) {
    fastify.log.error({ error }, 'Failed to proxy update job request');
    const statusCode = error.response?.status || 500;
    const errorResponse: APIError = {
      status: 'error',
      message: error.response?.data?.message || `Failed to update job: ${error.message}`,
      code: 'TRANSCRIPTION_PROXY_ERROR',
      timestamp: new Date().toISOString(),
      endpoint: `/transcription/jobs/${request.params.id}`
    };
    reply.code(statusCode).send(errorResponse);
  }
});

// Delete transcription job
fastify.delete<{
  Params: { id: string },
  Reply: JobResponse
}>('/transcription/jobs/:id', async (request, reply) => {
  try {
    const url = `${TRANSCRIPTION_API_URL}/jobs/${request.params.id}`;
    fastify.log.info(`Proxying DELETE request to: ${url}`);

    const response = await axios.delete<JobResponse>(url);
    reply.code(response.status).send(response.data);
  } catch (error: any) {
    fastify.log.error({ error }, 'Failed to proxy delete job request');
    const statusCode = error.response?.status || 500;
    const errorResponse: APIError = {
      status: 'error',
      message: error.response?.data?.message || `Failed to delete job: ${error.message}`,
      code: 'TRANSCRIPTION_PROXY_ERROR',
      timestamp: new Date().toISOString(),
      endpoint: `/transcription/jobs/${request.params.id}`
    };
    reply.code(statusCode).send(errorResponse);
  }
});

// Retry failed transcription job
fastify.post<{
  Params: { id: string },
  Reply: JobResponse
}>('/transcription/jobs/:id/retry', async (request, reply) => {
  try {
    const url = `${TRANSCRIPTION_API_URL}/jobs/${request.params.id}/retry`;
    fastify.log.info(`Proxying POST request to: ${url}`);

    const response = await axios.post<JobResponse>(url);
    reply.code(response.status).send(response.data);
  } catch (error: any) {
    fastify.log.error({ error }, 'Failed to proxy retry job request');
    const statusCode = error.response?.status || 500;
    const errorResponse: APIError = {
      status: 'error',
      message: error.response?.data?.message || `Failed to retry job: ${error.message}`,
      code: 'TRANSCRIPTION_PROXY_ERROR',
      timestamp: new Date().toISOString(),
      endpoint: `/transcription/jobs/${request.params.id}/retry`
    };
    reply.code(statusCode).send(errorResponse);
  }
});

// 404 handler
fastify.setNotFoundHandler((request, reply) => {
  const errorResponse: APIError = {
    status: 'error',
    message: 'Endpoint not found',
    code: 'NOT_FOUND',
    timestamp: new Date().toISOString(),
    endpoint: request.url
  };
  reply.code(404).send(errorResponse);
});

// Global error handler
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  
  const errorResponse: APIError = {
    status: 'error',
    message: error.message || 'Internal server error',
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
    endpoint: request.url
  };
  
  reply.code(500).send(errorResponse);
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  fastify.log.info(`Received ${signal}, shutting down gracefully`);
  try {
    await fastify.close();
    process.exit(0);
  } catch (error) {
    fastify.log.error({ error }, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { fastify };
