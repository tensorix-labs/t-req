/**
 * Web SDK - HTTP client for t-req workspace and observer APIs.
 * Adapted from TUI SDK for browser environment.
 *
 * Architecture:
 * - When using local proxy mode (treq open --web), SDK uses relative URLs
 *   and browser cookies for auth (same-origin, no CORS needed)
 * - When using external server, SDK uses absolute URLs and bearer token
 * - All workspace data stays local on the user's machine
 */

// Types matching server schemas exactly
export interface WorkspaceFile {
  path: string;
  name: string;
  requestCount: number;
  lastModified: number;
}

export interface ListWorkspaceFilesResponse {
  files: WorkspaceFile[];
  workspaceRoot: string;
}

export interface WorkspaceRequest {
  index: number;
  name?: string;
  method: string;
  url: string;
}

export interface ListWorkspaceRequestsResponse {
  path: string;
  requests: WorkspaceRequest[];
}

export interface HealthResponse {
  healthy: boolean;
  version: string;
}

// Flow types
export interface CreateFlowResponse {
  flowId: string;
}

export interface FlowSummary {
  total: number;
  succeeded: number;
  failed: number;
  durationMs: number;
}

export interface FinishFlowResponse {
  flowId: string;
  summary: FlowSummary;
}

export interface ResponseHeader {
  name: string;
  value: string;
}

export interface ExecutionSource {
  kind: 'file' | 'string';
  path?: string;
  requestIndex?: number;
  requestName?: string;
}

export interface ExecutionDetail {
  reqExecId: string;
  flowId: string;
  sessionId?: string;
  reqLabel?: string;
  source?: ExecutionSource;
  rawHttpBlock?: string;
  method?: string;
  urlTemplate?: string;
  urlResolved?: string;
  headers?: ResponseHeader[];
  bodyPreview?: string;
  timing: {
    startTime: number;
    endTime?: number;
    durationMs?: number;
  };
  response?: {
    status: number;
    statusText: string;
    headers: ResponseHeader[];
    body?: string;
    encoding: 'utf-8' | 'base64';
    truncated: boolean;
    bodyBytes: number;
  };
  status: 'pending' | 'running' | 'success' | 'failed';
  error?: {
    stage: string;
    message: string;
  };
}

// SSE Event types
export interface EventEnvelope {
  type: string;
  ts: number;
  runId: string;
  sessionId?: string;
  flowId?: string;
  reqExecId?: string;
  seq: number;
  payload: Record<string, unknown>;
}

export interface ExecuteRequestParams {
  path?: string;
  content?: string;
  requestIndex?: number;
  requestName?: string;
  flowId?: string;
  sessionId?: string;
  reqLabel?: string;
}

export interface ExecuteResponse {
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
    headers: ResponseHeader[];
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

// Script execution types
export interface RunnerOption {
  id: string;
  label: string;
}

export interface GetRunnersResponse {
  detected: string | null;
  options: RunnerOption[];
}

export interface RunScriptResponse {
  runId: string;
  flowId: string;
}

export interface TestFrameworkOption {
  id: string;
  label: string;
}

export interface GetTestFrameworksResponse {
  detected: string | null;
  options: TestFrameworkOption[];
}

export interface RunTestResponse {
  runId: string;
  flowId: string;
}

export interface SDK {
  /** Base URL for API requests (empty string for relative URLs) */
  baseUrl: string;
  /** Bearer token (if using token auth instead of cookies) */
  token?: string;

  health(): Promise<HealthResponse>;
  listWorkspaceFiles(): Promise<ListWorkspaceFilesResponse>;
  listWorkspaceRequests(path: string): Promise<ListWorkspaceRequestsResponse>;

  // Flow management
  createFlow(label?: string): Promise<CreateFlowResponse>;
  finishFlow(flowId: string): Promise<FinishFlowResponse>;
  getExecution(flowId: string, reqExecId: string): Promise<ExecutionDetail>;

  // Request execution
  executeRequest(flowId: string, path: string, requestIndex: number): Promise<ExecuteResponse>;

  // Script execution
  getRunners(filePath?: string): Promise<GetRunnersResponse>;
  runScript(filePath: string, runnerId?: string, flowId?: string): Promise<RunScriptResponse>;
  cancelScript(runId: string): Promise<void>;

  // Test execution
  getTestFrameworks(filePath?: string): Promise<GetTestFrameworksResponse>;
  runTest(filePath: string, frameworkId?: string, flowId?: string): Promise<RunTestResponse>;
  cancelTest(runId: string): Promise<void>;

