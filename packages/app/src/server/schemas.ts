import { z } from 'zod';

// ============================================================================
// Protocol Version
// ============================================================================

export const PROTOCOL_VERSION = '1.0';

// ============================================================================
// Common Schemas
// ============================================================================

export const DiagnosticSeveritySchema = z.enum(['error', 'warning', 'info']);

export const DiagnosticSchema = z.object({
  severity: DiagnosticSeveritySchema,
  code: z.string(),
  message: z.string(),
  range: z.object({
    start: z.object({ line: z.number(), column: z.number() }),
    end: z.object({ line: z.number(), column: z.number() })
  })
});

export const ResolvedPathsSchema = z.object({
  workspaceRoot: z.string(),
  projectRoot: z.string(),
  httpFilePath: z.string().optional(),
  basePath: z.string(),
  configPath: z.string().optional()
});

// ============================================================================
// Health Endpoint Schemas
// ============================================================================

export const HealthResponseSchema = z.object({
  healthy: z.literal(true),
  version: z.string()
});

// ============================================================================
// Capabilities Endpoint Schemas
// ============================================================================

export const CapabilitiesResponseSchema = z.object({
  protocolVersion: z.string(),
  version: z.string(),
  features: z.object({
    sessions: z.boolean(),
    diagnostics: z.boolean(),
    streamingBodies: z.boolean()
  })
});

// ============================================================================
// Parse Endpoint Schemas
// ============================================================================

const MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PATH_LENGTH = 4096;

export const ParseRequestSchema = z
  .object({
    content: z.string().max(MAX_CONTENT_SIZE).optional(),
    path: z.string().max(MAX_PATH_LENGTH).optional(),
    includeDiagnostics: z.boolean().optional().default(true)
  })
  .refine((data) => (data.content !== undefined) !== (data.path !== undefined), {
    message: 'Exactly one of "content" or "path" must be provided'
  });

export const ParsedRequestInfoSchema = z.object({
  index: z.number(),
  name: z.string().optional(),
  method: z.string(),
  url: z.string(),
  headers: z.record(z.string(), z.string()),
  hasBody: z.boolean(),
  hasFormData: z.boolean(),
  hasBodyFile: z.boolean(),
  meta: z.record(z.string(), z.string())
});

export const ParsedBlockSchema = z.object({
  request: ParsedRequestInfoSchema.optional(),
  diagnostics: z.array(DiagnosticSchema)
});

export const ParseResponseSchema = z.object({
  requests: z.array(ParsedBlockSchema),
  diagnostics: z.array(DiagnosticSchema),
  resolved: ResolvedPathsSchema
});

// ============================================================================
// Execute Endpoint Schemas
// ============================================================================

export const ExecuteRequestSchema = z
  .object({
    // Source (exactly one required)
    content: z.string().max(MAX_CONTENT_SIZE).optional(),
    path: z.string().max(MAX_PATH_LENGTH).optional(),

    // Request selection (for multi-request files)
    requestName: z.string().max(256).optional(),
    requestIndex: z.number().int().min(0).optional(),

    // Context
    sessionId: z.string().max(100).optional(),
    profile: z.string().max(100).optional(),
    variables: z.record(z.string(), z.unknown()).optional(),

    // Flow tracking (for Observer Mode)
    flowId: z.string().max(100).optional(),
    reqLabel: z.string().max(256).optional(),

    // Options
    timeoutMs: z.number().int().min(100).max(300000).optional(),
    basePath: z.string().max(MAX_PATH_LENGTH).optional(),
    followRedirects: z.boolean().optional(),
    validateSSL: z.boolean().optional()
  })
  .refine((data) => (data.content !== undefined) !== (data.path !== undefined), {
    message: 'Exactly one of "content" or "path" must be provided'
  })
  .refine((data) => !(data.requestName !== undefined && data.requestIndex !== undefined), {
    message: 'Cannot specify both "requestName" and "requestIndex"'
  });

export const ResponseHeaderSchema = z.object({
  name: z.string(),
  value: z.string()
});

