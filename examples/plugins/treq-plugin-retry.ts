/**
 * Example: Retry Plugin
 *
 * This plugin demonstrates:
 * - Using response.after hook to inspect responses
 * - Signaling retries via output.retry
 * - Error hook for network failures
 * - Exponential backoff with jitter
 *
 * Usage in treq.config.ts:
 * ```typescript
 * import { defineConfig } from '@t-req/core';
 * import retryPlugin from './examples/plugins/treq-plugin-retry';
 *
 * export default defineConfig({
 *   plugins: [
 *     retryPlugin({
 *       maxRetries: 3,
 *       retryOn: [429, 500, 502, 503, 504],
 *       backoff: 'exponential',
 *       baseDelayMs: 1000,
 *     }),
 *   ],
 * });
 * ```
 */

import { definePlugin } from '@t-req/core';

export interface RetryPluginOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** HTTP status codes that trigger retry (default: [429, 500, 502, 503, 504]) */
  retryOn?: number[];
  /** Backoff strategy (default: 'exponential') */
  backoff?: 'constant' | 'linear' | 'exponential';
  /** Base delay in milliseconds (default: 1000) */
  baseDelayMs?: number;
  /** Add random jitter to delay (default: true) */
  jitter?: boolean;
  /** Network error codes that trigger retry */
  retryOnNetworkErrors?: string[];
}

export default function retryPlugin(options: RetryPluginOptions = {}) {
  const {
    maxRetries = 3,
    retryOn = [429, 500, 502, 503, 504],
    backoff = 'exponential',
    baseDelayMs = 1000,
    jitter = true,
    retryOnNetworkErrors = ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND']
  } = options;

  /**
   * Calculate delay based on backoff strategy.
   */
  function calculateDelay(attempt: number): number {
    let delay: number;

    switch (backoff) {
      case 'constant':
        delay = baseDelayMs;
        break;
      case 'linear':
        delay = baseDelayMs * attempt;
        break;
      case 'exponential':
      default:
        delay = baseDelayMs * 2 ** (attempt - 1);
        break;
    }

    // Add jitter (0-10% of delay)
    if (jitter) {
      delay += Math.random() * delay * 0.1;
    }

    return Math.round(delay);
  }

  /**
   * Parse Retry-After header value.
   * Can be either a number of seconds or an HTTP date.
   */
  function parseRetryAfter(value: string | null): number | null {
    if (!value) return null;

    // Try as number of seconds
    const seconds = parseInt(value, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }

    // Try as HTTP date
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      const delayMs = date.getTime() - Date.now();
      return delayMs > 0 ? delayMs : null;
    }

    return null;
  }

  return definePlugin({
    name: 'treq-plugin-retry',
    version: '1.0.0',

    // No special permissions needed
    permissions: [],

    hooks: {
      /**
       * Check response status and signal retry if needed.
       */
      async 'response.after'(input, output) {
        const { response, ctx } = input;

        // Check if status is retryable
        if (!retryOn.includes(response.status)) {
          return;
        }

        // Check if we've exceeded max retries
        if (ctx.retries >= maxRetries) {
          return;
        }

        // Check for Retry-After header (common with 429)
        const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
        const delay = retryAfter ?? calculateDelay(ctx.retries + 1);

        // Signal retry
        output.retry = {
          delayMs: delay,
          reason: `HTTP ${response.status}`
        };
      },

      /**
       * Handle network errors and signal retry if appropriate.
       */
      async error(input, output) {
        const { error, ctx } = input;

        // Check if error is retryable
        const errorCode = (error as Error & { code?: string }).code;
        if (!errorCode || !retryOnNetworkErrors.includes(errorCode)) {
          return;
        }

        // Check if we've exceeded max retries
        if (ctx.retries >= maxRetries) {
          return;
        }

        const delay = calculateDelay(ctx.retries + 1);

        // Signal retry
        output.retry = {
          delayMs: delay,
          reason: errorCode
        };
      }
    }
  });
}
