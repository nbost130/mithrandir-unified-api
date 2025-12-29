import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import type { AxiosError } from 'axios';
import Fastify from 'fastify';
import { z } from 'zod';
import { getConfig } from './config/validation.js';
import { createApiClient } from './lib/apiClient.js';
import { DaysQuerySchema, JobResponseSchema, JobsResponseSchema, ListJobsQuerySchema } from './lib/schemas.js';
import type {
  ActivityItem,
  APIError,
  ApiResponse,
  DashboardStats,
  HealthCheck,
  JobResponse,
  JobsResponse,
  TrendDataPoint,
} from './types.js';

/**
 * Create a new Fastify server instance with all routes and middleware configured.
 * This factory pattern enables proper test isolation by creating separate instances.
 *
 * @param options - Optional dependencies for testing
 * @param options.systemService - Optional SystemService instance (for testing)
 * @param options.apiClient - Optional API client instance (for testing)
 */
export async function createServer(options?: { systemService?: any; apiClient?: any }) {
  // Configure logger based on environment
  const isProduction = process.env.NODE_ENV === 'production';
  const fastify = Fastify({
    logger: isProduction
      ? {
        // Production: structured JSON logs
        level: process.env.LOG_LEVEL || 'info',
      }
      : {
        // Development: pretty-printed logs
        level: process.env.LOG_LEVEL || 'info',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
      },
  });

  // Security middleware
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  // CORS middleware
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });

  // Request ID generation - add unique ID to each request
  fastify.decorateRequest('id', '');
  fastify.addHook('onRequest', async (request, _reply) => {
    request.id = randomUUID();
  });

  // Request lifecycle logging - track performance and requests
  const SLOW_REQUEST_THRESHOLD = 1000; // ms

  fastify.addHook('onRequest', async (request, _reply) => {
    request.log.info(
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
      },
      'Incoming request'
    );
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const duration = reply.elapsedTime;
    const logLevel = duration > SLOW_REQUEST_THRESHOLD ? 'warn' : 'info';

    request.log[logLevel](
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        duration: `${duration.toFixed(2)}ms`,
      },
      duration > SLOW_REQUEST_THRESHOLD ? 'Slow request detected' : 'Request completed'
    );
  });

  // Rate limiting removed - not needed for internal Tailscale service

  // Configuration and Resilient API Client Setup
  const config = getConfig();
  const apiClient = options?.apiClient || createApiClient(config, fastify.log);

  /**
   * Generic error handler for proxied requests.
   * Intelligently determines status code and message based on error type.
   */
  function handleProxyError(error: any, reply: any, endpoint: string) {
    const requestId = reply.request.id;
    fastify.log.error({ err: error, requestId }, `[ProxyError] at ${endpoint}`);

    let statusCode = 500;
    let message = 'An unexpected error occurred.';
    let code = 'PROXY_ERROR';

    if (error.isAxiosError) {
      const axiosError = error as AxiosError<APIError>;
      statusCode = axiosError.response?.status || 502; // 502 Bad Gateway if no response
      message = axiosError.response?.data?.message || axiosError.message;
    } else if (error.code === 'EOPENBREAKER') {
      // Circuit breaker is open
      statusCode = 503; // Service Unavailable
      message = 'The service is temporarily unavailable. Please try again later.';
      code = 'CIRCUIT_BREAKER_OPEN';
    }

    const errorResponse: APIError = {
      status: 'error',
      message,
      code,
      timestamp: new Date().toISOString(),
      endpoint,
      requestId,
    };
    return reply.code(statusCode).send(errorResponse);
  }

  // Health check endpoint
  fastify.get<{ Reply: HealthCheck }>('/health', async (_request, reply) => {
    const healthCheck: HealthCheck = {
      status: 'healthy',
      uptime: process.uptime(),
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      checks: {
        ssh: false,
        vnc: false,
        system: true,
      },
    };

    return reply.code(200).send(healthCheck);
  });

  // ============================================================================
  // DASHBOARD ROUTES
  // ============================================================================

  // Dashboard Stats endpoint
  fastify.get<{ Reply: ApiResponse<DashboardStats> | APIError }>('/api/dashboard/stats', async (_request, reply) => {
    try {
      // Fetch job stats from Palantir (max limit is 100)
      // @ts-expect-error - TODO(#10): Fix proxy type preservation for generics
      const response = await apiClient.get<JobsResponse>('/jobs?limit=100');
      const jobs = response.data.data || [];

      const stats: DashboardStats = {
        totalJobs: jobs.length,
        pendingJobs: jobs.filter((j: any) => j.status === 'pending').length,
        processingJobs: jobs.filter((j: any) => j.status === 'processing').length,
        completedJobs: jobs.filter((j: any) => j.status === 'completed').length,
        failedJobs: jobs.filter((j: any) => j.status === 'failed').length,
        systemUptime: process.uptime().toString(),
        lastUpdated: new Date().toISOString(),
      };

      return reply.code(200).send({
        status: 'success',
        data: stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      handleProxyError(error, reply, '/api/dashboard/stats');
    }
  });

  // Dashboard Activity endpoint
  fastify.get<{
    Querystring: { limit?: string };
    Reply: ApiResponse<ActivityItem[]> | APIError;
  }>('/api/dashboard/activity', async (request, reply) => {
    try {
      const limit = parseInt(request.query.limit || '10', 10);

      // Fetch recent jobs from Palantir
      // @ts-expect-error - TODO(#10): Fix proxy type preservation for generics
      const response = await apiClient.get<JobsResponse>(`/jobs?limit=${limit * 2}`);
      const jobs = response.data.data || [];

      // Convert jobs to activity items
      const activities: ActivityItem[] = jobs
        .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, limit)
        .map((job: any) => ({
          id: job.id,
          type:
            job.status === 'completed'
              ? ('job_completed' as const)
              : job.status === 'failed'
                ? ('job_failed' as const)
                : ('job_created' as const),
          message: `Job "${job.name}" ${job.status}`,
          timestamp: job.updatedAt,
          metadata: { jobId: job.id, status: job.status },
        }));

      return reply.code(200).send({
        status: 'success',
        data: activities,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      handleProxyError(error, reply, '/api/dashboard/activity');
    }
  });

  // Dashboard Trends endpoint
  fastify.get<{
    Querystring: { days?: string };
    Reply: ApiResponse<TrendDataPoint[]> | APIError;
  }>('/api/dashboard/trends', async (request, reply) => {
    try {
      const days = parseInt(request.query.days || '7', 10);

      // Fetch all jobs from Palantir (max limit is 100)
      // @ts-expect-error - TODO(#10): Fix proxy type preservation for generics
      const response = await apiClient.get<JobsResponse>('/jobs?limit=100');
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
      jobs.forEach((job: any) => {
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

      return reply.code(200).send({
        status: 'success',
        data: trends,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      handleProxyError(error, reply, '/api/dashboard/trends');
    }
  });

  // API Info endpoint
  // API Info endpoint
  fastify.get('/info', async (_request, reply) => {
    return reply.send({
      name: 'Mithrandir Unified API',
      version: '2.1.0',
      description: 'Unified API gateway for dashboard analytics and transcription service routing',
      framework: 'Fastify',
      node_version: process.version,
      uptime: process.uptime(),
      endpoints: [
        'GET /health - Health check',
        'GET /info - API information',
        'GET /api/dashboard/stats - Dashboard statistics',
        'GET /api/dashboard/activity - Recent activity',
        'GET /api/dashboard/trends - Trend data',
        'GET /transcription/jobs - List transcription jobs',
        'POST /transcription/jobs - Create transcription job',
        'GET /transcription/jobs/:id - Get job details',
        'PUT /transcription/jobs/:id - Update job (full)',
        'PATCH /transcription/jobs/:id - Update job (partial, e.g., priority)',
        'DELETE /transcription/jobs/:id - Delete job',
        'POST /transcription/jobs/:id/retry - Retry failed job',
      ],
      timestamp: new Date().toISOString(),
    });
  });

  // ============================================================================
  // TRANSCRIPTION PROXY ROUTES
  // ============================================================================

  // List transcription jobs
  fastify.get<{
    Querystring: { status?: string; limit?: string };
    Reply: JobsResponse;
  }>('/transcription/jobs', async (request, reply) => {
    try {
      // @ts-expect-error - TODO(#10): Fix proxy type preservation for generics
      const response = await apiClient.get<JobsResponse>('/jobs', { params: request.query });
      return reply.code(response.status).send(response.data);
    } catch (error) {
      handleProxyError(error, reply, '/transcription/jobs');
    }
  });

  // Create transcription job
  fastify.post<{
    Body: any;
    Reply: JobResponse;
  }>('/transcription/jobs', async (request, reply) => {
    try {
      // @ts-expect-error - TODO(#10): Fix proxy type preservation for generics
      const response = await apiClient.post<JobResponse>('/jobs', request.body, {
        headers: { 'Content-Type': request.headers['content-type'] || 'application/json' },
      });
      return reply.code(response.status).send(response.data);
    } catch (error) {
      handleProxyError(error, reply, '/transcription/jobs');
    }
  });

  // Get specific transcription job
  fastify.get<{
    Params: { id: string };
    Reply: JobResponse;
  }>('/transcription/jobs/:id', async (request, reply) => {
    try {
      // @ts-expect-error - TODO(#10): Fix proxy type preservation for generics
      const response = await apiClient.get<JobResponse>(`/jobs/${request.params.id}`);
      return reply.code(response.status).send(response.data);
    } catch (error) {
      handleProxyError(error, reply, `/transcription/jobs/${request.params.id}`);
    }
  });

  // Update transcription job
  fastify.put<{
    Params: { id: string };
    Body: any;
    Reply: JobResponse;
  }>('/transcription/jobs/:id', async (request, reply) => {
    try {
      // @ts-expect-error - TODO(#10): Fix proxy type preservation for generics
      const response = await apiClient.put<JobResponse>(`/jobs/${request.params.id}`, request.body, {
        headers: { 'Content-Type': request.headers['content-type'] || 'application/json' },
      });
      return reply.code(response.status).send(response.data);
    } catch (error) {
      handleProxyError(error, reply, `/transcription/jobs/${request.params.id}`);
    }
  });

  // Update transcription job (partial update)
  fastify.patch<{
    Params: { id: string };
    Body: any;
    Reply: JobResponse;
  }>('/transcription/jobs/:id', async (request, reply) => {
    try {
      // @ts-expect-error - TODO(#10): Fix proxy type preservation for generics
      const response = await apiClient.patch<JobResponse>(`/jobs/${request.params.id}`, request.body, {
        headers: { 'Content-Type': request.headers['content-type'] || 'application/json' },
      });
      return reply.code(response.status).send(response.data);
    } catch (error) {
      handleProxyError(error, reply, `/transcription/jobs/${request.params.id}`);
    }
  });

  // Delete transcription job
  fastify.delete<{
    Params: { id: string };
    Reply: JobResponse;
  }>('/transcription/jobs/:id', async (request, reply) => {
    try {
      // @ts-expect-error - TODO(#10): Fix proxy type preservation for generics
      const response = await apiClient.delete<JobResponse>(`/jobs/${request.params.id}`);
      return reply.code(response.status).send(response.data);
    } catch (error) {
      handleProxyError(error, reply, `/transcription/jobs/${request.params.id}`);
    }
  });

  // Retry failed transcription job
  fastify.post<{
    Params: { id: string };
    Reply: JobResponse;
  }>('/transcription/jobs/:id/retry', async (request, reply) => {
    try {
      // @ts-expect-error - TODO(#10): Fix proxy type preservation for generics
      const response = await apiClient.post<JobResponse>(`/jobs/${request.params.id}/retry`, request.body, {
        headers: { 'Content-Type': request.headers['content-type'] || 'application/json' },
      });
      return reply.code(response.status).send(response.data);
    } catch (error) {
      handleProxyError(error, reply, `/transcription/jobs/${request.params.id}/retry`);
    }
  });

  // 404 handler
  fastify.setNotFoundHandler((request, reply) => {
    const errorResponse: APIError = {
      status: 'error',
      message: 'Endpoint not found',
      code: 'NOT_FOUND',
      timestamp: new Date().toISOString(),
      endpoint: request.url,
      requestId: request.id,
    };
    return reply.code(404).send(errorResponse);
  });

  // Global error handler
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);

    const errorResponse: APIError = {
      status: 'error',
      message: error.message || 'Internal server error',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
      endpoint: request.url,
    };

    return reply.code(500).send(errorResponse);
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

  return fastify;
}
