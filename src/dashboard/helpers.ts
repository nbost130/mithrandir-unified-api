import type { AxiosInstance } from 'axios';
import type { FastifyBaseLogger } from 'fastify';

import type { DashboardStats, JobsResponse } from '../types.js';

const DASHBOARD_PAGE_LIMIT = 200;
const DASHBOARD_MAX_PAGES = 50;

type QueueStatsSnapshot = {
  waiting?: number;
  delayed?: number;
  prioritized?: number;
  active?: number;
  completed?: number;
  failed?: number;
  total?: number;
};

type FetchAllJobsOptions = {
  limit?: number;
  maxPages?: number;
};

function shouldContinueFetching(pageJobs: any[], pagination: any, page: number, limit: number) {
  if (pageJobs.length === 0) {
    return false;
  }

  if (typeof pagination?.totalPages === 'number') {
    return page < pagination.totalPages;
  }

  return pageJobs.length === limit;
}

export function createDashboardDataHelpers(apiClient: AxiosInstance, logger: FastifyBaseLogger) {
  async function fetchJobsPage(page: number, limit: number) {
    // TODO(#10): Fix proxy type preservation for generics once apiClient typing is improved
    const response = await apiClient.get<JobsResponse>('/jobs', { params: { page, limit } });
    const pagination: any = (response.data as any)?.pagination;

    return {
      jobs: response.data.data || [],
      pagination,
    };
  }

  async function fetchAllJobs(options: FetchAllJobsOptions = {}) {
    const limit = options.limit ?? DASHBOARD_PAGE_LIMIT;
    const maxPages = options.maxPages ?? DASHBOARD_MAX_PAGES;
    const jobs: any[] = [];
    let hitPageLimit = true;

    for (let page = 1; page <= maxPages; page++) {
      const { jobs: pageJobs, pagination } = await fetchJobsPage(page, limit);
      jobs.push(...pageJobs);

      const continueFetching = shouldContinueFetching(pageJobs, pagination, page, limit);
      if (!continueFetching) {
        hitPageLimit = false;
        break;
      }
    }

    if (hitPageLimit) {
      logger.warn(
        { maxPages, limit, totalJobs: jobs.length },
        '[Dashboard] fetchAllJobs hit maxPages; data may be truncated.'
      );
    }

    return jobs;
  }

  async function fetchQueueStats(): Promise<QueueStatsSnapshot | null> {
    try {
      // TODO(#10): Fix proxy type preservation for generics
      const queueStatsResponse = await apiClient.get('/queue/stats');
      return queueStatsResponse.data?.data || null;
    } catch (statsError) {
      logger.warn({ err: statsError }, '[Dashboard] queue stats endpoint failed, falling back to job scan');
      return null;
    }
  }

  function buildStatsFromQueue(queueStatsData: QueueStatsSnapshot): DashboardStats {
    const pendingJobsCount =
      (queueStatsData.waiting || 0) + (queueStatsData.delayed || 0) + (queueStatsData.prioritized || 0);
    const totalFromStats =
      queueStatsData.total ??
      pendingJobsCount + (queueStatsData.active || 0) + (queueStatsData.completed || 0) + (queueStatsData.failed || 0);

    return {
      totalJobs: totalFromStats,
      pendingJobs: pendingJobsCount,
      processingJobs: queueStatsData.active || 0,
      completedJobs: queueStatsData.completed || 0,
      failedJobs: queueStatsData.failed || 0,
      systemUptime: process.uptime().toString(),
      lastUpdated: new Date().toISOString(),
    };
  }

  function buildStatsFromJobs(allJobs: any[]): DashboardStats {
    return {
      totalJobs: allJobs.length,
      pendingJobs: allJobs.filter((j: any) => j.status === 'pending').length,
      processingJobs: allJobs.filter((j: any) => j.status === 'processing').length,
      completedJobs: allJobs.filter((j: any) => j.status === 'completed').length,
      failedJobs: allJobs.filter((j: any) => j.status === 'failed').length,
      systemUptime: process.uptime().toString(),
      lastUpdated: new Date().toISOString(),
    };
  }

  async function computeDashboardStats(): Promise<DashboardStats> {
    const queueStatsData = await fetchQueueStats();
    if (queueStatsData) {
      return buildStatsFromQueue(queueStatsData);
    }

    const allJobs = await fetchAllJobs();
    return buildStatsFromJobs(allJobs);
  }

  return {
    fetchAllJobs,
    computeDashboardStats,
  };
}
