/**
 * TUI SDK - HTTP client for workspace and observer APIs.
 * Architecture constraint: no direct filesystem access, all data via server.
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
  pluginHooks?: PluginHookInfo[];
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
  profile?: string;
}

export interface ConfigResponse {
  availableProfiles: string[];
  profile?: string;
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

// Test execution types
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

export interface SDK {
  serverUrl: string;
  token?: string;
  health(): Promise<HealthResponse>;
  listWorkspaceFiles(): Promise<ListWorkspaceFilesResponse>;
  listWorkspaceRequests(path: string): Promise<ListWorkspaceRequestsResponse>;

  getConfig(profile?: string): Promise<ConfigResponse>;

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

  // SSE subscription
  subscribeEvents(
    flowId: string,
    onEvent: (event: EventEnvelope) => void,
    onError: (error: Error) => void,
    onClose: () => void
  ): () => void; // Returns unsubscribe function
}

export class SDKError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'SDKError';
  }
}

/**
 * Create an SDK instance for communicating with the treq server.
 */
export function createSDK(serverUrl: string, token?: string): SDK {
  // Normalize URL: remove trailing slash
  const baseUrl = serverUrl.replace(/\/+$/, '');

  async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = new URL(endpoint, baseUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url.toString(), {
      ...options,
      headers: {
        ...headers,
        ...options?.headers
      }
    });

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
    serverUrl: baseUrl,
    token,

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
      await fetch(new URL(`/script/${encodeURIComponent(runId)}`, baseUrl).toString(), {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
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
      await fetch(new URL(`/test/${encodeURIComponent(runId)}`, baseUrl).toString(), {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
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

      const url = new URL(`/event?flowId=${encodeURIComponent(flowId)}`, baseUrl);

      // Start SSE subscription using fetch streaming
      (async () => {
        try {
          const headers: Record<string, string> = {
            Accept: 'text/event-stream'
          };
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }

          const response = await fetch(url.toString(), {
            headers,
            signal: controller.signal
          });

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
