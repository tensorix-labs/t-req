/**
 * Server Client - Internal module for routing requests through treq server.
 *
 * This is the internal implementation used by createClient() when a server URL is configured.
 * The public API remains createClient({ server: 'http://localhost:4096' }).
 *
 * @internal
 */

import type { Client, ClientConfig, RunOptions } from './types';

/**
 * Internal configuration for server client, extending public ClientConfig.
 */
export interface ServerClientConfig extends ClientConfig {
  /** Base URL of the treq server (required) */
  serverUrl: string;
  /** Bearer token for authentication */
  token?: string | undefined;
}

/**
 * Metadata about the server connection.
 * Accessible via getServerMetadata() utility.
 */
export interface ServerMetadata {
  /** The server URL the client is connected to */
  readonly serverUrl: string;
  /** Session ID created on the server */
  readonly sessionId: string | undefined;
  /** Flow ID for observability (TUI) */
  readonly flowId: string | undefined;
}

// Symbol for storing server metadata on the client instance
export const SERVER_METADATA = Symbol('serverMetadata');

// ============================================================================
// Server Response Types
// ============================================================================

interface CreateSessionResponse {
  sessionId: string;
}

interface CreateFlowResponse {
  flowId: string;
}

interface ExecuteResponse {
  runId: string;
  reqExecId?: string;
  flowId?: string;
  request: {
    index: number;
    name?: string;
    method: string;
    url: string;
  };
  response: {
    status: number;
    statusText: string;
    headers: Array<{ name: string; value: string }>;
    body?: string;
    encoding: 'utf-8' | 'base64';
    truncated: boolean;
    bodyBytes: number;
  };
  timing: {
    startTime: number;
    endTime: number;
    durationMs: number;
  };
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Read environment variable safely (works in both Node and Bun).
 */
export function getEnvVar(name: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[name];
  }
  return undefined;
}

/**
 * Create a server-backed client (internal use).
 *
 * Called by createClient() when server URL is provided.
 * Automatically creates a session and flow on first use.
 *
 * When running as a server-spawned script:
 * - TREQ_FLOW_ID: Attach to existing flow (don't create new one)
 * - TREQ_SESSION_ID: Use pre-created session (skip session creation)
 * - TREQ_TOKEN: Use scoped script token for authentication
 *
 * @internal
 */
