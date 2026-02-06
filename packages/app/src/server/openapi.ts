import { createRoute, z } from '@hono/zod-openapi';
import {
  CapabilitiesResponseSchema,
  ConfigSummaryResponseSchema,
  CreateFileRequestSchema,
  CreateFlowRequestSchema,
  CreateFlowResponseSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  ErrorResponseSchema,
  EventEnvelopeSchema,
  ExecuteRequestSchema,
  ExecuteResponseSchema,
  ExecuteSSERequestSchema,
  ExecutionDetailSchema,
  FinishFlowResponseSchema,
  GetFileContentResponseSchema,
  GetRunnersResponseSchema,
  GetTestFrameworksResponseSchema,
  HealthResponseSchema,
  ListWorkspaceFilesResponseSchema,
  ListWorkspaceRequestsResponseSchema,
  ParseRequestSchema,
  ParseResponseSchema,
  PluginsResponseSchema,
  RunScriptRequestSchema,
  RunScriptResponseSchema,
  RunTestRequestSchema,
  RunTestResponseSchema,
  SessionStateSchema,
  UpdateFileRequestSchema,
  UpdateVariablesRequestSchema,
  UpdateVariablesResponseSchema
} from './schemas';

// ============================================================================
// Route Definitions
// ============================================================================

// Health check
export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['System'],
  summary: 'Health check',
  description: 'Check if the server is running and healthy',
  responses: {
    200: {
      content: { 'application/json': { schema: HealthResponseSchema } },
      description: 'Server is healthy'
    }
  }
});

// Capabilities
export const capabilitiesRoute = createRoute({
  method: 'get',
  path: '/capabilities',
  tags: ['System'],
  summary: 'Get server capabilities',
  description: 'Returns the protocol version and supported features',
  responses: {
    200: {
      content: { 'application/json': { schema: CapabilitiesResponseSchema } },
      description: 'Server capabilities'
    }
  }
});

// Parse
export const parseRoute = createRoute({
  method: 'post',
  path: '/parse',
  tags: ['Requests'],
  summary: 'Parse .http file content',
  description:
    'Parse HTTP request content and return structured request information with diagnostics',
  request: {
    body: {
      content: { 'application/json': { schema: ParseRequestSchema } }
    }
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ParseResponseSchema } },
      description: 'Parsed requests with diagnostics'
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Invalid request'
    }
  }
});

// Execute
export const executeRoute = createRoute({
  method: 'post',
  path: '/execute',
  tags: ['Requests'],
  summary: 'Execute HTTP request',
  description: 'Execute an HTTP request from .http file content or file path',
  request: {
    body: {
      content: { 'application/json': { schema: ExecuteRequestSchema } }
    }
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ExecuteResponseSchema } },
      description: 'Request executed successfully'
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Invalid request'
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Request not found'
    }
  }
});

// Execute SSE stream
export const executeSSERoute = createRoute({
  method: 'post',
  path: '/execute/sse',
  tags: ['Requests'],
  summary: 'Execute SSE streaming request',
  description:
    'Execute an SSE (Server-Sent Events) request and stream events. Request must have @sse directive or Accept: text/event-stream header.',
  request: {
    body: {
      content: { 'application/json': { schema: ExecuteSSERequestSchema } }
    }
  },
  responses: {
    200: {
      description: 'SSE event stream',
      content: { 'text/event-stream': { schema: EventEnvelopeSchema } }
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Invalid request or not an SSE request'
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Request not found'
    }
  }
});

// Session param schema
const SessionIdParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .openapi({ param: { name: 'id', in: 'path' }, example: 'abc123' })
});

// Create session
export const createSessionRoute = createRoute({
  method: 'post',
  path: '/session',
  tags: ['Sessions'],
  summary: 'Create a new session',
  description: 'Create a new session with optional initial variables',
  request: {
    body: {
      content: { 'application/json': { schema: CreateSessionRequestSchema } }
    }
  },
  responses: {
    201: {
      content: { 'application/json': { schema: CreateSessionResponseSchema } },
      description: 'Session created'
    }
  }
});