  // SSE subscription
  subscribeEvents(
    flowId: string,
    onEvent: (event: EventEnvelope) => void,
    onError: (error: Error) => void,
    onClose: () => void
  ): () => void; // Returns unsubscribe function

  // Legacy compatibility
  /** @deprecated Use baseUrl instead */
  serverUrl: string;
}

export interface SDKConfig {
  /** Base URL for API requests. Empty string = relative URLs (same-origin). */
  baseUrl?: string;
  /** Bearer token for non-cookie auth (e.g., TUI, external clients) */
  token?: string;
}

export class SDKError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'SDKError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Get the default server URL from environment or use same-origin.
 *
 * In browser context without explicit VITE_API_URL:
 * - Returns empty string for relative URLs (same-origin)
 * - This allows the web app to work with any proxy port
 *
 * In non-browser context:
 * - Returns localhost:4096 as fallback
 */
export function getDefaultServerUrl(): string {
  // Vite injects env vars at build time
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (envUrl) {
    return envUrl;
  }
  // In browser, use relative URLs (same-origin with proxy)
  // This allows the SDK to work with any port the proxy is running on
  if (typeof window !== 'undefined') {
    return ''; // Empty = relative URLs
  }
  // Fallback for non-browser environments (testing, SSR)
  return 'http://localhost:4096';
}

/**
 * Handle 401 Unauthorized errors.
 * For web clients without token, redirect to /auth/init.
 */
function handleUnauthorized(token?: string): never {
  // Redirect to auth init for web clients (no token = using cookies)
  if (typeof window !== 'undefined' && !token) {
    window.location.href = '/auth/init';
  }
  throw new SDKError('Unauthorized', 401);
}

/**
 * Create an SDK instance for communicating with the treq server.
 *
 * @example
 * // Same-origin with cookie auth (local proxy mode)
 * const sdk = createSDK();
 *
 * @example
 * // Same-origin with explicit empty baseUrl
 * const sdk = createSDK({ baseUrl: '' });
 *
 * @example
 * // External server with token auth
 * const sdk = createSDK({ baseUrl: 'http://localhost:4096', token: 'xxx' });
 *
 * @example
 * // Legacy: positional arguments (deprecated)
 * const sdk = createSDK('http://localhost:4096', 'token');
 */
export function createSDK(configOrUrl?: SDKConfig | string, legacyToken?: string): SDK {
  // Handle legacy positional arguments: createSDK(serverUrl, token)
  let config: SDKConfig;
  if (typeof configOrUrl === 'string') {
    config = { baseUrl: configOrUrl, token: legacyToken };
  } else {
    config = configOrUrl ?? {};
  }

  // Normalize baseUrl: remove trailing slashes, empty string = relative URLs
  const baseUrl = (config.baseUrl ?? '').replace(/\/+$/, '');
  const token = config.token;

  /**
   * Build the full URL for an endpoint.
   * If baseUrl is empty, returns just the endpoint (relative URL).
   */
  function buildUrl(endpoint: string): string {
    if (baseUrl) {
      return new URL(endpoint, baseUrl).toString();
    }
    // Relative URL for same-origin requests
    return endpoint;
  }

  async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = buildUrl(endpoint);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };

