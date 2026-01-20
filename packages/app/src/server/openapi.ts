import { createRoute, z } from '@hono/zod-openapi';
import {
  CapabilitiesResponseSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  ErrorResponseSchema,
  ExecuteRequestSchema,
  ExecuteResponseSchema,
  HealthResponseSchema,
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
    .openapi({ param: { name: 'sessionId', in: 'query' } })
});

// Event stream (SSE)
export const eventRoute = createRoute({
  method: 'get',
  path: '/event',
  tags: ['Events'],
  summary: 'Event stream (SSE)',
  description: 'Subscribe to server-sent events for real-time updates',
  request: {
    query: EventQuerySchema
  },
  responses: {
    200: {
      description: 'SSE stream'
    }
  }
});
