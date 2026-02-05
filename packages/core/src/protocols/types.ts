import type { Transport } from '../runtime/types';
import type { ExecuteOptions, ExecuteRequest, ParsedRequest, StreamResponse } from '../types';

/**
 * Supported protocol types.
 */
export type Protocol = 'http' | 'sse';

/**
 * Extended execute options for protocol handlers.
 */
export interface ProtocolExecuteOptions extends ExecuteOptions {
  /** Last-Event-ID for SSE resumption */
  lastEventId?: string;
}

/**
 * Protocol handler interface.
 * Each protocol implements this to handle its specific request type.
 */
export interface ProtocolHandler {
  /** Protocol identifier */
  readonly protocol: Protocol;

  /**
   * Check if this handler can handle the request.
   * Used for auto-detection when no explicit protocol is set.
   */
  canHandle(request: ParsedRequest): boolean;

  /**
   * Execute the request and return the appropriate response type.
   * For HTTP, returns standard Response.
   * For streaming protocols (SSE, WS), returns StreamResponse.
   */
  execute(
    request: ExecuteRequest,
    options: ProtocolExecuteOptions,
    transport: Transport
  ): Promise<Response | StreamResponse>;
}
