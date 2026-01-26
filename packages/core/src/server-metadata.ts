/**
 * Server metadata utilities for TUI and tooling.
 *
 * When a client is created with a server URL, it maintains internal metadata
 * about the server connection (session ID, flow ID). This utility allows
 * external tools to access this metadata for debugging, observability, or
 * orchestration purposes.
 */

import { SERVER_METADATA, type ServerMetadata } from './server-client';
import type { Client } from './types';

export type { ServerMetadata } from './server-client';

/**
 * Get server connection metadata from a client.
 *
 * Returns metadata only for server-backed clients (created with `server` option).
 * Returns `undefined` for local clients.
 *
 * @example
 * ```typescript
 * const client = createClient({ server: 'http://localhost:4096' });
 * await client.run('./test.http');
 *
 * const meta = getServerMetadata(client);
 * if (meta) {
 *   console.log('Session:', meta.sessionId);
 *   console.log('Flow:', meta.flowId);
 *   console.log('Server:', meta.serverUrl);
 * }
 * ```
 */
interface ClientWithServerMetadata extends Client {
  [SERVER_METADATA]?: () => ServerMetadata;
}

export function getServerMetadata(client: Client): ServerMetadata | undefined {
  const serverClient = client as ClientWithServerMetadata;
  const accessor = serverClient[SERVER_METADATA];
  if (typeof accessor === 'function') {
    return accessor();
  }
  return undefined;
}
