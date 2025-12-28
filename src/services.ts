import { exec } from 'child_process';
import { promisify } from 'util';
import type { SystemStatus, RestartResult, VNCResult } from './types.js';

const execAsync = promisify(exec);

export class SystemService {
  private static instance: SystemService;
  
  public static getInstance(): SystemService {
    if (!SystemService.instance) {
      SystemService.instance = new SystemService();
    }
    return SystemService.instance;
  }

  async getSystemStatus(): Promise<SystemStatus> {
    try {
      const [sshStatus, vncStatus, uptime] = await Promise.all([
        this.checkSSHStatus(),
        this.checkVNCStatus(),
        this.getUptime()
      ]);

      const memoryUsage = process.memoryUsage();
      
      return {
        ssh_active: sshStatus,
        vnc_running: vncStatus.running,
        vnc_pid: vncStatus.pid,
        uptime: uptime,
        timestamp: new Date().toISOString(),
        api_name: 'Mithrandir Failsafe API (TypeScript)',
        version: '2.0.0',
        node_version: process.version,
        memory_usage: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024)
        }
      };
    } catch (error) {
      throw new Error(`Failed to get system status: ${error}`);
    }
  }

  async restartSSH(): Promise<RestartResult> {
    const startTime = Date.now();

    try {
      // ⚠️ DEPRECATED: Using 'sudo' is a significant security risk and requires passwordless sudo setup.
      // TODO: Refactor to a more secure method. Options:
      //   1. Create a dedicated, restricted user with systemd service permissions
      //   2. Use systemd socket activation or D-Bus for service management
      //   3. Expose a secure, authenticated internal API for service management
      // For now, retaining for backward compatibility.
      const { stderr: restartError } = await execAsync('sudo systemctl restart ssh');
      const { stdout: serviceStatus } = await execAsync('sudo systemctl status ssh --no-pager');

      const duration = Date.now() - startTime;

      return {
        status: restartError ? 'error' : 'success',
        restart_output: restartError || 'SSH restarted successfully. [WARNING: sudo dependency is a security risk]',
        service_status: serviceStatus,
        timestamp: new Date().toISOString(),
        duration_ms: duration
      };
    } catch (error) {
      console.error('SSH restart failed:', error); // Log full error for debugging
      return {
        status: 'error',
        restart_output: 'Failed to restart SSH service',
        service_status: '',
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - startTime
      };
    }
  }

  async startVNC(): Promise<VNCResult> {
    try {
      await execAsync('pkill -f x11vnc').catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const vncCommand = 'x11vnc -display :0 -auth guess -shared -forever -rfbport 5909 -passwd mithrandir -noxdamage';
      exec(vncCommand);
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      const vncStatus = await this.checkVNCStatus();
      
      return {
        status: vncStatus.running ? 'success' : 'error',
        message: vncStatus.running ? 'VNC started successfully' : 'VNC failed to start - check X11 display',
        vnc_running: vncStatus.running,
        vnc_pid: vncStatus.pid,
        timestamp: new Date().toISOString(),
        port: 5909
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Failed to start VNC: ${error}`,
        vnc_running: false,
        vnc_pid: null,
        timestamp: new Date().toISOString()
      };
    }
  }

  private async checkSSHStatus(): Promise<boolean> {
    try {
      // ⚠️ DEPRECATED: Using 'sudo' for status checks is unnecessary and a security risk.
      // TODO: Use 'systemctl --user' or non-privileged methods for status checks.
      const { stdout } = await execAsync('sudo systemctl is-active ssh');
      return stdout.trim() === 'active';
    } catch (error) {
      console.error('SSH status check failed:', error); // Log error for debugging
      return false;
    }
  }

  private async checkVNCStatus(): Promise<{ running: boolean; pid: string | null }> {
    try {
      const { stdout } = await execAsync('pgrep x11vnc');
      const pid = stdout.trim();
      return {
        running: !!pid,
        pid: pid || null
      };
    } catch {
      return { running: false, pid: null };
    }
  }

  private async getUptime(): Promise<string> {
    try {
      const { stdout } = await execAsync('uptime');
      return stdout.trim();
    } catch {
      return 'Unknown';
    }
  }
}
