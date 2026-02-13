import {
  type ClientOptions,
  createConfig,
  createClient as createGeneratedClient,
  type ConfigResponse as GeneratedConfigResponse,
  type EventEnvelope as GeneratedEventEnvelope,
  type ExecuteResponse as GeneratedExecuteResponse,
  type ExecutionDetail as GeneratedExecutionDetail,
  type FlowSummary as GeneratedFlowSummary,
  type PluginInfo as GeneratedPluginInfo,
  type PluginReport as GeneratedPluginReport,
  type PluginsResponse as GeneratedPluginsResponse,
  type ResolvedCookies as GeneratedResolvedCookies,
  type ResolvedDefaults as GeneratedResolvedDefaults,
  type RunnerOption as GeneratedRunnerOption,
  type SecuritySettings as GeneratedSecuritySettings,
  type TestFrameworkOption as GeneratedTestFrameworkOption,
  type WorkspaceFile as GeneratedWorkspaceFile,
  type WorkspaceRequest as GeneratedWorkspaceRequest,
  type GetHealthResponses,
  type GetScriptRunnersResponses,
  type GetTestFrameworksResponses,
  type GetWorkspaceFileResponses,
  type GetWorkspaceFilesResponses,
  type GetWorkspaceRequestsResponses,
  type PostFlowsByFlowIdFinishResponses,
  type PostFlowsResponses,
  type PostScriptResponses,
  type PostTestResponses,
  type PostWorkspaceFileData,
  type PutWorkspaceFileData,
  SDKError,
  TreqClient,
  unwrap
} from '@t-req/sdk/client';

export type WorkspaceFile = GeneratedWorkspaceFile;

export type ListWorkspaceFilesResponse = GetWorkspaceFilesResponses[200];

export type WorkspaceRequest = GeneratedWorkspaceRequest;

export type ListWorkspaceRequestsResponse = GetWorkspaceRequestsResponses[200];

export type HealthResponse = Omit<GetHealthResponses[200], 'healthy'> & { healthy: boolean };

export type CreateFlowResponse = PostFlowsResponses[201];

export type FlowSummary = GeneratedFlowSummary;

export type FinishFlowResponse = PostFlowsByFlowIdFinishResponses[200];

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

export type PluginHookInfo = NonNullable<ExecutionDetail['pluginHooks']>[number];

export type PluginReport = GeneratedPluginReport;

export type ExecutionDetail = GeneratedExecutionDetail;

export interface EventEnvelope extends Omit<GeneratedEventEnvelope, 'type'> {
  type: string;
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

export type ResolvedDefaults = GeneratedResolvedDefaults;

export type ResolvedCookies = GeneratedResolvedCookies;

export type SecuritySettings = GeneratedSecuritySettings;

export type ConfigResponse = GeneratedConfigResponse;

export type PluginInfo = GeneratedPluginInfo;

export type PluginCapabilities = PluginInfo['capabilities'];

export type PluginsResponse = GeneratedPluginsResponse;

export type ExecuteResponse = GeneratedExecuteResponse;

// Script execution types
export type RunnerOption = GeneratedRunnerOption;

export type GetRunnersResponse = GetScriptRunnersResponses[200];

export type RunScriptResponse = PostScriptResponses[200];

export type TestFrameworkOption = GeneratedTestFrameworkOption;

export type GetTestFrameworksResponse = GetTestFrameworksResponses[200];

export type RunTestResponse = PostTestResponses[200];

export type GetFileContentResponse = GetWorkspaceFileResponses[200];

export type UpdateFileRequest = NonNullable<PutWorkspaceFileData['body']>;

export type CreateFileRequest = NonNullable<PostWorkspaceFileData['body']>;

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

export { SDKError };

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

function normalizeSDKConfig(configOrUrl?: SDKConfig | string, legacyToken?: string): SDKConfig {
  if (typeof configOrUrl === 'string') {
    return { baseUrl: configOrUrl, token: legacyToken };
  }
  return configOrUrl ?? {};
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

function createWebFetch(token?: string): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const requestWithCredentials = new Request(request, { credentials: 'include' });
    const response = await fetch(requestWithCredentials);

    if (response.status === 401 && !token && typeof window !== 'undefined') {
      window.location.href = '/auth/init';
    }

    return response;
  };
}

