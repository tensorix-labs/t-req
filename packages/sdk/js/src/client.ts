/**
 * @t-req/sdk/client — HTTP client for the t-req server.
 *
 * Thin wrapper over generated code. Types are re-exported so consumers
 * only need this single import for type-safe API calls.
 */

export { createClient, createConfig } from './gen/client';
export { type Options, TreqClient } from './gen/sdk.gen';
export * from './gen/types.gen';
export * from './ws';

import { createClient, createConfig } from './gen/client';
import type { Options } from './gen/sdk.gen';
import { TreqClient } from './gen/sdk.gen';
import type {
  ClientOptions,
  ImportApplyData,
  ImportApplyResponse,
  ImportPreviewData,
  ImportPreviewResponses
} from './gen/types.gen';

// Re-export SSE types for consumers
export type { ServerSentEventsResult, StreamEvent } from './gen/core/serverSentEvents.gen';

export class SDKError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'SDKError';
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Response unwrapping
// ---------------------------------------------------------------------------

/**
 * Extract the data from a generated SDK response or throw an SDKError.
 *
 * The generated client returns `{ data, error, response }` for every call.
 * `unwrap` provides a single, consistent way to handle that across all
 * consumers — no duplicate extraction logic, no divergent error handling.
 *
 * Guards against `response` being `undefined` on network errors
 * (the generated client sets `response: undefined` when fetch throws).
 */
export async function unwrap<T>(
  promise: Promise<{ data?: T; error?: unknown; response: Response }>
): Promise<T> {
  const { data, error, response } = await promise;
  if (error) {
    const status = response?.status;
    const msg =
      (error as { error?: { message?: string } })?.error?.message ??
      (error instanceof Error ? error.message : `HTTP ${status ?? 'unknown'}`);
    const code = (error as { error?: { code?: string } })?.error?.code;
    throw new SDKError(msg, status, code);
  }
  if (data === undefined) throw new SDKError('No data returned from server');
  return data;
}

// ---------------------------------------------------------------------------
// Convenience type aliases — extract named types from generated responses
// so consumers don't need to navigate Responses[200] indexing.
// ---------------------------------------------------------------------------

/** A single file in the workspace listing. */
export type WorkspaceFile =
  import('./gen/types.gen').GetWorkspaceFilesResponses[200]['files'][number];

/** A single request within a .http file. */
export type WorkspaceRequest =
  import('./gen/types.gen').GetWorkspaceRequestsResponses[200]['requests'][number];

/** Execution detail from the flows API. */
export type ExecutionDetail =
  import('./gen/types.gen').GetFlowsByFlowIdExecutionsByReqExecIdResponses[200];

/** Plugin hook execution info within an execution detail. */
export type PluginHookInfo = NonNullable<
  import('./gen/types.gen').GetFlowsByFlowIdExecutionsByReqExecIdResponses[200]['pluginHooks']
>[number];

/** Script runner option. */
export type RunnerOption =
  import('./gen/types.gen').GetScriptRunnersResponses[200]['options'][number];

/** Test framework option. */
export type TestFrameworkOption =
  import('./gen/types.gen').GetTestFrameworksResponses[200]['options'][number];

/** Flow summary (from finish flow response). */
export type FlowSummary =
  import('./gen/types.gen').PostFlowsByFlowIdFinishResponses[200]['summary'];

/** An event envelope from the /event SSE endpoint. */
export type EventEnvelope = import('./gen/types.gen').GetEventResponses[200];

/** Execute response from POST /execute. */
export type ExecuteResponse = import('./gen/types.gen').PostExecuteResponses[200];

/** Resolved configuration from GET /config. */
export type ConfigResponse = import('./gen/types.gen').GetConfigResponses[200];

/** Plugin list response from GET /plugins. */
export type PluginsResponse = import('./gen/types.gen').GetPluginsResponses[200];

/** A single plugin from the plugins response. */
export type PluginInfo = PluginsResponse['plugins'][number];

/** A plugin report emitted during execution. */
export type PluginReport = NonNullable<ExecuteResponse['pluginReports']>[number];

