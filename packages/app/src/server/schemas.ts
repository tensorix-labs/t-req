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
    variables: z.record(z.string(), z.unknown()).optional(),

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
  'sessionUpdated'
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
