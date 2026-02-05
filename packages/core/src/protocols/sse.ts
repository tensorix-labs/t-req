import type { Transport, TransportContext } from '../runtime/types';
import type { ExecuteRequest, ParsedRequest, SSEMessage, SSEResponse } from '../types';
import { setOptional } from '../utils/optional';
import { registerProtocol } from './registry';
import type { ProtocolExecuteOptions, ProtocolHandler } from './types';

/**
 * Parse an SSE stream from a ReadableStreamDefaultReader.
 * Yields SSEMessage objects as they are received.
 *
 * SSE format:
 *   event: <type>
 *   id: <id>
 *   data: <payload>
 *   retry: <ms>
 *   <blank line> (message boundary)
 *   : comment (ignored, used for keep-alive)
 */
async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<SSEMessage, void, unknown> {
  const decoder = new TextDecoder();
  let buffer = '';
  let currentMessage: Partial<SSEMessage> = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('id:')) {
        currentMessage.id = line.slice(3).trim();
      } else if (line.startsWith('event:')) {
        currentMessage.event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        // Data can be multi-line - concatenate with newline
        const data = line.slice(5);
        currentMessage.data =
          currentMessage.data !== undefined ? currentMessage.data + '\n' + data : data;
      } else if (line.startsWith('retry:')) {
        const retryValue = parseInt(line.slice(6).trim(), 10);
        if (!isNaN(retryValue)) {
          currentMessage.retry = retryValue;
        }
      } else if (line === '' || line === '\r') {
        // Empty line = end of message
        if (currentMessage.data !== undefined) {
          yield currentMessage as SSEMessage;
        }
        currentMessage = {};
      }
      // Lines starting with ':' are comments (keep-alive), ignore them
    }
  }

  // Flush any remaining message if stream ended mid-message
  if (currentMessage.data !== undefined) {
    yield currentMessage as SSEMessage;
  }
}

/**
 * Create an SSEResponse wrapper around a fetch Response.
 */
function createSSEResponse(response: Response): SSEResponse {
  if (!response.body) {
    throw new Error('SSE response has no body');
  }

  const reader = response.body.getReader();
  let closed = false;

  const generator = parseSSEStream(reader);

  const sseResponse: SSEResponse = {
    type: 'sse',

    async *[Symbol.asyncIterator](): AsyncGenerator<SSEMessage, void, unknown> {
      if (closed) return;

      for await (const message of generator) {
        if (closed) return;

        // Track last event ID for resumption
        if (message.id) {
          // Update the property on the response object
          (sseResponse as { lastEventId?: string }).lastEventId = message.id;
        }

        yield message;
      }
    },

    close(): void {
      if (closed) return;
      closed = true;
      reader.cancel().catch(() => {
        // Ignore cancel errors
      });
    },

    response
  };

  return sseResponse;
}

/**
 * SSE protocol handler.
 * Handles Server-Sent Events streaming connections.
 */
export const sseHandler: ProtocolHandler = {
  protocol: 'sse',

  canHandle(request: ParsedRequest): boolean {
    // Explicit @sse directive
    if (request.protocol === 'sse') {
      return true;
    }

    // Auto-detect from Accept header
    const accept = request.headers['Accept'] || request.headers['accept'];
    if (accept?.includes('text/event-stream')) {
      return true;
    }

    return false;
  },

  async execute(
    request: ExecuteRequest,
    options: ProtocolExecuteOptions,
    transport: Transport
  ): Promise<SSEResponse> {
    // Build SSE-specific headers
    const headers: Record<string, string> = {
      ...request.headers,
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache'
    };

    // Add Last-Event-ID for resumption
    if (options.lastEventId) {
      headers['Last-Event-ID'] = options.lastEventId;
    }

    // Build transport context
    const ctx = setOptional<TransportContext>({})
      .ifDefined('proxy', options.proxy)
      .ifDefined('validateSSL', options.validateSSL)
      .build();

    // Build request init - only include signal if defined
    const requestInit: RequestInit = {
      method: request.method || 'GET',
      headers
    };
    if (options.signal) {
      requestInit.signal = options.signal;
    }

    // Execute the request
    const response = await transport.fetch(request.url, requestInit, ctx);

    // Verify response is SSE
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream') && response.ok) {
      // Response is OK but not SSE - might be an error page or redirect
      // Let it through but log a warning via the response
    }

    if (!response.ok) {
      throw new Error(`SSE request failed: ${response.status} ${response.statusText}`);
    }

    return createSSEResponse(response);
  }
};

// Register the handler on module load
registerProtocol(sseHandler);

// Export utilities for SDK use
export { createSSEResponse, parseSSEStream };
