/**
 * @t-req/sdk/client — HTTP client for the t-req server.
 *
 * Thin wrapper over generated code. Types are re-exported so consumers
 * only need this single import for type-safe API calls.
 */

export { createClient, createConfig } from './gen/client';
export { type Options, TreqClient } from './gen/sdk.gen';
export * from './gen/types.gen';

import { createClient, createConfig } from './gen/client';
import { TreqClient } from './gen/sdk.gen';
import type { ClientOptions } from './gen/types.gen';

// Re-export SSE types for consumers
export type { ServerSentEventsResult, StreamEvent } from './gen/core/serverSentEvents.gen';

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
