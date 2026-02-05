import type { Protocol, ProtocolHandler } from './types';

/**
 * Registry of protocol handlers.
 * Handlers register themselves on import.
 */
const handlers = new Map<Protocol, ProtocolHandler>();

/**
 * Register a protocol handler.
 * Called by each handler module on import.
 */
export function registerProtocol(handler: ProtocolHandler): void {
  handlers.set(handler.protocol, handler);
}

/**
 * Get a handler for a specific protocol.
 */
export function getHandler(protocol: Protocol): ProtocolHandler | undefined {
  return handlers.get(protocol);
}

/**
 * Get the default HTTP handler.
 * Throws if HTTP handler is not registered (should never happen).
 */
export function getDefaultHandler(): ProtocolHandler {
  const handler = handlers.get('http');
  if (!handler) {
    throw new Error('HTTP handler not registered. Import the http protocol handler.');
  }
  return handler;
}

/**
 * Check if a protocol handler is registered.
 */
export function hasHandler(protocol: Protocol): boolean {
  return handlers.has(protocol);
}

/**
 * Get all registered protocol names.
 */
export function getRegisteredProtocols(): Protocol[] {
  return Array.from(handlers.keys());
}
