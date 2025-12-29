/**
 * Environment Configuration Validation
 *
 * This module provides centralized validation of environment variables.
 * It implements a fail-fast approach: if required variables are missing,
 * the application will exit immediately with clear error messages.
 *
 * This prevents the application from running in a misconfigured state,
 * which could lead to silent failures in production.
 */

/**
 * Defines the shape of the application's configuration.
 * This interface ensures type safety for all environment variables.
 */
export interface AppConfig {
  // Required environment variables
  TRANSCRIPTION_API_URL: string;

  // Optional environment variables with defaults
  PORT: number;
  HOST: string;
  NODE_ENV: 'development' | 'production' | 'test';
  LOG_LEVEL: string;

  // Resilience patterns for the external API client
  CLIENT_TIMEOUT_MS: number;
  CLIENT_RETRY_COUNT: number;
  CLIENT_CIRCUIT_BREAKER_FAILURE_THRESHOLD: number;
  CLIENT_CIRCUIT_BREAKER_RESET_TIMEOUT_MS: number;
}

/**
 * Holds the validated and loaded configuration for the application.
 */
let loadedConfig: AppConfig | null = null;

/**
 * Validates that a string is a valid URL.
 */
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates that all required environment variables are set and loads them.
 * If a required variable is missing or invalid, it logs descriptive errors
 * and exits the process to prevent misconfigured deployments.
 *
 * This function should be called once at application startup, after dotenv is loaded.
 *
 * @returns {AppConfig} A frozen configuration object with validated environment variables.
 */
export function validateAndLoadConfig(): AppConfig {
  if (loadedConfig) {
    return loadedConfig;
  }

  const errors: string[] = [];

  // Validate required variables
  const requiredVars = ['TRANSCRIPTION_API_URL'] as const;
  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    errors.push('❌ Missing required environment variables:');
    missingVars.forEach(varName => {
      errors.push(`   - ${varName}`);
    });
  }

  // Validate TRANSCRIPTION_API_URL format if present
  const transcriptionUrl = process.env.TRANSCRIPTION_API_URL;
  if (transcriptionUrl && !isValidUrl(transcriptionUrl)) {
    errors.push(`❌ TRANSCRIPTION_API_URL is not a valid URL: ${transcriptionUrl}`);
    errors.push('   Expected format: http://hostname:port/path or https://hostname:port/path');
  }

  // Validate and parse numeric resilience settings
  const numericVars = {
    CLIENT_TIMEOUT_MS: process.env.CLIENT_TIMEOUT_MS || '5000',
    CLIENT_RETRY_COUNT: process.env.CLIENT_RETRY_COUNT || '3',
    CLIENT_CIRCUIT_BREAKER_FAILURE_THRESHOLD: process.env.CLIENT_CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5',
    CLIENT_CIRCUIT_BREAKER_RESET_TIMEOUT_MS: process.env.CLIENT_CIRCUIT_BREAKER_RESET_TIMEOUT_MS || '30000',
  };

  const parsedNumeric: {[key: string]: number} = {};
  for (const [key, value] of Object.entries(numericVars)) {
    const num = parseInt(value, 10);
    if (isNaN(num)) {
      errors.push(`❌ ${key} is not a valid number: ${value}`);
    } else {
      parsedNumeric[key] = num;
    }
  }

  // If there are any errors, exit
  if (errors.length > 0) {
    console.error('\n╔════════════════════════════════════════════════════════════════╗');
    console.error('║ FATAL ERROR: Environment Configuration Validation Failed      ║');
    console.error('╚════════════════════════════════════════════════════════════════╝\n');
    errors.forEach(error => console.error(error));
    console.error('\n📝 To fix this:');
    console.error('   1. Create a `.env` file in the project root');
    console.error('   2. See `.env.example` for required variables');
    console.error('   3. Set all required environment variables\n');
    process.exit(1);
  }

  // Load config with defaults for optional vars
  loadedConfig = Object.freeze({
    TRANSCRIPTION_API_URL: process.env.TRANSCRIPTION_API_URL!,
    PORT: parseInt(process.env.PORT || '8889', 10),
    HOST: process.env.HOST || '0.0.0.0',
    NODE_ENV: (process.env.NODE_ENV as AppConfig['NODE_ENV']) || 'development',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    // Resilience settings
    CLIENT_TIMEOUT_MS: parsedNumeric.CLIENT_TIMEOUT_MS,
    CLIENT_RETRY_COUNT: parsedNumeric.CLIENT_RETRY_COUNT,
    CLIENT_CIRCUIT_BREAKER_FAILURE_THRESHOLD: parsedNumeric.CLIENT_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    CLIENT_CIRCUIT_BREAKER_RESET_TIMEOUT_MS: parsedNumeric.CLIENT_CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
  });

  console.log('✅ Environment configuration loaded and validated successfully.');
  console.log(`   - TRANSCRIPTION_API_URL: ${loadedConfig.TRANSCRIPTION_API_URL}`);
  console.log(`   - PORT: ${loadedConfig.PORT}`);
  console.log(`   - HOST: ${loadedConfig.HOST}`);
  console.log(`   - NODE_ENV: ${loadedConfig.NODE_ENV}`);
  console.log('   ---');
  console.log('   Resilience Settings:');
  console.log(`   - Client Timeout: ${loadedConfig.CLIENT_TIMEOUT_MS}ms`);
  console.log(`   - Client Retries: ${loadedConfig.CLIENT_RETRY_COUNT}`);
  console.log(`   - Circuit Breaker Threshold: ${loadedConfig.CLIENT_CIRCUIT_BREAKER_FAILURE_THRESHOLD} failures`);
  console.log(`   - Circuit Breaker Reset: ${loadedConfig.CLIENT_CIRCUIT_BREAKER_RESET_TIMEOUT_MS}ms`);

  return loadedConfig;
}

/**
 * Returns the loaded application configuration.
 * On first call, validates and loads the configuration.
 *
 * @returns {AppConfig} The application configuration.
 */
export function getConfig(): AppConfig {
  if (!loadedConfig) {
    return validateAndLoadConfig();
  }
  return loadedConfig;
}
