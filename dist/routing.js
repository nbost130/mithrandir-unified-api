// Unified API Routing Implementation - Phase 3
// This module implements HTTP client routing to microservices

import axios from 'axios';

// HTTP clients for each service
const coreServiceClient = axios.create({
  baseURL: 'http://localhost:9002',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

const transcriptionServiceClient = axios.create({
  baseURL: 'http://localhost:9003',
  timeout: 30000, // Longer timeout for transcription operations
  headers: {
    'Content-Type': 'application/json'
  }
});

// Service availability tracking
let coreServiceAvailable = false;
let transcriptionServiceAvailable = false;

// Health check functions
async function checkCoreService() {
  try {
    await coreServiceClient.get('/api/health');
    coreServiceAvailable = true;
  } catch (error) {
    coreServiceAvailable = false;
  }
}

async function checkTranscriptionService() {
  try {
    await transcriptionServiceClient.get('/');
    transcriptionServiceAvailable = true;
  } catch (error) {
    transcriptionServiceAvailable = false;
  }
}

// Periodic health checks
setInterval(async () => {
  await Promise.all([
    checkCoreService(),
    checkTranscriptionService()
  ]);
}, 30000); // Check every 30 seconds

// Initial health check
checkCoreService();
checkTranscriptionService();

// Core service routing functions
async function routeToCoreService(endpoint, method = 'GET', data = null, fastify) {
  try {
    if (!coreServiceAvailable) {
      throw new Error('Core service unavailable');
    }

    const config = {
      method: method.toLowerCase(),
      url: `/api${endpoint}`,
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.data = data;
    }

    const response = await coreServiceClient.request(config);
    fastify.log.info(`Routed ${method} ${endpoint} to mithrandir-core service`);
    return response.data;
  } catch (error) {
    fastify.log.warn(`mithrandir-core routing failed for ${endpoint}: ${error.message}`);
    throw error;
  }
}

// Transcription service routing functions
async function routeToTranscriptionService(endpoint, method = 'GET', data = null, fastify) {
  try {
    if (!transcriptionServiceAvailable) {
      throw new Error('Transcription service unavailable');
    }

    const config = {
      method: method.toLowerCase(),
      url: `/api/v1${endpoint}`,
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.data = data;
    }

    const response = await transcriptionServiceClient.request(config);
    fastify.log.info(`Routed ${method} ${endpoint} to transcription-palantir service`);
    return response.data;
  } catch (error) {
    fastify.log.warn(`transcription-palantir routing failed for ${endpoint}: ${error.message}`);
    throw error;
  }
}

// Service status getter functions
function isCoreServiceAvailable() {
  return coreServiceAvailable;
}

function isTranscriptionServiceAvailable() {
  return transcriptionServiceAvailable;
}

// Error response helper
function createErrorResponse(endpoint, error, fallbackMessage = 'Service temporarily unavailable') {
  return {
    status: 'error',
    message: error.message || fallbackMessage,
    code: 'SERVICE_ROUTING_ERROR',
    timestamp: new Date().toISOString(),
    endpoint: endpoint,
    fallback_available: true
  };
}

// Service info aggregator
async function getServicesInfo() {
  const services = {
    'mithrandir-core': {
      available: coreServiceAvailable,
      port: 9002,
      endpoints: [
        'GET /ssh-status - SSH and system status',
        'POST /restart-ssh - Emergency SSH restart',
        'POST /start-vnc - Start VNC server',
        'GET /metrics - System metrics'
      ]
    },
    'transcription-palantir': {
      available: transcriptionServiceAvailable,
      port: 9003,
      endpoints: [
        'GET /projects - List transcription projects',
        'POST /jobs/:jobId/retry - Retry failed job',
        'GET /jobs/:jobId - Get job details'
      ]
    }
  };

  return {
    routing_enabled: true,
    services: services,
    health_check_interval: '30s',
    timestamp: new Date().toISOString()
  };
}

export {
  routeToCoreService,
  routeToTranscriptionService,
  isCoreServiceAvailable,
  isTranscriptionServiceAvailable,
  createErrorResponse,
  getServicesInfo
};
