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

export interface PluginHookInfo {
  pluginName: string;
  hook: string;
  durationMs: number;
  modified: boolean;
}

export interface PluginReport {
  pluginName: string;
  runId: string;
  flowId?: string;
  reqExecId?: string;
  requestName?: string;
  ts: number;
  seq: number;
  data: unknown;
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
  pluginHooks?: PluginHookInfo[];
  pluginReports?: PluginReport[];
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

// SSE Message type (for streaming requests)
export interface SSEMessage {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
}

// SSE Stream result
export interface SSEStreamResult {
  messages: AsyncIterable<SSEMessage>;
  close: () => void;
}

export interface ExecuteRequestParams {
  path?: string;
  content?: string;
  requestIndex?: number;
  requestName?: string;
  flowId?: string;
  sessionId?: string;
  reqLabel?: string;
  profile?: string;
}

export interface ResolvedDefaults {
  timeoutMs: number;
  followRedirects: boolean;
  validateSSL: boolean;
  proxy?: string;
  headers: Record<string, string>;
}

export interface ResolvedCookies {
  enabled: boolean;
  jarPath?: string;
  mode: 'disabled' | 'memory' | 'persistent';
}

export interface SecuritySettings {
  allowExternalFiles: boolean;
  allowPluginsOutsideProject: boolean;
  pluginPermissions?: Record<string, string[]>;
}

export interface ConfigResponse {
  configPath?: string;
  projectRoot: string;
  format?: 'jsonc' | 'json' | 'ts' | 'js' | 'mjs';
  profile?: string;
  availableProfiles: string[];
  layersApplied: string[];
  resolvedConfig: {
    variables: Record<string, unknown>;
    defaults: ResolvedDefaults;
    cookies: ResolvedCookies;
    security: SecuritySettings;
    resolverNames: string[];
  };
  warnings: string[];
}

export interface PluginCapabilities {
  hasHooks: boolean;
  hasResolvers: boolean;
  hasCommands: boolean;
  hasMiddleware: boolean;
  hasTools: boolean;
}

export interface PluginInfo {
  name: string;
  version?: string;
  source: 'npm' | 'file' | 'inline' | 'subprocess';
  permissions: string[];
  capabilities: PluginCapabilities;
}

export interface PluginsResponse {
  plugins: PluginInfo[];
  count: number;
}

export interface ExecuteResponse {
  runId: string;
  reqExecId?: string;
  flowId?: string;
  pluginReports?: PluginReport[];
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

export interface GetFileContentResponse {
  path: string;
  content: string;
  lastModified: number;
}

export interface UpdateFileRequest {
  path: string;
  content: string;
}

export interface CreateFileRequest {
  path: string;
  content?: string;
}

export interface SDK {
  /** Base URL for API requests (empty string for relative URLs) */
  baseUrl: string;
  /** Bearer token (if using token auth instead of cookies) */
  token?: string;

  health(): Promise<HealthResponse>;
  listWorkspaceFiles(): Promise<ListWorkspaceFilesResponse>;
  listWorkspaceRequests(path: string): Promise<ListWorkspaceRequestsResponse>;

  // Config
  getConfig(profile?: string): Promise<ConfigResponse>;

  // Plugins
  getPlugins(): Promise<PluginsResponse>;

  // Flow management
  createFlow(label?: string): Promise<CreateFlowResponse>;
  finishFlow(flowId: string): Promise<FinishFlowResponse>;
  getExecution(flowId: string, reqExecId: string): Promise<ExecutionDetail>;

  // Request execution
  executeRequest(
    flowId: string,
    path: string,
    requestIndex: number,
    profile?: string
  ): Promise<ExecuteResponse>;

  // Script execution
  getRunners(filePath?: string): Promise<GetRunnersResponse>;
  runScript(filePath: string, runnerId?: string, flowId?: string): Promise<RunScriptResponse>;
  cancelScript(runId: string): Promise<void>;

  // Test execution
  getTestFrameworks(filePath?: string): Promise<GetTestFrameworksResponse>;
  runTest(filePath: string, frameworkId?: string, flowId?: string): Promise<RunTestResponse>;
  cancelTest(runId: string): Promise<void>;

  // File CRUD
  getFileContent(path: string): Promise<GetFileContentResponse>;
  updateFile(path: string, content: string): Promise<void>;
  createFile(path: string, content?: string): Promise<void>;
  deleteFile(path: string): Promise<void>;

  // SSE subscription
  subscribeEvents(
    flowId: string,
    onEvent: (event: EventEnvelope) => void,
    onError: (error: Error) => void,
    onClose: () => void
  ): () => void; // Returns unsubscribe function

