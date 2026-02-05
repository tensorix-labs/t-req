// Protocol registry

// Re-export stream response types from main types
export type { SSEMessage, SSEResponse, StreamResponse } from '../types';
// Protocol handlers (import for side-effect registration)
export { httpHandler } from './http';
export {
  getDefaultHandler,
  getHandler,
  getRegisteredProtocols,
  hasHandler,
  registerProtocol
} from './registry';
export { createSSEResponse, parseSSEStream, sseHandler } from './sse';
// Protocol types
export type { Protocol, ProtocolExecuteOptions, ProtocolHandler } from './types';
