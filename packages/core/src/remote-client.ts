/**
 * Remote Client - Routes requests through treq serve instead of executing locally.
 *
 * This allows existing scripts to become observable by the TUI with a single import change:
 *
 * @example
 * ```typescript
 * // Change from:
 * // import { createClient } from '@t-req/core';
 * // const client = createClient({ variables: {...} });
 *
 * // To:
 * import { createRemoteClient } from '@t-req/core';
 * const client = createRemoteClient({
 *   serverUrl: 'http://localhost:4096',
 *   variables: { baseUrl: 'https://api.example.com' }
 * });
 *
 * // Same API as createClient:
 * const response = await client.run('./auth/login.http');
 * client.setVariable('token', '...');
 * await client.close(); // Finishes flow (best-effort)
 * ```
 */

import type { Client, RunOptions } from './types';

export interface RemoteClientConfig {
  /**
   * URL of the treq server.
   * If not provided, will try to read from TREQ_SERVER environment variable.
   * @example 'http://localhost:4096'
   */
  serverUrl?: string;

  /**
   * Initial variables for the session.
   */
  variables?: Record<string, unknown>;

  /**
   * Optional label for the flow (shown in TUI).
   */
  flowLabel?: string;

  /**
   * Optional metadata for the flow.
   */
  flowMeta?: Record<string, unknown>;

  /**
   * Config profile to use.
   */
  profile?: string;

  /**
   * Default timeout in milliseconds.
   * @default 30000
   */
  timeout?: number;

  /**
   * Bearer token for authentication (if server requires it).
   * If not provided, will try to read from TREQ_TOKEN environment variable.
   */
  token?: string;

  /**
   * Flow ID to attach to (for TUI orchestration).
   * If not provided, will try to read from TREQ_FLOW_ID environment variable.
   * When present, the client will not create its own flow but will use this one.
   */
  flowId?: string;
}

/**
 * Extended client interface for remote execution with close/dispose.
 */
export interface RemoteClient extends Client {
  /**
   * Close the client and finish the flow.
   * Best-effort - server will TTL anyway if not called.
   */
  close(): Promise<void>;

  /**
   * Get the current session ID.
   */
  getSessionId(): string | undefined;

  /**
   * Get the current flow ID.
   */
  getFlowId(): string | undefined;
}

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
function getEnvVar(name: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[name];
  }
  return undefined;
}

/**
 * Create a remote client that routes through treq serve.
 *
 * The client automatically creates a session and flow on first use,
 * making all requests observable in the TUI.
 *
 * When TREQ_SERVER, TREQ_TOKEN, and TREQ_FLOW_ID environment variables
 * are present (e.g., when spawned by TUI), the client will attach to
 * the existing flow instead of creating a new one.
 */
export function createRemoteClient(config: RemoteClientConfig = {}): RemoteClient {
  // Read from environment variables if not provided in config
  const serverUrl = config.serverUrl ?? getEnvVar('TREQ_SERVER');
  const token = config.token ?? getEnvVar('TREQ_TOKEN');
  const attachedFlowId = config.flowId ?? getEnvVar('TREQ_FLOW_ID');

  if (!serverUrl) {
    throw new Error(
      'Remote client requires serverUrl. Provide in config or set TREQ_SERVER environment variable.'
    );
  }

  const baseUrl = serverUrl.replace(/\/$/, '');
  let variables: Record<string, unknown> = { ...config.variables };
  let sessionId: string | undefined;
  let flowId: string | undefined = attachedFlowId;
  let initialized = false;
  let initPromise: Promise<void> | undefined;

  // Track if we're attached to an external flow (TUI-created)
  const isAttachedFlow = !!attachedFlowId;

  // Serialize variable sync operations so rapid updates cannot race.
  // This chain is awaited before each execution.
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
      // 1. Create session (always needed for variables/cookies)
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
            sessionId,
            label: config.flowLabel,
            meta: config.flowMeta
          })
        });

        if (!flowRes.ok) {
          const error = await flowRes.text();
          throw new Error(`Failed to create flow: ${error}`);
        }

        const flowData = (await flowRes.json()) as CreateFlowResponse;
        flowId = flowData.flowId;
      }
      // If attached flow, flowId is already set from environment/config

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

    // If session exists, sync immediately in-order. If initialization is in flight,
    // sync once it completes (covers setVariable(s) during ensureInitialized()).
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

    // Build fetch options, only including signal if defined
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

  return {
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

    async close(): Promise<void> {
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
    },

    getSessionId(): string | undefined {
      return sessionId;
    },

    getFlowId(): string | undefined {
      return flowId;
    }
  };
}
