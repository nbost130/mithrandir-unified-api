import { fastify } from './server.js';
const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
async function start() {
    try {
        await fastify.listen({ port: PORT, host: HOST });
        fastify.log.info(`🚀 Mithrandir Unified API started on http://${HOST}:${PORT}`);
        fastify.log.info('📋 Available endpoints:');
        fastify.log.info('  === Failsafe API (Legacy Port 8888 functionality) ===');
        fastify.log.info('  GET  /ssh-status - System status');
        fastify.log.info('  GET  /status - Legacy alias');
        fastify.log.info('  POST /restart-ssh - Restart SSH service');
        fastify.log.info('  POST /start-vnc - Start VNC server');
        fastify.log.info('  === Monitoring API (Original Port 8080 functionality) ===');
        fastify.log.info('  GET  /metrics - Prometheus metrics');
        fastify.log.info('  GET  /monitoring/status - Monitoring status');
        fastify.log.info('  GET  /monitoring/health - Health check');
        fastify.log.info('  GET  /health - Health check alias');
        fastify.log.info('  === System API ===');
        fastify.log.info('  GET  /info - API information');
        fastify.log.info('  GET  /docs - Swagger documentation');
        fastify.log.info('');
        fastify.log.info('🎉 Unified API combining:');
        fastify.log.info('  - Failsafe operations (SSH, VNC management)');
        fastify.log.info('  - System monitoring (Prometheus metrics)');
        fastify.log.info('  - Health checks and status reporting');
        fastify.log.info('  - Professional security and documentation');
    }
    catch (error) {
        fastify.log.error({ error }, 'Failed to start server');
        process.exit(1);
    }
}
start();