// Get session
export const getSessionRoute = createRoute({
  method: 'get',
  path: '/session/{id}',
  tags: ['Sessions'],
  summary: 'Get session state',
  description: 'Retrieve the current state of a session',
  request: {
    params: SessionIdParamSchema
  },
  responses: {
    200: {
      content: { 'application/json': { schema: SessionStateSchema } },
      description: 'Session state'
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Session not found'
    }
  }
});

// Update session variables
export const updateSessionVariablesRoute = createRoute({
  method: 'put',
  path: '/session/{id}/variables',
  tags: ['Sessions'],
  summary: 'Update session variables',
  description: 'Update session variables using merge or replace mode',
  request: {
    params: SessionIdParamSchema,
    body: {
      content: { 'application/json': { schema: UpdateVariablesRequestSchema } }
    }
  },
  responses: {
    200: {
      content: { 'application/json': { schema: UpdateVariablesResponseSchema } },
      description: 'Variables updated'
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Session not found'
    }
  }
});

// Delete session
export const deleteSessionRoute = createRoute({
  method: 'delete',
  path: '/session/{id}',
  tags: ['Sessions'],
  summary: 'Delete a session',
  description: 'Delete a session and its associated data',
  request: {
    params: SessionIdParamSchema
  },
  responses: {
    204: {
      description: 'Session deleted'
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Session not found'
    }
  }
});

// Event stream query schema
const EventQuerySchema = z.object({
  sessionId: z
    .string()
    .optional()
    .openapi({ param: { name: 'sessionId', in: 'query' } }),
  flowId: z
    .string()
    .optional()
    .openapi({ param: { name: 'flowId', in: 'query' } })
});

// Event stream (SSE)
export const eventRoute = createRoute({
  method: 'get',
  path: '/event',
  tags: ['Events'],
  summary: 'Event stream (SSE)',
  description:
    'Subscribe to server-sent events for real-time updates. Filter by sessionId or flowId.',
  request: {
    query: EventQuerySchema
  },
  responses: {
    200: {
      description: 'SSE stream',
      content: { 'text/event-stream': { schema: EventEnvelopeSchema } }
    }
  }
});

// Config query schema
const ConfigQuerySchema = z.object({
  profile: z
    .string()
    .optional()
    .openapi({ param: { name: 'profile', in: 'query' } }),
  path: z
    .string()
    .optional()
    .openapi({ param: { name: 'path', in: 'query' } })
});

// Config summary
export const configRoute = createRoute({
  method: 'get',
  path: '/config',
  tags: ['System'],
  summary: 'Get resolved configuration',
  description:
    'Returns the resolved project configuration including active profile, layers applied, and cookie settings',
  request: {
    query: ConfigQuerySchema
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ConfigSummaryResponseSchema } },
      description: 'Resolved configuration summary'
    }
  }
});

// ============================================================================
// Flow Endpoints (Observer Mode)
// ============================================================================

// Create flow
export const createFlowRoute = createRoute({
  method: 'post',
  path: '/flows',
  tags: ['Flows'],
  summary: 'Create a new flow',
  description: 'Create a new flow to group related request executions for Observer Mode',
  request: {
    body: {
      content: { 'application/json': { schema: CreateFlowRequestSchema } }
    }
  },
  responses: {
    201: {
      content: { 'application/json': { schema: CreateFlowResponseSchema } },
      description: 'Flow created'
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Session not found (if sessionId provided)'
    }
  }
});

// Flow param schema
const FlowIdParamSchema = z.object({
  flowId: z
    .string()
    .min(1)
    .openapi({ param: { name: 'flowId', in: 'path' }, example: 'flow_abc123' })
});

// Finish flow
export const finishFlowRoute = createRoute({
  method: 'post',
  path: '/flows/{flowId}/finish',
  tags: ['Flows'],
  summary: 'Mark flow as complete',
  description: 'Mark a flow as complete and get summary statistics',
  request: {
    params: FlowIdParamSchema
  },
  responses: {
    200: {
      content: { 'application/json': { schema: FinishFlowResponseSchema } },
      description: 'Flow finished with summary'
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Flow not found'
    }
  }
});

// Execution params schema
const ExecutionParamsSchema = z.object({
  flowId: z
    .string()
    .min(1)
    .openapi({ param: { name: 'flowId', in: 'path' }, example: 'flow_abc123' }),
  reqExecId: z
    .string()
    .min(1)
    .openapi({ param: { name: 'reqExecId', in: 'path' }, example: 'exec_def456' })
});

