import { createRoute, z } from '@hono/zod-openapi';
import {
  CapabilitiesResponseSchema,
  ConfigSummaryResponseSchema,
  CreateFlowRequestSchema,
  CreateFlowResponseSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  ErrorResponseSchema,
  ExecuteRequestSchema,
  ExecuteResponseSchema,
  ExecutionDetailSchema,
  FinishFlowResponseSchema,
  HealthResponseSchema,
  ListWorkspaceFilesResponseSchema,
  ListWorkspaceRequestsResponseSchema,
  ParseRequestSchema,
  ParseResponseSchema,
  SessionStateSchema,
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
      description: 'SSE stream'
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
