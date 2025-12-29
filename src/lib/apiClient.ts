import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import CircuitBreaker from 'opossum';
import { FastifyBaseLogger } from 'fastify';
import { AppConfig } from '../config/validation.js';

/**
 * Checks if an error is a transient failure that warrants a retry.
 * This includes network errors or 5xx server errors.
 */
function isRetryableError(error: AxiosError): boolean {
  // Retry on network errors or 5xx status codes
  return (
    !error.response || // Network error (e.g., ECONNRESET)
    (error.response.status >= 500 && error.response.status <= 599)
  );
}

/**
 * Factory function to create a resilient API client.
 *
 * @param config - The application configuration.
 * @param logger - The Fastify logger instance for observability.
 * @returns An Axios instance configured with retry and circuit breaker logic.
 */
export function createApiClient(config: AppConfig, logger: FastifyBaseLogger): AxiosInstance {
  const axiosInstance = axios.create({
    baseURL: config.TRANSCRIPTION_API_URL,
    timeout: config.CLIENT_TIMEOUT_MS,
  });

  // 1. Configure Retry Logic with axios-retry
  axiosRetry(axiosInstance, {
    retries: config.CLIENT_RETRY_COUNT,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: isRetryableError,
    onRetry: (retryCount, error, requestConfig) => {
      logger.warn(
        {
          retryCount,
          url: requestConfig.url,
          method: requestConfig.method,
          error: error.message,
        },
        `[ApiClient] Retrying request due to transient error. Attempt #${retryCount}...`
      );
    },
  });

  // 2. Configure Circuit Breaker with opossum
  const circuitBreakerOptions: CircuitBreaker.Options = {
    timeout: config.CLIENT_TIMEOUT_MS, // If the function takes longer than this, it's a failure
    errorThresholdPercentage: 100, // Trip after 100% of requests fail
    volumeThreshold: config.CLIENT_CIRCUIT_BREAKER_FAILURE_THRESHOLD, // Minimum number of failures to trip
    resetTimeout: config.CLIENT_CIRCUIT_BREAKER_RESET_TIMEOUT_MS, // How long to wait before trying again
  };

  const breaker = new CircuitBreaker(
    // The function to wrap
    async (requestConfig: any) => axiosInstance(requestConfig),
    circuitBreakerOptions
  );

  // 3. Add Logging for Circuit Breaker Events
  breaker.on('open', () => logger.error('[ApiClient-CircuitBreaker] Circuit is now OPEN. All requests will fail fast.'));
  breaker.on('halfOpen', () => logger.warn('[ApiClient-CircuitBreaker] Circuit is now HALF-OPEN. The next request will test the service.'));
  breaker.on('close', () => logger.info('[ApiClient-CircuitBreaker] Circuit is now CLOSED. Service is healthy.'));
  breaker.on('failure', (result, err) => logger.error({ err, result }, '[ApiClient-CircuitBreaker] Request failed, recorded by circuit breaker.'));

  // 4. Override axios methods to use the circuit breaker
  // We create a Proxy to transparently wrap all axios methods with the breaker.
  const resilientClient = new Proxy(axiosInstance, {
    get(target, propKey: keyof AxiosInstance) {
      // We only want to wrap the core request methods
      const methodsToWrap = ['request', 'get', 'delete', 'head', 'options', 'post', 'put', 'patch'];

      if (typeof propKey === 'string' && methodsToWrap.includes(propKey)) {
        // Return a function that captures all arguments
        return (...args: any[]) => {
          logger.info(`[ApiClient] Firing request via circuit breaker for method: ${propKey}`);

          // The opossum breaker is wrapping `axiosInstance(requestConfig)`.
          // We must convert the various method signatures to a single `requestConfig` object.
          let requestConfig: any;

          if (propKey === 'request') {
            // axios.request(config)
            requestConfig = args[0];
          } else if (['get', 'delete', 'head', 'options'].includes(propKey)) {
            // axios.get(url, config?)
            requestConfig = {
              url: args[0],
              method: propKey,
              ...args[1] // Merge additional config (params, headers, etc.)
            };
          } else {
            // axios.post(url, data?, config?)
            // axios.put(url, data?, config?)
            // axios.patch(url, data?, config?)
            requestConfig = {
              url: args[0],
              method: propKey,
              data: args[1],
              ...args[2] // Merge additional config (params, headers, etc.)
            };
          }

          // The `fire` method of the breaker calls our wrapped axios instance
          return breaker.fire(requestConfig);
        };
      }

      // Return other properties (like 'interceptors', 'defaults') directly
      return Reflect.get(target, propKey);
    },
  }) as AxiosInstance;

  return resilientClient;
}