export const ExecuteResponseSchema = z.object({
  runId: z.string(),

  // Flow tracking (for Observer Mode)
  reqExecId: z.string().optional(),
  flowId: z.string().optional(),

  session: z
    .object({
      sessionId: z.string(),
      snapshotVersion: z.number()
    })
    .optional(),

  request: z.object({
    index: z.number(),
    name: z.string().optional(),
    method: z.string(),
    url: z.string()
  }),

  resolved: ResolvedPathsSchema,

  response: z.object({
    status: z.number(),
    statusText: z.string(),
    headers: z.array(ResponseHeaderSchema),
    // NOTE: Streaming response bodies are not implemented yet (see capabilities.features.streamingBodies).
    bodyMode: z.enum(['buffered', 'none']),
    body: z.string().optional(),
    encoding: z.enum(['utf-8', 'base64']),
    truncated: z.boolean(),
    bodyBytes: z.number()
  }),

  limits: z.object({
    maxBodyBytes: z.number()
  }),

  timing: z.object({
    startTime: z.number(),
    endTime: z.number(),
    durationMs: z.number()
  })
});

// ============================================================================
// Session Endpoint Schemas
// ============================================================================

export const CreateSessionRequestSchema = z.object({
  variables: z.record(z.string(), z.unknown()).optional()
});

export const CreateSessionResponseSchema = z.object({
  sessionId: z.string()
});

export const SessionStateSchema = z.object({
  sessionId: z.string(),
  variables: z.record(z.string(), z.unknown()),
  cookieCount: z.number(),
  createdAt: z.number(),
  lastUsedAt: z.number(),
  snapshotVersion: z.number()
});

export const UpdateVariablesRequestSchema = z.object({
  variables: z.record(z.string(), z.unknown()),
  mode: z.enum(['merge', 'replace'])
});

export const UpdateVariablesResponseSchema = z.object({
  sessionId: z.string(),
  snapshotVersion: z.number()
});

// ============================================================================
// Event Streaming Schemas
// ============================================================================

export const EventTypeSchema = z.enum([
  'parseStarted',
  'parseFinished',
  'interpolateStarted',
  'interpolateFinished',
  'compileStarted',
  'compileFinished',
  'fetchStarted',
  'fetchFinished',
  'error',
  'sessionUpdated',
  // Flow-level events
  'flowStarted',
  'flowFinished',
  // Execution-level events
  'requestQueued',
  'executionFailed',
  // Script events
  'scriptStarted',
  'scriptOutput',
  'scriptFinished',
  // Test events
  'testStarted',
  'testOutput',
  'testFinished'
]);

export const BaseEventSchema = z.object({
  type: EventTypeSchema,
  ts: z.number(),
  runId: z.string(),
  sessionId: z.string().optional(),
  seq: z.number()
});

export const ParseStartedPayloadSchema = z.object({
  source: z.enum(['string', 'file'])
});

export const ParseFinishedPayloadSchema = z.object({
  source: z.enum(['string', 'file']),
  requestCount: z.number()
});

export const FetchStartedPayloadSchema = z.object({
  method: z.string(),
  url: z.string()
});

export const FetchFinishedPayloadSchema = z.object({
  method: z.string(),
  url: z.string(),
  status: z.number()
});

export const ErrorPayloadSchema = z.object({
  stage: z.string(),
  message: z.string()
});

export const SessionUpdatedPayloadSchema = z.object({
  variablesChanged: z.boolean(),
  cookiesChanged: z.boolean()
});

// ============================================================================
// Script Event Payload Schemas
// ============================================================================

export const ScriptStartedPayloadSchema = z.object({
  runId: z.string(),
  filePath: z.string(),
  runner: z.string()
});

export const ScriptOutputPayloadSchema = z.object({
  runId: z.string(),
  stream: z.enum(['stdout', 'stderr']),
  data: z.string()
});

export const ScriptFinishedPayloadSchema = z.object({
  runId: z.string(),
  exitCode: z.number().nullable()
});

// ============================================================================
// Test Event Payload Schemas
// ============================================================================

export const TestStartedPayloadSchema = z.object({
  runId: z.string(),
  filePath: z.string(),
  framework: z.string()
});

export const TestOutputPayloadSchema = z.object({
  runId: z.string(),
  stream: z.enum(['stdout', 'stderr']),
  data: z.string()
});

export const TestFinishedPayloadSchema = z.object({
  runId: z.string(),
  exitCode: z.number().nullable(),
  status: z.enum(['passed', 'failed'])
});

// ============================================================================
// Config Summary Schemas
// ============================================================================

export const ResolvedDefaultsSchema = z.object({
  timeoutMs: z.number(),
  followRedirects: z.boolean(),
  validateSSL: z.boolean(),
  proxy: z.string().optional(),
  headers: z.record(z.string(), z.string())
});

export const ResolvedCookiesSchema = z.object({
  enabled: z.boolean(),
  jarPath: z.string().optional(),
  mode: z.enum(['disabled', 'memory', 'persistent'])
});