  // SSE streaming request execution
  streamRequest(
    flowId: string,
    path: string,
    requestIndex: number,
    options?: { variables?: Record<string, unknown>; timeout?: number; lastEventId?: string }
  ): Promise<SSEStreamResult>;

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

    async getConfig(profile?: string): Promise<ConfigResponse> {
      const query = profile ? `?profile=${encodeURIComponent(profile)}` : '';
      return request<ConfigResponse>(`/config${query}`);
    },

    async getPlugins(): Promise<PluginsResponse> {
      return request<PluginsResponse>('/plugins');
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
      requestIndex: number,
      profile?: string
    ): Promise<ExecuteResponse> {
      return request<ExecuteResponse>('/execute', {
        method: 'POST',
        body: JSON.stringify({
          path,
          requestIndex,
          flowId,
          profile
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

    // File CRUD
    async getFileContent(path: string): Promise<GetFileContentResponse> {
      const encodedPath = encodeURIComponent(path);
      return request<GetFileContentResponse>(`/workspace/file?path=${encodedPath}`);
    },

    async updateFile(path: string, content: string): Promise<void> {
      await request<void>('/workspace/file', {
        method: 'PUT',
        body: JSON.stringify({ path, content })
      });
    },

    async createFile(path: string, content?: string): Promise<void> {
      await request<void>('/workspace/file', {
        method: 'POST',
        body: JSON.stringify({ path, content })
      });
    },

    async deleteFile(path: string): Promise<void> {
      const url = buildUrl(`/workspace/file?path=${encodeURIComponent(path)}`);
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(url, {
        method: 'DELETE',
        credentials: 'include',
        headers
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorBody = (await response.json()) as {
            error?: { message?: string };
          };
          if (errorBody.error?.message) {
            errorMessage = errorBody.error.message;
          }
        } catch {
          // Ignore JSON parse errors
        }
        throw new SDKError(errorMessage, response.status);
      }
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
            const lines = buffer.split(/\r?\n/);
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
    },

    async streamRequest(
      flowId: string,
      path: string,
      requestIndex: number,
      options: { variables?: Record<string, unknown>; timeout?: number; lastEventId?: string } = {}
    ): Promise<SSEStreamResult> {
      const url = buildUrl('/execute/sse');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          path,
          requestIndex,
          flowId,
          ...options
        })
      });

      if (response.status === 401) {
        handleUnauthorized(token);
      }

      if (!response.ok) {
        throw new SDKError(
          `SSE request failed: ${response.status} ${response.statusText}`,
          response.status
        );
      }

      if (!response.body) {
        throw new SDKError('SSE response has no body');
      }

      const reader = response.body.getReader();
      let closed = false;

      // Parse SSE stream
      async function* parseSSEStream(): AsyncGenerator<SSEMessage> {
        const decoder = new TextDecoder();
        let buffer = '';
        let currentMessage: Partial<SSEMessage> = {};

        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('id:')) {
              currentMessage.id = line.slice(3).trim();
            } else if (line.startsWith('event:')) {
              currentMessage.event = line.slice(6).trim();
              // Handle error events from server
              if (currentMessage.event === 'error' && currentMessage.data) {
                try {
                  const errorData = JSON.parse(currentMessage.data) as { error: string };
                  throw new SDKError(errorData.error);
                } catch (e) {
                  if (e instanceof SDKError) throw e;
                  // If parse fails, continue
                }
              }
            } else if (line.startsWith('data:')) {
              const data = line.slice(5);
              currentMessage.data =
                currentMessage.data !== undefined ? currentMessage.data + '\n' + data : data;
            } else if (line.startsWith('retry:')) {
              const retryValue = parseInt(line.slice(6).trim(), 10);
              if (!isNaN(retryValue)) {
                currentMessage.retry = retryValue;
              }
            } else if (line === '') {
              // Handle error events
              if (currentMessage.event === 'error' && currentMessage.data !== undefined) {
                try {
                  const errorData = JSON.parse(currentMessage.data) as { error: string };
                  throw new SDKError(errorData.error);
                } catch (e) {
                  if (e instanceof SDKError) throw e;
                  // Continue if parse fails
                }
              }
              // Emit non-error messages
              if (currentMessage.data !== undefined && currentMessage.event !== 'error') {
                yield currentMessage as SSEMessage;
              }
              currentMessage = {};
            }
          }
        }
      }

      return {
        messages: parseSSEStream(),
        close: () => {
          closed = true;
          reader.cancel().catch(() => {
            // Ignore cancel errors
          });
        }
      };
    }
  };
}
