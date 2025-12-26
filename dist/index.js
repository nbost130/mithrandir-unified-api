import { fastify } from './server.js';
const PORT = parseInt(process.env.PORT || '8889', 10);
const HOST = process.env.HOST || '0.0.0.0';
async function start() {
    try {
        await fastify.listen({ port: PORT, host: HOST });
        fastify.log.info(`🚀 Mithrandir Failsafe API (TypeScript) started on http://${HOST}:${PORT}`);
        fastify.log.info('📋 Available endpoints:');
        fastify.log.info('  GET  /health - Health check');
        fastify.log.info('  GET  /ssh-status - System status');
        fastify.log.info('  GET  /status - Legacy alias');
        fastify.log.info('  POST /restart-ssh - Restart SSH');
        fastify.log.info('  POST /start-vnc - Start VNC');
        fastify.log.info('  GET  /info - API information');
    }
    catch (error) {
        fastify.log.error({ error }, 'Failed to start server');
        process.exit(1);
    }
}
start();
//# sourceMappingURL=index.js.map