export const ConfigSummaryResponseSchema = z.object({
  configPath: z.string().optional(),
  projectRoot: z.string(),
  format: z.enum(['jsonc', 'json', 'ts', 'js', 'mjs']).optional(),
  profile: z.string().optional(),
  availableProfiles: z.array(z.string()),
  layersApplied: z.array(z.string()),
  resolvedConfig: z.object({
    variables: z.record(z.string(), z.unknown()),
    defaults: ResolvedDefaultsSchema,
    cookies: ResolvedCookiesSchema,
    resolverNames: z.array(z.string())
  }),
  warnings: z.array(z.string())
});

// ============================================================================
// Error Response Schemas
// ============================================================================

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional()
  })
});

// ============================================================================
// Flow & Execution Schemas
// ============================================================================

const MAX_LABEL_LENGTH = 256;
const MAX_META_SIZE = 10;

export const CreateFlowRequestSchema = z.object({
  sessionId: z.string().max(100).optional(),
  label: z.string().max(MAX_LABEL_LENGTH).optional(),
  meta: z
    .record(z.string(), z.unknown())
    .refine((obj) => Object.keys(obj).length <= MAX_META_SIZE, {
      message: `meta object cannot have more than ${MAX_META_SIZE} keys`
    })
    .optional()
});

export const CreateFlowResponseSchema = z.object({
  flowId: z.string()
});

export const FlowSummarySchema = z.object({
  total: z.number(),
  succeeded: z.number(),
  failed: z.number(),
  durationMs: z.number()
});

export const FinishFlowResponseSchema = z.object({
  flowId: z.string(),
  summary: FlowSummarySchema
});

export const ExecutionSourceSchema = z.object({
  kind: z.enum(['file', 'string']),
  path: z.string().optional(),
  requestIndex: z.number().optional(),
  requestName: z.string().optional()
});

export const ExecutionTimingSchema = z.object({
  startTime: z.number(),
  endTime: z.number().optional(),
  durationMs: z.number().optional()
});

export const ExecutionStatusSchema = z.enum(['pending', 'running', 'success', 'failed']);

export const ExecutionErrorSchema = z.object({
  stage: z.string(),
  message: z.string()
});

export const ExecutionDetailSchema = z.object({
  reqExecId: z.string(),
  flowId: z.string(),
  sessionId: z.string().optional(),

  // Request identity
  reqLabel: z.string().optional(),
  source: ExecutionSourceSchema.optional(),
  rawHttpBlock: z.string().optional(),

  // Resolved request
  method: z.string().optional(),
  urlTemplate: z.string().optional(),
  urlResolved: z.string().optional(),
  headers: z.array(ResponseHeaderSchema).optional(),
  bodyPreview: z.string().optional(),

  // Timing
  timing: ExecutionTimingSchema,

  // Response (same shape as /execute response)
  response: z
    .object({
      status: z.number(),
      statusText: z.string(),
      headers: z.array(ResponseHeaderSchema),
      body: z.string().optional(),
      encoding: z.enum(['utf-8', 'base64']),
      truncated: z.boolean(),
      bodyBytes: z.number()
    })
    .optional(),

  // Status
  status: ExecutionStatusSchema,
  error: ExecutionErrorSchema.optional()
});

// Flow-level event payloads
export const FlowStartedPayloadSchema = z.object({
  flowId: z.string(),
  sessionId: z.string().optional(),
  label: z.string().optional(),
  ts: z.number()
});

export const FlowFinishedPayloadSchema = z.object({
  flowId: z.string(),
  summary: FlowSummarySchema
});

// Request queued event payload
export const RequestQueuedPayloadSchema = z.object({
  reqLabel: z.string().optional(),
  source: ExecutionSourceSchema.optional()
});

// Execution failed event payload
export const ExecutionFailedPayloadSchema = z.object({
  stage: z.string(),
  message: z.string()
});

// ============================================================================
// Workspace Schemas
// ============================================================================

export const WorkspaceFileSchema = z.object({
  path: z.string(),
  name: z.string(),
  requestCount: z.number(),
  lastModified: z.number()
});

export const ListWorkspaceFilesResponseSchema = z.object({
  files: z.array(WorkspaceFileSchema),
  workspaceRoot: z.string()
});

export const WorkspaceRequestSchema = z.object({
  index: z.number(),
  name: z.string().optional(),
  method: z.string(),
  url: z.string()
});