// Get execution details
export const getExecutionRoute = createRoute({
  method: 'get',
  path: '/flows/{flowId}/executions/{reqExecId}',
  tags: ['Flows'],
  summary: 'Get execution details',
  description: 'Retrieve full request/response details for a specific execution',
  request: {
    params: ExecutionParamsSchema
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ExecutionDetailSchema } },
      description: 'Execution details'
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Flow or execution not found'
    }
  }
});

// ============================================================================
// Workspace Endpoints
// ============================================================================

// Workspace files query schema
const WorkspaceFilesQuerySchema = z.object({
  ignore: z
    .string()
    .optional()
    .openapi({
      param: { name: 'ignore', in: 'query' },
      description: 'Comma-separated additional glob patterns to ignore'
    })
});

// List workspace files
export const listWorkspaceFilesRoute = createRoute({
  method: 'get',
  path: '/workspace/files',
  tags: ['Workspace'],
  summary: 'List .http files',
  description: 'List all .http files in the workspace',
  request: {
    query: WorkspaceFilesQuerySchema
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ListWorkspaceFilesResponseSchema } },
      description: 'List of .http files'
    }
  }
});

// Workspace requests query schema
const WorkspaceRequestsQuerySchema = z.object({
  path: z.string().openapi({
    param: { name: 'path', in: 'query' },
    description: 'Path to .http file (relative to workspace)'
  })
});

// List requests in file
export const listWorkspaceRequestsRoute = createRoute({
  method: 'get',
  path: '/workspace/requests',
  tags: ['Workspace'],
  summary: 'List requests in file',
  description: 'List all requests in a specific .http file',
  request: {
    query: WorkspaceRequestsQuerySchema
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ListWorkspaceRequestsResponseSchema } },
      description: 'List of requests'
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Invalid path'
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'File not found'
    }
  }
});

// File path query schema (for GET and DELETE)
const FilePathQuerySchema = z.object({
  path: z.string().openapi({
    param: { name: 'path', in: 'query' },
    description: 'Path to .http file (relative to workspace)'
  })
});

// Get file content
export const getFileContentRoute = createRoute({
  method: 'get',
  path: '/workspace/file',
  tags: ['Workspace'],
  summary: 'Get file content',
  description: 'Get raw content of an .http file',
  request: {
    query: FilePathQuerySchema
  },
  responses: {
    200: {
      content: { 'application/json': { schema: GetFileContentResponseSchema } },
      description: 'File content'
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Invalid path'
    },
    403: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Path outside workspace'
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'File not found'
    }
  }
});

// Update file
export const updateFileRoute = createRoute({
  method: 'put',
  path: '/workspace/file',
  tags: ['Workspace'],
  summary: 'Update file',
  description: 'Update content of an existing .http file',
  request: {
    body: {
      content: { 'application/json': { schema: UpdateFileRequestSchema } }
    }
  },
  responses: {
    200: {
      description: 'File updated successfully'
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Invalid request'
    },
    403: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Path outside workspace'
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'File not found'
    }
  }
});

// Create file
export const createFileRoute = createRoute({
  method: 'post',
  path: '/workspace/file',
  tags: ['Workspace'],
  summary: 'Create file',
  description: 'Create a new .http file',
  request: {
    body: {
      content: { 'application/json': { schema: CreateFileRequestSchema } }
    }
  },
  responses: {
    201: {
      content: { 'application/json': { schema: GetFileContentResponseSchema } },
      description: 'File created'
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Invalid path or file already exists'
    },
    403: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Path outside workspace'
    }
  }
});

// Delete file
export const deleteFileRoute = createRoute({
  method: 'delete',
  path: '/workspace/file',
  tags: ['Workspace'],
  summary: 'Delete file',
  description: 'Delete an .http file from the workspace',
  request: {
    query: FilePathQuerySchema
  },
  responses: {
    204: {
      description: 'File deleted'
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Invalid request'
    },
    403: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Path outside workspace'
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'File not found'
    }
  }
});

// ============================================================================
// Script Endpoints
// ============================================================================

