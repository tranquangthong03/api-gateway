import { env } from '../config/env.js';

export const RETRYABLE_ERROR_TYPES = new Set([
  'timeout',
  'network_error',
  'rate_limited',
  'server_error',
]);

export const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function executeWithRetry(
  fn,
  { maxRetries = env.PROVIDER_MAX_RETRIES, initialDelayMs = 100, sleepFn = defaultSleep } = {},
) {
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err?.errorType && RETRYABLE_ERROR_TYPES.has(err.errorType);

      if (!isRetryable || attempt >= maxRetries) {
        err.totalAttempts = attempt + 1;
        err.retryCount = attempt;
        throw err;
      }

      attempt += 1;

      // Exponential backoff with full jitter
      const expDelay = initialDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * expDelay;
      const delay = Math.round(expDelay + jitter);

      await sleepFn(delay);
    }
  }
}
