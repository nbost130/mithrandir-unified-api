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
    fastify.log.info('  System Management:');
    fastify.log.info('    GET  /health - Health check');
    fastify.log.info('    GET  /ssh-status - System status');
    fastify.log.info('    POST /restart-ssh - Restart SSH');
    fastify.log.info('    POST /start-vnc - Start VNC');
    fastify.log.info('  Dashboard:');
    fastify.log.info('    GET  /api/dashboard/stats - Dashboard statistics');
    fastify.log.info('    GET  /api/dashboard/activity - Recent activity');
    fastify.log.info('    GET  /api/dashboard/trends - Trend data');
    fastify.log.info('  Transcription (Proxy to Palantir):');
    fastify.log.info('    GET  /transcription/jobs - List jobs');
    fastify.log.info('    POST /transcription/jobs - Create job');
    fastify.log.info('    GET  /transcription/jobs/:id - Get job');
    fastify.log.info('    DELETE /transcription/jobs/:id - Delete job');
    fastify.log.info('    POST /transcription/jobs/:id/retry - Retry job');
    fastify.log.info('  Other:');
    fastify.log.info('    GET  /info - API information');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