// Run script
export const runScriptRoute = createRoute({
  method: 'post',
  path: '/script',
  tags: ['Scripts'],
  summary: 'Run a script',
  description:
    'Execute a JavaScript, TypeScript, or Python script with server-side process spawning',
  request: {
    body: {
      content: { 'application/json': { schema: RunScriptRequestSchema } }
    }
  },
  responses: {
    200: {
      content: { 'application/json': { schema: RunScriptResponseSchema } },
      description: 'Script started, subscribe to flow SSE for output'
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Invalid request or runner'
    },
    403: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Path outside workspace'
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Flow not found (if flowId provided)'
    }
  }
});

// Script run ID param schema
const ScriptRunIdParamSchema = z.object({
  runId: z
    .string()
    .min(1)
    .openapi({ param: { name: 'runId', in: 'path' }, example: 'script_abc123' })
});

// Cancel script
export const cancelScriptRoute = createRoute({
  method: 'delete',
  path: '/script/{runId}',
  tags: ['Scripts'],
  summary: 'Cancel a running script',
  description: 'Stop a running script by its run ID',
  request: {
    params: ScriptRunIdParamSchema
  },
  responses: {
    204: {
      description: 'Script cancelled'
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Script not found or already finished'
    }
  }
});

// Script runners query schema
const ScriptRunnersQuerySchema = z.object({
  filePath: z
    .string()
    .optional()
    .openapi({
      param: { name: 'filePath', in: 'query' },
      description: 'Optional file path to filter available runners'
    })
});

// Get runners
export const getRunnersRoute = createRoute({
  method: 'get',
  path: '/script/runners',
  tags: ['Scripts'],
  summary: 'Get available script runners',
  description: 'List available runners and auto-detect the best one for a file',
  request: {
    query: ScriptRunnersQuerySchema
  },
  responses: {
    200: {
      content: { 'application/json': { schema: GetRunnersResponseSchema } },
      description: 'Available runners with detected default'
    }
  }
});

// ============================================================================
// Test Endpoints
// ============================================================================

// Run test
export const runTestRoute = createRoute({
  method: 'post',
  path: '/test',
  tags: ['Tests'],
  summary: 'Run tests',
  description: 'Execute tests using a detected or specified test framework',
  request: {
    body: {
      content: { 'application/json': { schema: RunTestRequestSchema } }
    }
  },
  responses: {
    200: {
      content: { 'application/json': { schema: RunTestResponseSchema } },
      description: 'Tests started, subscribe to flow SSE for output'
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Invalid request or framework'
    },
    403: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Path outside workspace'
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Flow not found (if flowId provided)'
    }
  }
});

// Test run ID param schema
const TestRunIdParamSchema = z.object({
  runId: z
    .string()
    .min(1)
    .openapi({ param: { name: 'runId', in: 'path' }, example: 'test_abc123' })
});

// Cancel test
export const cancelTestRoute = createRoute({
  method: 'delete',
  path: '/test/{runId}',
  tags: ['Tests'],
  summary: 'Cancel a running test',
  description: 'Stop a running test by its run ID',
  request: {
    params: TestRunIdParamSchema
  },
  responses: {
    204: {
      description: 'Test cancelled'
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Test not found or already finished'
    }
  }
});

// Test frameworks query schema
const TestFrameworksQuerySchema = z.object({
  filePath: z
    .string()
    .optional()
    .openapi({
      param: { name: 'filePath', in: 'query' },
      description: 'Optional file path to help detect the framework'
    })
});

// Get test frameworks
export const getTestFrameworksRoute = createRoute({
  method: 'get',
  path: '/test/frameworks',
  tags: ['Tests'],
  summary: 'Get available test frameworks',
  description: 'List available test frameworks and auto-detect the best one',
  request: {
    query: TestFrameworksQuerySchema
  },
  responses: {
    200: {
      content: { 'application/json': { schema: GetTestFrameworksResponseSchema } },
      description: 'Available frameworks with detected default'
    }
  }
});

// ============================================================================
// Plugin Endpoints
// ============================================================================

// List plugins
export const pluginsRoute = createRoute({
  method: 'get',
  path: '/plugins',
  tags: ['Plugins'],
  summary: 'List loaded plugins',
  description:
    'Returns information about all loaded plugins including their capabilities and permissions',
  responses: {
    200: {
      content: { 'application/json': { schema: PluginsResponseSchema } },
      description: 'List of loaded plugins with their capabilities'
    }
  }
});
