export interface SystemStatus {
  ssh_active: boolean;
  vnc_running: boolean;
  vnc_pid: string | null;
  uptime: string;
  timestamp: string;
  api_name: string;
  version: string;
  node_version?: string;
  memory_usage?: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
}

export interface RestartResult {
  status: 'success' | 'error';
  restart_output: string;
  service_status: string;
  timestamp: string;
  duration_ms?: number;
}

export interface VNCResult {
  status: 'success' | 'error';
  message: string;
  vnc_running: boolean;
  vnc_pid: string | null;
  timestamp: string;
  port?: number;
}

export interface APIError {
  status: 'error';
  message: string;
  code?: string;
  timestamp: string;
  endpoint?: string;
  requestId?: string;
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  uptime: number;
  version: string;
  timestamp: string;
  checks: {
    ssh: boolean;
    vnc: boolean;
    system: boolean;
  };
}

// Dashboard Types
export interface DashboardStats {
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  systemUptime: string;
  lastUpdated: string;
}

export interface ActivityItem {
  id: string;
  type: 'job_created' | 'job_completed' | 'job_failed' | 'system_event';
  message: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface TrendDataPoint {
  date: string;
  completed: number;
  failed: number;
  pending: number;
}

// Transcription Types
export interface TranscriptionJob {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface JobsResponse {
  status: 'success' | 'error';
  data: TranscriptionJob[];
  total?: number;
  message?: string;
}

export interface JobResponse {
  status: 'success' | 'error';
  data?: TranscriptionJob;
  message?: string;
}

// API Response wrapper
export interface ApiResponse<T> {
  status: 'success' | 'error';
  data: T;
  message?: string;
  timestamp: string;
}