    // Add bearer token if provided (for non-cookie auth)
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      // Include cookies for same-origin requests (cookie auth)
      credentials: 'include',
      headers: {
        ...headers,
        ...options?.headers
      }
    });

    // Handle auth failure
    if (response.status === 401) {
      handleUnauthorized(token);
    }

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      let errorCode: string | undefined;

      try {
        const errorBody = (await response.json()) as {
          error?: { message?: string; code?: string };
        };
        if (errorBody.error) {
          errorMessage = errorBody.error.message || errorMessage;
          errorCode = errorBody.error.code;
        }
      } catch {
        // Ignore JSON parse errors for error response
      }

      throw new SDKError(errorMessage, response.status, errorCode);
    }

    return (await response.json()) as T;
  }

  return {
    baseUrl,
    token,
    // Legacy compatibility
    get serverUrl() {
      return baseUrl || window.location.origin;
    },

    async health(): Promise<HealthResponse> {
      return request<HealthResponse>('/health');
    },

    async listWorkspaceFiles(): Promise<ListWorkspaceFilesResponse> {
      return request<ListWorkspaceFilesResponse>('/workspace/files');
    },

    async listWorkspaceRequests(path: string): Promise<ListWorkspaceRequestsResponse> {
      const encodedPath = encodeURIComponent(path);
      return request<ListWorkspaceRequestsResponse>(`/workspace/requests?path=${encodedPath}`);
    },

    async createFlow(label?: string): Promise<CreateFlowResponse> {
      return request<CreateFlowResponse>('/flows', {
        method: 'POST',
        body: JSON.stringify({ label })
      });
    },

    async finishFlow(flowId: string): Promise<FinishFlowResponse> {
      return request<FinishFlowResponse>(`/flows/${encodeURIComponent(flowId)}/finish`, {
        method: 'POST'
      });
    },

    async getExecution(flowId: string, reqExecId: string): Promise<ExecutionDetail> {
      return request<ExecutionDetail>(
        `/flows/${encodeURIComponent(flowId)}/executions/${encodeURIComponent(reqExecId)}`
      );
    },

    async executeRequest(
      flowId: string,
      path: string,
      requestIndex: number
    ): Promise<ExecuteResponse> {
      return request<ExecuteResponse>('/execute', {
        method: 'POST',
        body: JSON.stringify({
          path,
          requestIndex,
          flowId
        })
      });
    },

    // Script execution
    async getRunners(filePath?: string): Promise<GetRunnersResponse> {
      const query = filePath ? `?filePath=${encodeURIComponent(filePath)}` : '';
      return request<GetRunnersResponse>(`/script/runners${query}`);
    },

    async runScript(
      filePath: string,
      runnerId?: string,
      flowId?: string
    ): Promise<RunScriptResponse> {
      return request<RunScriptResponse>('/script', {
        method: 'POST',
        body: JSON.stringify({
          filePath,
          runnerId,
          flowId
        })
      });
    },

    async cancelScript(runId: string): Promise<void> {
      const url = buildUrl(`/script/${encodeURIComponent(runId)}`);
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      await fetch(url, {
        method: 'DELETE',
        credentials: 'include',
        headers
      });
    },

    // Test execution
    async getTestFrameworks(filePath?: string): Promise<GetTestFrameworksResponse> {
      const query = filePath ? `?filePath=${encodeURIComponent(filePath)}` : '';
      return request<GetTestFrameworksResponse>(`/test/frameworks${query}`);
    },

    async runTest(
      filePath: string,
      frameworkId?: string,
      flowId?: string
    ): Promise<RunTestResponse> {
      return request<RunTestResponse>('/test', {
        method: 'POST',
        body: JSON.stringify({
          filePath,
          frameworkId,
          flowId
        })
      });
    },

    async cancelTest(runId: string): Promise<void> {
      const url = buildUrl(`/test/${encodeURIComponent(runId)}`);
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      await fetch(url, {
        method: 'DELETE',
        credentials: 'include',
        headers
      });
    },

    subscribeEvents(
      flowId: string,
      onEvent: (event: EventEnvelope) => void,
      onError: (error: Error) => void,
      onClose: () => void
    ): () => void {
      let aborted = false;
      const controller = new AbortController();

      const url = buildUrl(`/event?flowId=${encodeURIComponent(flowId)}`);

      // Start SSE subscription using fetch streaming
      (async () => {
        try {
          const headers: Record<string, string> = {
            Accept: 'text/event-stream'
          };
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }

          const response = await fetch(url, {
            headers,
            credentials: 'include', // Include cookies for auth
            signal: controller.signal
          });

          // Handle auth failure
          if (response.status === 401) {
            handleUnauthorized(token);
          }

          if (!response.ok) {
            throw new SDKError(`SSE connection failed: ${response.status}`, response.status);
          }

          if (!response.body) {
            throw new SDKError('SSE connection has no body');
          }

          // Parse SSE stream
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (!aborted) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE messages
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

            let eventType = '';
            let eventData = '';

            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                eventData = line.slice(5).trim();
              } else if (line === '') {
                // End of message - process it
                if (eventData && eventType !== 'heartbeat' && eventType !== 'connected') {
                  try {
                    const parsed = JSON.parse(eventData) as EventEnvelope;
                    onEvent(parsed);
                  } catch {
                    // Ignore parse errors
                  }
                }
                eventType = '';
                eventData = '';
              }
            }
          }

          if (!aborted) {
            onClose();
          }
        } catch (err) {
          if (!aborted) {
            if (err instanceof Error && err.name === 'AbortError') {
              onClose();
            } else {
              onError(err instanceof Error ? err : new Error(String(err)));
            }
          }
        }
      })();

      // Return unsubscribe function
      return () => {
        aborted = true;
        controller.abort();
      };
    }
  };
}
