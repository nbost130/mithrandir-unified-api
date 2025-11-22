import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
export class UnifiedSystemService {
    static instance;
    static getInstance() {
        if (!UnifiedSystemService.instance) {
            UnifiedSystemService.instance = new UnifiedSystemService();
        }
        return UnifiedSystemService.instance;
    }
    // Failsafe API Methods
    async getSystemStatus() {
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
                api_name: 'Mithrandir Unified API (TypeScript)',
                version: '2.0.0',
                node_version: process.version,
                memory_usage: {
                    rss: Math.round(memoryUsage.rss / 1024 / 1024),
                    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024)
                }
            };
        }
        catch (error) {
            throw new Error(`Failed to get system status: ${error}`);
        }
    }
    async restartSSH() {
        const startTime = Date.now();
        try {
            const { stderr: restartError } = await execAsync('sudo systemctl restart ssh');
            const { stdout: serviceStatus } = await execAsync('sudo systemctl status ssh --no-pager');
            const duration = Date.now() - startTime;
            return {
                status: restartError ? 'error' : 'success',
                restart_output: restartError || 'SSH restarted successfully',
                service_status: serviceStatus,
                timestamp: new Date().toISOString(),
                duration_ms: duration
            };
        }
        catch (error) {
            return {
                status: 'error',
                restart_output: `Failed to restart SSH: ${error}`,
                service_status: '',
                timestamp: new Date().toISOString(),
                duration_ms: Date.now() - startTime
            };
        }
    }
    async startVNC() {
        try {
            await execAsync('pkill -f x11vnc').catch(() => { });
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
        }
        catch (error) {
            return {
                status: 'error',
                message: `Failed to start VNC: ${error}`,
                vnc_running: false,
                vnc_pid: null,
                timestamp: new Date().toISOString()
            };
        }
    }
    // Monitoring API Methods
    async getMonitoringStatus() {
        try {
            const [sshStatus, vncStatus, dockerStatus] = await Promise.all([
                this.checkSSHStatus(),
                this.checkVNCStatus(),
                this.checkDockerStatus()
            ]);
            const services = {
                ssh: sshStatus,
                vnc: vncStatus.running,
                docker: dockerStatus,
                system: true
            };
            const healthyServices = Object.values(services).filter(Boolean).length;
            const totalServices = Object.keys(services).length;
            const healthPercentage = Math.round((healthyServices / totalServices) * 100);
            return {
                status: healthPercentage >= 75 ? 'operational' : healthPercentage >= 50 ? 'degraded' : 'down',
                timestamp: new Date().toISOString(),
                health_percentage: healthPercentage,
                services
            };
        }
        catch (error) {
            return {
                status: 'down',
                timestamp: new Date().toISOString(),
                health_percentage: 0,
                services: { ssh: false, vnc: false, docker: false, system: false }
            };
        }
    }
    async getHealthCheck() {
        try {
            const monitoringStatus = await this.getMonitoringStatus();
            return {
                status: monitoringStatus.health_percentage >= 75 ? 'healthy' : 'unhealthy',
                uptime: process.uptime(),
                version: '2.0.0',
                timestamp: new Date().toISOString(),
                monitoring_available: true,
                overall_health: monitoringStatus.health_percentage >= 75 ? 'healthy' :
                    monitoringStatus.health_percentage >= 50 ? 'degraded' : 'unhealthy',
                health_percentage: monitoringStatus.health_percentage,
                checks: monitoringStatus.services
            };
        }
        catch (error) {
            return {
                status: 'unhealthy',
                uptime: process.uptime(),
                version: '2.0.0',
                timestamp: new Date().toISOString(),
                monitoring_available: false,
                overall_health: 'unhealthy',
                health_percentage: 0,
                checks: { ssh: false, vnc: false, system: false, docker: false }
            };
        }
    }
    async getPrometheusMetrics() {
        try {
            const [sshStatus, vncStatus] = await Promise.all([
                this.checkSSHStatus(),
                this.checkVNCStatus()
            ]);
            const memoryUsage = process.memoryUsage();
            const uptime = process.uptime();
            const metrics = [
                '# HELP unified_api_up API availability',
                '# TYPE unified_api_up gauge',
                'unified_api_up 1',
                '',
                '# HELP unified_api_health_score Health score',
                '# TYPE unified_api_health_score gauge',
                'unified_api_health_score 100',
                '',
                '# HELP unified_api_version_info Version info',
                '# TYPE unified_api_version_info gauge',
                'unified_api_version_info{version="2.0.0"} 1',
                '',
                '# HELP ssh_service_up SSH service status',
                '# TYPE ssh_service_up gauge',
                `ssh_service_up ${sshStatus ? 1 : 0}`,
                '',
                '# HELP vnc_service_up VNC service status',
                '# TYPE vnc_service_up gauge',
                `vnc_service_up ${vncStatus.running ? 1 : 0}`,
                '',
                '# HELP system_memory_usage_bytes Memory usage in bytes',
                '# TYPE system_memory_usage_bytes gauge',
                `system_memory_usage_bytes ${memoryUsage.rss}`,
                '',
                '# HELP system_uptime_seconds System uptime in seconds',
                '# TYPE system_uptime_seconds gauge',
                `system_uptime_seconds ${uptime}`
            ];
            return metrics.join('\n') + '\n';
        }
        catch (error) {
            return '# Error generating metrics\n';
        }
    }
    // Private helper methods
    async checkSSHStatus() {
        try {
            const { stdout } = await execAsync('sudo systemctl is-active ssh');
            return stdout.trim() === 'active';
        }
        catch {
            return false;
        }
    }
    async checkVNCStatus() {
        try {
            const { stdout } = await execAsync('pgrep x11vnc');
            const pid = stdout.trim();
            return {
                running: !!pid,
                pid: pid || null
            };
        }
        catch {
            return { running: false, pid: null };
        }
    }
    async checkDockerStatus() {
        try {
            const { stdout } = await execAsync('docker info');
            return stdout.includes('Server Version');
        }
        catch {
            return false;
        }
    }
    async getUptime() {
        try {
            const { stdout } = await execAsync('uptime');
            return stdout.trim();
        }
        catch {
            return 'Unknown';
        }
    }
    // Transcription Project Management Methods
    async getTranscriptionProjects() {
        try {
            // Get all jobs from the transcription dashboard endpoint
            const dashboardData = await this.getTranscriptionDashboard();
            if (!dashboardData.recentJobs && !dashboardData.orbisJobs) {
                return { projects: [], timestamp: new Date().toISOString() };
            }
            // Combine all jobs
            const allJobs = [
                ...(dashboardData.recentJobs || []),
                ...(dashboardData.orbisJobs || [])
            ];
            // Group jobs by project (extract folder name from fileName)
            const projectMap = new Map();
            let jobIndex = 0;
            allJobs.forEach(job => {
                if (jobIndex < 3) {
                    console.log(`DEBUG: Job ${jobIndex} - ${job.fileName}`);
                    console.log(`DEBUG: Job ${jobIndex} elapsed time:`, job.elapsedSeconds, job.elapsedFormatted);
                    console.log(`DEBUG: Job ${jobIndex} keys:`, Object.keys(job));
                }
                jobIndex++;
                
                const projectName = this.extractProjectName(job.fileName, job.filePath);
                if (!projectMap.has(projectName)) {
                    projectMap.set(projectName, {
                        name: projectName,
                        totalFiles: 0,
                        completed: 0,
                        processing: 0,
                        pending: 0,
                        failed: 0,
                        files: []
                    });
                }
                const project = projectMap.get(projectName);
                project.totalFiles++;
                project[job.status]++;
                
                const mappedJob = {
                    id: job.id,
                    fileName: job.fileName,
                    status: job.status,
                    createdAt: job.createdAt,
                    completedAt: job.completedAt,
                    startedAt: job.startedAt,
                    error: job.error,
                    fileSize: job.fileSize,
                    outputPath: job.outputPath,
                    elapsedSeconds: job.elapsedSeconds,
                    elapsedFormatted: job.elapsedFormatted,
                    processingSeconds: job.processingSeconds,
                    processingFormatted: job.processingFormatted
                };
                
                if (jobIndex <= 3) {
                    console.log(`DEBUG: Mapped job ${jobIndex-1} elapsed time:`, mappedJob.elapsedSeconds, mappedJob.elapsedFormatted);
                }
                
                project.files.push(mappedJob);
            });
            // Convert map to array and sort by project name
            const projects = Array.from(projectMap.values()).sort((a, b) => a.name.localeCompare(b.name));
            
            // DEBUG: Check final data before return
            console.log('DEBUG: Final projects count:', projects.length);
            if (projects.length > 0 && projects[0].files.length > 0) {
                const firstProject = projects[0];
                const firstFile = firstProject.files[0];
                console.log('DEBUG: First project name:', firstProject.name);
                console.log('DEBUG: First file name:', firstFile.fileName);
                console.log('DEBUG: First file elapsed time:', firstFile.elapsedSeconds, firstFile.elapsedFormatted);
                console.log('DEBUG: First file keys:', Object.keys(firstFile));
            }
            
            return {
                projects,
                timestamp: new Date().toISOString()
            };
        }
        catch (error) {
            throw new Error(`Failed to get transcription projects: ${error}`);
        }
    }
    async retryTranscriptionJob(jobId) {
        try {
            const { default: Redis } = await import('ioredis');
            const { Queue } = await import('bullmq');
            
            const redis = new Redis({ host: 'localhost', port: 6379 });
            const queue = new Queue('transcription', { connection: redis });
            
            const job = await queue.getJob(jobId);
            if (!job) {
                await redis.disconnect();
                return { status: 'error', message: 'Job not found', jobId };
            }
            
            await job.retry();
            await redis.disconnect();
            
            return { status: 'success', message: 'Job retried successfully', jobId };
        } catch (error) {
            return { status: 'error', message: error.message, jobId };
        }
    }
    async getTranscriptionJobDetails(jobId) {
        try {
            const { default: Redis } = await import('ioredis');
            const { Queue } = await import('bullmq');
            
            const redis = new Redis({ host: 'localhost', port: 6379 });
            const queue = new Queue('transcription', { connection: redis });
            
            const job = await queue.getJob(jobId);
            if (!job) {
                await redis.disconnect();
                return { error: 'Job not found' };
            }
            
            const jobDetails = this.mapBullMQJobToDashboard(job);
            await redis.disconnect();
            
            return { ...jobDetails, timestamp: new Date().toISOString() };
        } catch (error) {
            return { error: error.message };
        }
    }
    async getTranscriptionDashboard() {
        try {
            // Use dynamic imports for ES modules
            const { default: Redis } = await import('ioredis');
            const { Queue } = await import('bullmq');
            
            const redis = new Redis({
                host: 'localhost',
                port: 6379,
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
            });
            
            const queue = new Queue('transcription', { connection: redis });
            
            // Get all jobs from BullMQ
            const [waiting, active, completed, failed] = await Promise.all([
                queue.getJobs(['waiting'], 0, 1000),
                queue.getJobs(['active'], 0, 100),
                queue.getJobs(['completed'], 0, 1000),
                queue.getJobs(['failed'], 0, 1000),
            ]);
            
            const allJobs = [...waiting, ...active, ...completed, ...failed];
            console.log('DEBUG: Retrieved', allJobs.length, 'jobs from BullMQ');
            
            // Map BullMQ jobs to dashboard format
            const dashboardJobs = allJobs.map(job => this.mapBullMQJobToDashboard(job));
            
            // Separate recent jobs and Orbis jobs
            const recentJobs = dashboardJobs;
            const orbisJobs = dashboardJobs.filter(job => 
                job.filePath?.includes('Orbis') || 
                job.fileName?.includes('LESSON') || 
                job.fileName?.includes('Orbis')
            );
            
            await redis.disconnect();
            
            return { recentJobs, orbisJobs };
            
        } catch (error) {
            console.log('DEBUG: getTranscriptionDashboard error:', error.message);
            return { recentJobs: [], orbisJobs: [] };
        }
    }
    extractProjectName(fileName, filePath) {
        // Extract project name from file path (preferred) or file name (fallback)
        if (filePath) {
            // Extract from actual folder structure
            const pathParts = filePath.split('/');
            // Path structure: /mnt/data/whisper-batch/inbox/FOLDER/[SUBFOLDER]/file
            if (pathParts.length > 5) {
                const folderIndex = 5; // Index of main folder after inbox/
                const mainFolder = pathParts[folderIndex];
                // Handle subfolders for better organization
                if (pathParts.length > 6 && pathParts[6]) {
                    const subFolder = pathParts[6];
                    // Special handling for Orbis Ministries structure
                    if (mainFolder === 'Orbis Ministries') {
                        if (subFolder === 'Advanced' && pathParts.length > 7) {
                            return `Orbis Ministries - ${pathParts[7]}`;
                        }
                        else if (subFolder === 'Intermediate' && pathParts.length > 7) {
                            return `Orbis Ministries - ${pathParts[7]}`;
                        }
                        else if (subFolder.startsWith('Basic') || subFolder.startsWith('Kingdom') || subFolder.startsWith('The Holy')) {
                            return `Orbis Ministries - ${subFolder}`;
                        }
                    }
                    // For other folders with subfolders, combine them
                    return `${mainFolder} - ${subFolder}`;
                }
                // Return main folder name
                return mainFolder;
            }
        }
        // Fallback to filename-based extraction for files without proper paths
        if (fileName.includes('Orbis') || fileName.includes('LESSON')) {
            return 'Orbis School of Ministry';
        }
        if (fileName.includes('Healing is Here')) {
            return 'Healing is Here 2025';
        }
        if (fileName.includes('Healing NOW')) {
            return 'Healing NOW - Livestreams';
        }
        // For other files, try to extract the first part before a dash or common separator
        const separators = [' - ', '-', '–', '—'];
        for (const sep of separators) {
            if (fileName.includes(sep)) {
                return fileName.split(sep)[0].trim();
            }
        }
        // If no separator found, use the first few words
        const words = fileName.replace(/\.[^/.]+$/, '').split(' ');
        return words.slice(0, Math.min(4, words.length)).join(' ');
    }
    // Legacy endpoint methods for existing dashboard compatibility
    async getTranscriptionDashboardLegacy() {
        try {
            const dashboardData = await this.getTranscriptionDashboard();
            // Get stats
            const allJobs = [
                ...(dashboardData.recentJobs || []),
                ...(dashboardData.orbisJobs || [])
            ];
            const stats = {
                pending: allJobs.filter(job => job.status === 'pending').length,
                processing: allJobs.filter(job => job.status === 'processing').length,
                completed: allJobs.filter(job => job.status === 'completed').length,
                failed: allJobs.filter(job => job.status === 'failed').length,
                totalFiles: allJobs.length,
                activeWorkers: 2, // Default value
                systemHealth: allJobs.filter(job => job.status === 'failed').length > 5 ? 'warning' : 'healthy'
            };
            return {
                status: {
                    serviceRunning: true,
                    systemdActive: true,
                    workers: 2,
                    uptime: "0h 5m",
                    lastActivity: "Available via stats endpoint"
                },
                stats,
                recentJobs: dashboardData.recentJobs || [],
                orbisJobs: dashboardData.orbisJobs || [],
                timestamp: new Date().toISOString()
            };
        }
        catch (error) {
            return {
                status: {
                    serviceRunning: false,
                    systemdActive: false,
                    workers: 0,
                    uptime: "Unknown",
                    lastActivity: "Error"
                },
                stats: {
                    pending: 0,
                    processing: 0,
                    completed: 0,
                    failed: 0,
                    totalFiles: 0,
                    activeWorkers: 0,
                    systemHealth: 'error'
                },
                recentJobs: [],
                orbisJobs: [],
                timestamp: new Date().toISOString()
            };
        }
    }
    async getSystemStatusLegacy() {
        try {
            const [sshStatus, uptime] = await Promise.all([
                this.checkSSHStatus(),
                this.getUptime()
            ]);
            const load = await this.getLoadAverage();
            return {
                status: sshStatus ? 'healthy' : 'error',
                message: sshStatus ? 'All services running' : 'Critical services are not running',
                timestamp: new Date().toISOString(),
                details: {
                    ssh: sshStatus,
                    services: sshStatus ? ['ssh'] : [],
                    uptime: uptime,
                    load: load
                }
            };
        }
        catch (error) {
            return {
                status: 'error',
                message: 'Failed to get system status',
                timestamp: new Date().toISOString(),
                details: {
                    ssh: false,
                    services: [],
                    uptime: 'Unknown',
                    load: [0, 0, 0]
                }
            };
        }
    }
    async getMonitoringMetricsLegacy() {
        try {
            const memoryUsage = process.memoryUsage();
            const uptime = process.uptime();
            return {
                cpu: {
                    usage: 25.5, // Mock data
                    cores: 4
                },
                memory: {
                    used: Math.round(memoryUsage.rss / 1024 / 1024),
                    total: 8192,
                    percentage: Math.round((memoryUsage.rss / 1024 / 1024 / 8192) * 100)
                },
                disk: {
                    used: 37,
                    total: 699,
                    percentage: Math.round((37 / 699) * 100)
                },
                network: {
                    rx: 1024,
                    tx: 512
                },
                processes: 156,
                uptime: Math.round(uptime),
                timestamp: new Date().toISOString()
            };
        }
        catch (error) {
            return {
                cpu: { usage: 0, cores: 0 },
                memory: { used: 0, total: 0, percentage: 0 },
                disk: { used: 0, total: 0, percentage: 0 },
                network: { rx: 0, tx: 0 },
                processes: 0,
                uptime: 0,
                timestamp: new Date().toISOString()
            };
        }
    }
    async getLoadAverage() {
        try {
            const { stdout } = await execAsync('uptime');
            const loadMatch = stdout.match(/load average: ([\d.]+), ([\d.]+), ([\d.]+)/);
            if (loadMatch) {
                return [
                    parseFloat(loadMatch[1]),
                    parseFloat(loadMatch[2]),
                    parseFloat(loadMatch[3])
                ];
            }
            return [0, 0, 0];
        }
        catch {
            return [0, 0, 0];
        }
    }

    mapBullMQJobToDashboard(job) {
        const now = Date.now();
        const createdAt = job.timestamp || now;
        const startedAt = job.processedOn;
        const completedAt = job.finishedOn;

        // Calculate elapsed time
        const elapsedSeconds = Math.floor((now - createdAt) / 1000);
        const processingSeconds = startedAt ? Math.floor((now - startedAt) / 1000) : null;

        // Format durations
        const formatDuration = (seconds) => {
            if (!seconds || seconds < 0) return null;
            if (seconds < 60) return `${seconds}s`;
            if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            return `${hours}h ${minutes}m ${secs}s`;
        };

        // Map BullMQ status to dashboard status
        let status = 'pending';
        if (job.finishedOn) {
            status = job.failedReason ? 'failed' : 'completed';
        } else if (job.processedOn && !job.finishedOn) {
            status = 'processing';
        }

        return {
            id: job.id,
            fileName: job.data?.fileName || 'Unknown',
            filePath: job.data?.filePath || '',
            fileSize: job.data?.fileSize || 0,
            status,
            createdAt: new Date(createdAt).toISOString(),
            startedAt: startedAt ? new Date(startedAt).toISOString() : null,
            completedAt: completedAt ? new Date(completedAt).toISOString() : null,
            error: job.failedReason || null,
            outputPath: job.returnvalue?.transcriptPath || null,
            elapsedSeconds,
            elapsedFormatted: formatDuration(elapsedSeconds),
            processingSeconds,
            processingFormatted: formatDuration(processingSeconds)
        };
    }
}