/** Resolved default settings from the config response. */
export type ResolvedDefaults = ConfigResponse['resolvedConfig']['defaults'];

/** Resolved cookie settings from the config response. */
export type ResolvedCookies = ConfigResponse['resolvedConfig']['cookies'];

/** Security settings from the config response. */
export type SecuritySettings = ConfigResponse['resolvedConfig']['security'];

// ---------------------------------------------------------------------------
// Import helpers (typed source-specific wrappers)
// ---------------------------------------------------------------------------

export type ImportPlanOptions = NonNullable<ImportPreviewData['body']>['planOptions'];
export type ImportApplyOptions = NonNullable<ImportApplyData['body']>['applyOptions'];
export type CurlImportPreviewResult = ImportPreviewResponses[200];
export type CurlImportApplyResult = ImportApplyResponse;

export interface CurlImportConvertOptions {
  /** Optional output filename base (without extension). */
  fileName?: string;
  /** Optional request name inside the generated .http file. */
  requestName?: string;
}

export interface CurlImportPreviewRequest {
  /** Raw curl command text. */
  command: string;
  /** Import preview planning options. */
  planOptions: ImportPlanOptions;
  /** Optional curl conversion options. */
  convertOptions?: CurlImportConvertOptions;
}

export interface CurlImportApplyRequest {
  /** Raw curl command text. */
  command: string;
  /** Import apply options. */
  applyOptions: ImportApplyOptions;
  /** Optional curl conversion options. */
  convertOptions?: CurlImportConvertOptions;
}

type ImportRequestOverrides<TData extends { url: string }, ThrowOnError extends boolean> = Omit<
  Options<TData, ThrowOnError>,
  'path' | 'body'
>;

function toImportConvertOptions(
  options: CurlImportConvertOptions | undefined
): Record<string, unknown> | undefined {
  if (!options) {
    return undefined;
  }
  return {
    ...options
  };
}

export function importCurlPreview<ThrowOnError extends boolean = false>(
  client: TreqClient,
  request: CurlImportPreviewRequest,
  options?: ImportRequestOverrides<ImportPreviewData, ThrowOnError>
) {
  const convertOptions = toImportConvertOptions(request.convertOptions);
  return client.importPreview<ThrowOnError>({
    ...(options ?? {}),
    path: { source: 'curl' },
    body: {
      input: request.command,
      ...(convertOptions ? { convertOptions } : {}),
      planOptions: request.planOptions
    }
  });
}

export function importCurlApply<ThrowOnError extends boolean = false>(
  client: TreqClient,
  request: CurlImportApplyRequest,
  options?: ImportRequestOverrides<ImportApplyData, ThrowOnError>
) {
  const convertOptions = toImportConvertOptions(request.convertOptions);
  return client.importApply<ThrowOnError>({
    ...(options ?? {}),
    path: { source: 'curl' },
    body: {
      input: request.command,
      ...(convertOptions ? { convertOptions } : {}),
      applyOptions: request.applyOptions
    }
  });
}

export async function importCurlPreviewStrict(
  client: TreqClient,
  request: CurlImportPreviewRequest,
  options?: ImportRequestOverrides<ImportPreviewData, false>
): Promise<CurlImportPreviewResult> {
  return await unwrap(importCurlPreview(client, request, options));
}

export async function importCurlApplyStrict(
  client: TreqClient,
  request: CurlImportApplyRequest,
  options?: ImportRequestOverrides<ImportApplyData, false>
): Promise<CurlImportApplyResult> {
  return await unwrap(importCurlApply(client, request, options));
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface CreateTreqClientOptions {
  /** Server base URL (default: http://localhost:4097) */
  baseUrl?: ClientOptions['baseUrl'];
  /** Bearer token for authentication */
  token?: string;
}

export function createTreqClient(options?: CreateTreqClientOptions): TreqClient {
  const client = createClient(
    createConfig<ClientOptions>({
      baseUrl: options?.baseUrl ?? 'http://localhost:4097',
      headers: options?.token ? { Authorization: `Bearer ${options.token}` } : {}
    })
  );
  return new TreqClient({ client });
}
