// Load environment variables BEFORE any other imports
import dotenv from 'dotenv';
dotenv.config();
// Validate configuration before starting server
import { getConfig } from './config/validation.js';
const config = getConfig(); // This will validate and exit if config is invalid
import { createServer } from './server.js';
const PORT = config.PORT;
const HOST = config.HOST;
async function start() {
    try {
        const fastify = await createServer();
        await fastify.listen({ port: PORT, host: HOST });
        fastify.log.info(`🚀 Mithrandir Unified API Gateway started on http://${HOST}:${PORT}`);
        fastify.log.info('📋 Available endpoints:');
        fastify.log.info('  Health & Info:');
        fastify.log.info('    GET  /health - Health check');
        fastify.log.info('    GET  /info - API information');
        fastify.log.info('  Dashboard:');
        fastify.log.info('    GET  /api/dashboard/stats - Dashboard statistics');
        fastify.log.info('    GET  /api/dashboard/activity - Recent activity');
        fastify.log.info('    GET  /api/dashboard/trends - Trend data');
        fastify.log.info('  Transcription (Proxy to Palantir):');
        fastify.log.info('    GET  /transcription/jobs - List jobs');
        fastify.log.info('    POST /transcription/jobs - Create job');
        fastify.log.info('    GET  /transcription/jobs/:id - Get job');
        fastify.log.info('    PUT  /transcription/jobs/:id - Update job');
        fastify.log.info('    PATCH /transcription/jobs/:id - Partial update');
        fastify.log.info('    DELETE /transcription/jobs/:id - Delete job');
        fastify.log.info('    POST /transcription/jobs/:id/retry - Retry job');
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}
start();
//# sourceMappingURL=index.js.map