function createWebClient(baseUrl: string, token?: string): TreqClient {
  const client = createGeneratedClient(
    createConfig<ClientOptions>({
      baseUrl: baseUrl || undefined,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      fetch: createWebFetch(token)
    })
  );

  return new TreqClient({ client });
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
  const config = normalizeSDKConfig(configOrUrl, legacyToken);

  // Normalize baseUrl: remove trailing slashes, empty string = relative URLs
  const baseUrl = (config.baseUrl ?? '').replace(/\/+$/, '');
  const token = config.token;
  const client = createWebClient(baseUrl, token);

  return {
    baseUrl,
    token,

    // Legacy compatibility
    get serverUrl() {
      if (baseUrl) return baseUrl;
      if (typeof window !== 'undefined') return window.location.origin;
      return getDefaultServerUrl();
    },

    async health(): Promise<HealthResponse> {
      const data = await unwrap(client.getHealth());
      return { healthy: Boolean(data.healthy), version: data.version };
    },

    async listWorkspaceFiles(): Promise<ListWorkspaceFilesResponse> {
      return unwrap(client.getWorkspaceFiles());
    },

    async listWorkspaceRequests(path: string): Promise<ListWorkspaceRequestsResponse> {
      return unwrap(client.getWorkspaceRequests({ query: { path } }));
    },

    async getConfig(profile?: string): Promise<ConfigResponse> {
      return unwrap(client.getConfig({ query: { profile } }));
    },

    async getPlugins(): Promise<PluginsResponse> {
      return unwrap(client.getPlugins());
    },

    async createFlow(label?: string): Promise<CreateFlowResponse> {
      return unwrap(client.postFlows({ body: { label } }));
    },

    async finishFlow(flowId: string): Promise<FinishFlowResponse> {
      return unwrap(client.postFlowsByFlowIdFinish({ path: { flowId } }));
    },

    async getExecution(flowId: string, reqExecId: string): Promise<ExecutionDetail> {
      return unwrap(client.getFlowsByFlowIdExecutionsByReqExecId({ path: { flowId, reqExecId } }));
    },

    async executeRequest(
      flowId: string,
      path: string,
      requestIndex: number,
      profile?: string
    ): Promise<ExecuteResponse> {
      return unwrap(
        client.postExecute({
          body: {
            flowId,
            path,
            requestIndex,
            profile
          }
        })
      );
    },

    async getRunners(filePath?: string): Promise<GetRunnersResponse> {
      return unwrap(client.getScriptRunners({ query: { filePath } }));
    },

    async runScript(
      filePath: string,
      runnerId?: string,
      flowId?: string
    ): Promise<RunScriptResponse> {
      return unwrap(
        client.postScript({
          body: {
            filePath,
            runnerId,
            flowId
          }
        })
      );
    },

    async cancelScript(runId: string): Promise<void> {
      await unwrap(client.deleteScriptByRunId({ path: { runId } }));
    },

    async getTestFrameworks(filePath?: string): Promise<GetTestFrameworksResponse> {
      return unwrap(client.getTestFrameworks({ query: { filePath } }));
    },

    async runTest(
      filePath: string,
      frameworkId?: string,
      flowId?: string
    ): Promise<RunTestResponse> {
      return unwrap(
        client.postTest({
          body: {
            filePath,
            frameworkId,
            flowId
          }
        })
      );
    },

    async cancelTest(runId: string): Promise<void> {
      await unwrap(client.deleteTestByRunId({ path: { runId } }));
    },

    async getFileContent(path: string): Promise<GetFileContentResponse> {
      return unwrap(client.getWorkspaceFile({ query: { path } }));
    },

    async updateFile(path: string, content: string): Promise<void> {
      await unwrap(client.putWorkspaceFile({ body: { path, content } }));
    },

    async createFile(path: string, content?: string): Promise<void> {
      await unwrap(client.postWorkspaceFile({ body: { path, content } }));
    },

    async deleteFile(path: string): Promise<void> {
      await unwrap(client.deleteWorkspaceFile({ query: { path } }));
    },

    subscribeEvents(
      flowId: string,
      onEvent: (event: EventEnvelope) => void,
      onError: (error: Error) => void,
      onClose: () => void
    ): () => void {
      let closed = false;
      let hadSseError = false;
      const controller = new AbortController();

      const close = () => {
        if (closed) return;
        closed = true;
        onClose();
      };

      void (async () => {
        try {
          const { stream } = await client.getEvent({
            query: { flowId },
            signal: controller.signal,
            sseMaxRetryAttempts: 1,
            onSseError: (error) => {
              if (closed || controller.signal.aborted) return;
              hadSseError = true;
              onError(normalizeError(error));
            }
          });

          for await (const event of stream) {
            if (closed || controller.signal.aborted) {
              break;
            }
            onEvent(event as EventEnvelope);
          }

          if (!hadSseError) {
            close();
          }
        } catch (error) {
          if (controller.signal.aborted) {
            close();
            return;
          }
          onError(normalizeError(error));
        }
      })();

      return () => {
        if (closed) return;
        controller.abort();
        close();
      };
    },

    async streamRequest(
      flowId: string,
      path: string,
      requestIndex: number,
      options: { variables?: Record<string, unknown>; timeout?: number; lastEventId?: string } = {}
    ): Promise<SSEStreamResult> {
      let closed = false;
      let streamError: Error | undefined;
      const controller = new AbortController();

      const { stream } = await client.postExecuteSse({
        body: {
          path,
          requestIndex,
          flowId,
          ...options
        },
        signal: controller.signal,
        sseMaxRetryAttempts: 1,
        onSseError: (error) => {
          if (closed || controller.signal.aborted) return;
          streamError = normalizeError(error);
        }
      });

      async function* parseStream(): AsyncGenerator<SSEMessage> {
        for await (const event of stream) {
          if (closed || controller.signal.aborted) {
            break;
          }

          const envelope = event as EventEnvelope;
          yield {
            id: String(envelope.seq),
            event: envelope.type,
            data: JSON.stringify(envelope)
          };
        }

        if (!closed && !controller.signal.aborted && streamError) {
          throw streamError;
        }
      }

      return {
        messages: parseStream(),
        close: () => {
          if (closed) return;
          closed = true;
          controller.abort();
        }
      };
    }
  };
}
