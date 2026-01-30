/**
 * Example: Native TypeScript Logging Plugin
 *
 * This plugin demonstrates:
 * - Using definePlugin helper
 * - Hook implementation (request.after, response.after)
 * - Event subscription
 * - Setup and teardown lifecycle
 *
 * Usage in treq.config.ts:
 * ```typescript
 * import { defineConfig } from '@t-req/core';
 * import loggingPlugin from './examples/plugins/treq-plugin-logging';
 *
 * export default defineConfig({
 *   plugins: [
 *     loggingPlugin({ verbose: true, prefix: '[API]' }),
 *   ],
 * });
 * ```
 *
 * Or load via file:// in treq.jsonc:
 * ```jsonc
 * {
 *   "plugins": [
 *     ["file://./examples/plugins/treq-plugin-logging.ts", { "verbose": true }]
 *   ]
 * }
 * ```
 */

// Use relative import for file:// loading compatibility
import { definePlugin } from '../../packages/core/src/index';

export interface LoggingPluginOptions {
  /** Show verbose output including headers */
  verbose?: boolean;
  /** Prefix for log messages */
  prefix?: string;
  /** Log to file path instead of console */
  logFile?: string;
}

export default function loggingPlugin(options: LoggingPluginOptions = {}) {
  const { verbose = false, prefix = '[treq]' } = options;

  // Track request count for the session
  let requestCount = 0;

  // Simple logger that could be extended to write to file
  function log(level: 'info' | 'warn' | 'error', message: string) {
    const timestamp = new Date().toISOString();
    const formatted = `${timestamp} ${prefix} [${level.toUpperCase()}] ${message}`;
    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  return definePlugin({
    name: 'treq-plugin-logging',
    version: '1.0.0',

    // No special permissions needed - this plugin only logs
    permissions: [],

    setup(ctx) {
      log('info', `Logging plugin initialized (verbose=${verbose})`);
      log('info', `Project root: ${ctx.projectRoot}`);
    },

    hooks: {
      // request.after is read-only - perfect for logging the final request
      async 'request.after'(input) {
        requestCount++;
        const { request, ctx } = input;

        log('info', `-> [${requestCount}] ${request.method} ${request.url}`);

        if (verbose) {
          // Log headers
          const headerEntries = Object.entries(request.headers);
          if (headerEntries.length > 0) {
            log('info', `   Headers:`);
            for (const [name, value] of headerEntries) {
              // Mask sensitive headers
              const displayValue = ['authorization', 'x-api-key', 'cookie'].includes(
                name.toLowerCase()
              )
                ? '***'
                : value;
              log('info', `     ${name}: ${displayValue}`);
            }
          }

          // Log retry info
          if (ctx.retries > 0) {
            log('info', `   Retry attempt: ${ctx.retries}/${ctx.maxRetries}`);
          }
        }
      },

      // response.after allows us to read (but not modify) the response
      async 'response.after'(input, _output) {
        const { request, response, timing } = input;

        // Determine log level based on status
        const level = response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info';

        log(
          level,
          `<- [${requestCount}] ${request.method} ${request.url} - ${response.status} ${response.statusText} (${timing.total}ms)`
        );

        if (verbose) {
          // Log response headers
          const responseHeaders: [string, string][] = [];
          response.headers.forEach((value, name) => {
            responseHeaders.push([name, value]);
          });

          if (responseHeaders.length > 0) {
            log('info', `   Response Headers:`);
            for (const [name, value] of responseHeaders) {
              log('info', `     ${name}: ${value}`);
            }
          }

          // Log timing breakdown if available
          if (timing.dns || timing.tls || timing.ttfb) {
            log('info', `   Timing breakdown:`);
            if (timing.dns) log('info', `     DNS: ${timing.dns}ms`);
            if (timing.tls) log('info', `     TLS: ${timing.tls}ms`);
            if (timing.ttfb) log('info', `     TTFB: ${timing.ttfb}ms`);
            if (timing.download) log('info', `     Download: ${timing.download}ms`);
          }
        }
      },

      // Error hook for logging failures
      async error(input, _output) {
        const { request, error, ctx } = input;

        log('error', `!! [${requestCount}] ${request.method} ${request.url} - ${error.message}`);

        if (verbose && ctx.retries < ctx.maxRetries) {
          log('info', `   Will retry (attempt ${ctx.retries + 1}/${ctx.maxRetries})`);
        }
      }
    },

    // Subscribe to engine events for additional observability
    async event({ event }) {
      if (!verbose) return;

      switch (event.type) {
        case 'parseStarted':
          log('info', `Parsing: ${event.source}`);
          break;
        case 'parseFinished':
          log('info', `Parsed ${event.requestCount} request(s) from ${event.source}`);
          break;
      }
    },

    teardown() {
      log('info', `Logging plugin shutting down. Total requests: ${requestCount}`);
    }
  });
}
