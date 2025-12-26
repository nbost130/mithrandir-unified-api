import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import { SystemService } from './services.js';
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
// Rate limiting
await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '15 minutes',
    errorResponseBuilder: (request, context) => ({
        status: 'error',
        message: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        timestamp: new Date().toISOString(),
        retryAfter: context.ttl
    })
});
const systemService = SystemService.getInstance();
// Health check endpoint
fastify.get('/health', async (request, reply) => {
    const startTime = Date.now();
    try {
        const status = await systemService.getSystemStatus();
        const healthCheck = {
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
    }
    catch (error) {
        const errorResponse = {
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
fastify.get('/ssh-status', async (request, reply) => {
    try {
        const status = await systemService.getSystemStatus();
        reply.code(200).send(status);
    }
    catch (error) {
        const errorResponse = {
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
fastify.get('/status', async (request, reply) => {
    return fastify.inject({
        method: 'GET',
        url: '/ssh-status'
    }).then(response => {
        reply.code(response.statusCode).send(JSON.parse(response.payload));
    });
});
// SSH Restart endpoint
fastify.post('/restart-ssh', async (request, reply) => {
    try {
        fastify.log.info('SSH restart requested');
        const result = await systemService.restartSSH();
        const statusCode = result.status === 'success' ? 200 : 500;
        reply.code(statusCode).send(result);
        fastify.log.info(`SSH restart completed: ${result.status}`);
    }
    catch (error) {
        const errorResponse = {
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
fastify.post('/start-vnc', async (request, reply) => {
    try {
        fastify.log.info('VNC start requested');
        const result = await systemService.startVNC();
        const statusCode = result.status === 'success' ? 200 : 500;
        reply.code(statusCode).send(result);
        fastify.log.info(`VNC start completed: ${result.status}`);
    }
    catch (error) {
        const errorResponse = {
            status: 'error',
            message: `Failed to start VNC: ${error}`,
            code: 'VNC_START_ERROR',
            timestamp: new Date().toISOString(),
            endpoint: '/start-vnc'
        };
        reply.code(500).send(errorResponse);
    }
});
// API Info endpoint
fastify.get('/info', async (request, reply) => {
    reply.send({
        name: 'Mithrandir Failsafe API',
        version: '2.0.0',
        description: 'TypeScript-based failsafe API for Mithrandir server management',
        framework: 'Fastify',
        node_version: process.version,
        uptime: process.uptime(),
        endpoints: [
            'GET /health - Health check',
            'GET /ssh-status - System status',
            'GET /status - Legacy alias for ssh-status',
            'POST /restart-ssh - Restart SSH service',
            'POST /start-vnc - Start VNC server',
            'GET /info - API information'
        ],
        timestamp: new Date().toISOString()
    });
});
// 404 handler
fastify.setNotFoundHandler((request, reply) => {
    const errorResponse = {
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
    const errorResponse = {
        status: 'error',
        message: error.message || 'Internal server error',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString(),
        endpoint: request.url
    };
    reply.code(500).send(errorResponse);
});
// Graceful shutdown
const gracefulShutdown = async (signal) => {
    fastify.log.info(`Received ${signal}, shutting down gracefully`);
    try {
        await fastify.close();
        process.exit(0);
    }
    catch (error) {
        fastify.log.error({ error }, 'Error during shutdown');
        process.exit(1);
    }
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
export { fastify };
//# sourceMappingURL=server.js.map