export function createServerClient(config: ServerClientConfig): Client {
  const { serverUrl } = config;
  const attachedFlowId = getEnvVar('TREQ_FLOW_ID');
  const preCreatedSessionId = getEnvVar('TREQ_SESSION_ID');
  const envToken = getEnvVar('TREQ_TOKEN');

  // Use environment token if available (for server-spawned scripts)
  // Fall back to config token if provided
  const token = envToken ?? config.token;

  const baseUrl = serverUrl.replace(/\/$/, '');
  let variables: Record<string, unknown> = { ...config.variables };
  let sessionId: string | undefined = preCreatedSessionId;
  let flowId: string | undefined = attachedFlowId;
  let initialized = false;
  let initPromise: Promise<void> | undefined;

  // Track if we're using pre-created resources (server-spawned script mode)
  const isAttachedFlow = !!attachedFlowId;
  const hasPreCreatedSession = !!preCreatedSessionId;

  // Serialize variable sync operations so rapid updates cannot race.
  let variableSyncChain: Promise<void> = Promise.resolve();

  const defaultTimeout = config.timeout ?? 30000;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Initialize session and flow on first request
  async function ensureInitialized(): Promise<void> {
    if (initialized) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      // Check for pre-created session (server-spawned scripts)
      // If TREQ_SESSION_ID is set, skip session creation - use the pre-created one
      if (hasPreCreatedSession) {
        // Session ID is already set from environment variable
        // Flow ID is also set from TREQ_FLOW_ID
        // Just mark as initialized and return
        initialized = true;
        return;
      }

      // 1. Create session (needed for variables/cookies)
      const sessionRes = await fetch(`${baseUrl}/session`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ variables })
      });

      if (!sessionRes.ok) {
        const error = await sessionRes.text();
        throw new Error(`Failed to create session: ${error}`);
      }

      const sessionData = (await sessionRes.json()) as CreateSessionResponse;
      sessionId = sessionData.sessionId;

      // 2. Create flow with sessionId ONLY if not attached to an existing flow
      if (!isAttachedFlow) {
        const flowRes = await fetch(`${baseUrl}/flows`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            sessionId
          })
        });

        if (!flowRes.ok) {
          const error = await flowRes.text();
          throw new Error(`Failed to create flow: ${error}`);
        }

        const flowData = (await flowRes.json()) as CreateFlowResponse;
        flowId = flowData.flowId;
      }

      initialized = true;
    })();

    return initPromise;
  }

  function enqueueVariableSync(vars: Record<string, unknown>): void {
    const doSync = async (): Promise<void> => {
      if (!sessionId) return;
      try {
        const res = await fetch(`${baseUrl}/session/${sessionId}/variables`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ variables: vars, mode: 'merge' })
        });
        if (!res.ok) {
          console.error('Failed to sync variables to server:', res.statusText);
        }
      } catch (err) {
        console.error('Failed to sync variables to server:', err);
      }
    };

    if (sessionId) {
      variableSyncChain = variableSyncChain.catch(() => undefined).then(doSync);
    } else if (initPromise) {
      variableSyncChain = variableSyncChain
        .catch(() => undefined)
        .then(() => initPromise)
        .then(doSync);
    }
  }

  async function executeRequest(
    source: { path?: string; content?: string },
    options: RunOptions = {}
  ): Promise<Response> {
    await ensureInitialized();

    // Await any queued variable sync to ensure server has latest values
    await variableSyncChain;

    const body: Record<string, unknown> = {
      ...source,
      sessionId,
      flowId,
      profile: config.profile,
      timeoutMs: options.timeout ?? defaultTimeout
    };

    // Add reqLabel based on source
    if (source.path) {
      body['reqLabel'] = source.path;
    }

    // Add per-request variables if provided
    if (options.variables && Object.keys(options.variables).length > 0) {
      body['variables'] = options.variables;
    }

    // Add basePath if provided (for content execution)
    if (options.basePath) {
      body['basePath'] = options.basePath;
    }

    // Build fetch options
    const fetchOptions: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    };
    if (options.signal) {
      fetchOptions.signal = options.signal;
    }

    const execRes = await fetch(`${baseUrl}/execute`, fetchOptions);

    if (!execRes.ok) {
      const error = await execRes.text();
      throw new Error(`Execution failed: ${error}`);
    }

    const data = (await execRes.json()) as ExecuteResponse;

    // Convert server response back to a fetch-like Response
    return serverResponseToFetchResponse(data.response);
  }

  function serverResponseToFetchResponse(serverRes: ExecuteResponse['response']): Response {
    // Decode body based on encoding
    let body: BodyInit | undefined;
    if (serverRes.body !== undefined) {
      if (serverRes.encoding === 'base64') {
        // Decode base64 to binary
        const binaryStr = atob(serverRes.body);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        body = bytes;
      } else {
        body = serverRes.body;
      }
    }

    // Build headers
    const responseHeaders = new Headers();
    for (const h of serverRes.headers) {
      responseHeaders.append(h.name, h.value);
    }

    return new Response(body, {
      status: serverRes.status,
      statusText: serverRes.statusText,
      headers: responseHeaders
    });
  }

  async function close(): Promise<void> {
    // Only finish the flow if we created it (not when attached to TUI's flow)
    if (!flowId || isAttachedFlow) return;

    try {
      await fetch(`${baseUrl}/flows/${flowId}/finish`, {
        method: 'POST',
        headers
      });
    } catch {
      // Best-effort - server will TTL anyway
    }
  }

  const client: Client & { [SERVER_METADATA]: () => ServerMetadata } = {
    async run(path: string, options: RunOptions = {}): Promise<Response> {
      return executeRequest({ path }, options);
    },

    async runString(content: string, options: RunOptions = {}): Promise<Response> {
      return executeRequest({ content }, options);
    },

    setVariables(vars: Record<string, unknown>): void {
      variables = { ...variables, ...vars };
      enqueueVariableSync(vars);
    },

    setVariable(key: string, value: unknown): void {
      variables[key] = value;
      enqueueVariableSync({ [key]: value });
    },

    getVariables(): Record<string, unknown> {
      return { ...variables };
    },

    close,

    [Symbol.asyncDispose]: close,

    // Internal: accessor for server metadata
    [SERVER_METADATA]: () => ({
      serverUrl: baseUrl,
      sessionId,
      flowId
    })
  };

  return client;
}
