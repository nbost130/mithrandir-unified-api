// src/modules/services/services.service.ts

/**
 * @fileoverview Business logic for the services module.
 */

export async function getRegisteredServices() {
  // In a real application, this data would come from a service registry
  // or a configuration file.
  return [
    {
      id: 'transcription-palantir',
      name: 'Transcription Palantir',
      type: 'api',
      healthEndpoint: 'http://100.77.230.53:9003/health',
      registeredAt: new Date().toISOString(),
      metadata: {
        description: 'Manages transcription jobs',
      },
    },
  ];
}
