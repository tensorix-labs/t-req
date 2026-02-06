/**
 * @t-req/sdk — Full SDK bundle (client + server).
 *
 * For client-only usage: import from "@t-req/sdk/client"
 * For server spawning only: import from "@t-req/sdk/server"
 */

export * from './client';
export { createTreqServer, type TreqServer, type TreqServerOptions } from './server';

import { type CreateTreqClientOptions, createTreqClient } from './client';
import type { TreqClient } from './gen/sdk.gen';
import { createTreqServer, type TreqServer } from './server';

export interface CreateTreqOptions extends CreateTreqClientOptions {
  /** Workspace directory for the server */
  workspace?: string;
  /** Port to listen on (default: 0 for random) */
  port?: number;
  /** Path to the treq binary (default: "treq") */
  bin?: string;
}

export interface Treq {
  client: TreqClient;
  server: TreqServer;
}

/**
 * Spawn a t-req server and create a connected client.
 *
 * @example
 * ```ts
 * const { client, server } = await createTreq({ workspace: "./my-project" });
 * const health = await client.getHealth();
 * server.close();
 * ```
 */
export async function createTreq(options?: CreateTreqOptions): Promise<Treq> {
  const server = await createTreqServer({
    workspace: options?.workspace,
    port: options?.port,
    bin: options?.bin
  });
  const client = createTreqClient({
    baseUrl: server.url,
    token: options?.token
  });
  return { client, server };
}
