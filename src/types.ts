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
