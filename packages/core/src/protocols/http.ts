import { executeWithTransport } from '../execute';
import type { ParsedRequest } from '../types';
import { registerProtocol } from './registry';
import type { ProtocolExecuteOptions, ProtocolHandler } from './types';

/**
 * HTTP protocol handler.
 * Handles standard HTTP request/response cycle.
 */
export const httpHandler: ProtocolHandler = {
  protocol: 'http',

  canHandle(request: ParsedRequest): boolean {
    // HTTP is the default - handles requests without explicit protocol
    // or with explicit 'http' protocol
    return !request.protocol || request.protocol === 'http';
  },

  async execute(request, options, transport): Promise<Response> {
    // Build execute options without protocol-specific fields
    // Filter out undefined values to satisfy exactOptionalPropertyTypes
    const execOptions: ProtocolExecuteOptions = {};
    if (options.timeout !== undefined) execOptions.timeout = options.timeout;
    if (options.signal !== undefined) execOptions.signal = options.signal;
    if (options.followRedirects !== undefined)
      execOptions.followRedirects = options.followRedirects;
    if (options.validateSSL !== undefined) execOptions.validateSSL = options.validateSSL;
    if (options.proxy !== undefined) execOptions.proxy = options.proxy;

    return executeWithTransport(request, execOptions, transport);
  }
};

// Register the handler on module load
registerProtocol(httpHandler);