export const ListWorkspaceRequestsResponseSchema = z.object({
  path: z.string(),
  requests: z.array(WorkspaceRequestSchema)
});

// ============================================================================
// Script Execution Schemas
// ============================================================================

export const RunScriptRequestSchema = z.object({
  filePath: z.string().max(MAX_PATH_LENGTH),
  runnerId: z.string().max(50).optional(),
  flowId: z.string().max(100).optional()
});

export const RunScriptResponseSchema = z.object({
  runId: z.string(),
  flowId: z.string()
});

export const RunnerOptionSchema = z.object({
  id: z.string(),
  label: z.string()
});

export const GetRunnersResponseSchema = z.object({
  detected: z.string().nullable(),
  options: z.array(RunnerOptionSchema)
});

// ============================================================================
// Test Execution Schemas
// ============================================================================

export const RunTestRequestSchema = z.object({
  filePath: z.string().max(MAX_PATH_LENGTH),
  frameworkId: z.string().max(50).optional(),
  flowId: z.string().max(100).optional()
});

export const RunTestResponseSchema = z.object({
  runId: z.string(),
  flowId: z.string()
});

export const TestFrameworkOptionSchema = z.object({
  id: z.string(),
  label: z.string()
});

export const GetTestFrameworksResponseSchema = z.object({
  detected: z.string().nullable(),
  options: z.array(TestFrameworkOptionSchema)
});

// ============================================================================
// Type exports
// ============================================================================

export type Diagnostic = z.infer<typeof DiagnosticSchema>;
export type ResolvedPaths = z.infer<typeof ResolvedPathsSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type CapabilitiesResponse = z.infer<typeof CapabilitiesResponseSchema>;
export type ParseRequest = z.infer<typeof ParseRequestSchema>;
export type ParsedRequestInfo = z.infer<typeof ParsedRequestInfoSchema>;
export type ParsedBlock = z.infer<typeof ParsedBlockSchema>;
export type ParseResponse = z.infer<typeof ParseResponseSchema>;
export type ExecuteRequest = z.infer<typeof ExecuteRequestSchema>;
export type ResponseHeader = z.infer<typeof ResponseHeaderSchema>;
export type ExecuteResponse = z.infer<typeof ExecuteResponseSchema>;
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;
export type SessionState = z.infer<typeof SessionStateSchema>;
export type UpdateVariablesRequest = z.infer<typeof UpdateVariablesRequestSchema>;
export type UpdateVariablesResponse = z.infer<typeof UpdateVariablesResponseSchema>;
export type EventType = z.infer<typeof EventTypeSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type ConfigSummaryResponse = z.infer<typeof ConfigSummaryResponseSchema>;

// Flow & Execution types
export type CreateFlowRequest = z.infer<typeof CreateFlowRequestSchema>;
export type CreateFlowResponse = z.infer<typeof CreateFlowResponseSchema>;
export type FlowSummary = z.infer<typeof FlowSummarySchema>;
export type FinishFlowResponse = z.infer<typeof FinishFlowResponseSchema>;
export type ExecutionSource = z.infer<typeof ExecutionSourceSchema>;
export type ExecutionTiming = z.infer<typeof ExecutionTimingSchema>;
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;
export type ExecutionError = z.infer<typeof ExecutionErrorSchema>;
export type ExecutionDetail = z.infer<typeof ExecutionDetailSchema>;

// Workspace types
export type WorkspaceFile = z.infer<typeof WorkspaceFileSchema>;
export type ListWorkspaceFilesResponse = z.infer<typeof ListWorkspaceFilesResponseSchema>;
export type WorkspaceRequest = z.infer<typeof WorkspaceRequestSchema>;
export type ListWorkspaceRequestsResponse = z.infer<typeof ListWorkspaceRequestsResponseSchema>;

// Script execution types
export type RunScriptRequest = z.infer<typeof RunScriptRequestSchema>;
export type RunScriptResponse = z.infer<typeof RunScriptResponseSchema>;
export type RunnerOption = z.infer<typeof RunnerOptionSchema>;
export type GetRunnersResponse = z.infer<typeof GetRunnersResponseSchema>;

// Test execution types
export type RunTestRequest = z.infer<typeof RunTestRequestSchema>;
export type RunTestResponse = z.infer<typeof RunTestResponseSchema>;
export type TestFrameworkOption = z.infer<typeof TestFrameworkOptionSchema>;
export type GetTestFrameworksResponse = z.infer<typeof GetTestFrameworksResponseSchema>;
