import { OpenAPIHono } from '@hono/zod-openapi';
import { bearerAuth } from 'hono/bearer-auth';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';
import packageJson from '../../package.json';
import { getStatusForError, TreqError, ValidationError } from './errors';
import { createEventManager, type EventEnvelope } from './events';
import {
  capabilitiesRoute,
  configRoute,
  createFlowRoute,
  createSessionRoute,
  deleteSessionRoute,
  eventRoute,
  executeRoute,
  finishFlowRoute,
  getExecutionRoute,
  getSessionRoute,
  healthRoute,
  listWorkspaceFilesRoute,
  listWorkspaceRequestsRoute,
  parseRoute,
  updateSessionVariablesRoute
} from './openapi';
import type { ErrorResponse } from './schemas';
import { createService, resolveWorkspaceRoot } from './service';

const SERVER_VERSION = packageJson.version;

// ============================================================================
// Server Configuration
// ============================================================================

export type ServerConfig = {
  workspace?: string;
  port: number;
  host: string;
  token?: string;
  corsOrigins?: string[];
  maxBodyBytes: number;
  maxSessions: number;
};

// ============================================================================
// Create Hono App
// ============================================================================

export function createApp(config: ServerConfig) {
  const app = new OpenAPIHono();
  const workspaceRoot = resolveWorkspaceRoot(config.workspace);
  const eventManager = createEventManager();

  const service = createService({
    workspaceRoot,
    maxBodyBytes: config.maxBodyBytes,
    maxSessions: config.maxSessions,
    onEvent: (sessionId, runId, event) => {
      eventManager.emit(sessionId, runId, event);
    }
  });

  // ============================================================================
  // Middleware
  // ============================================================================

  // CORS middleware with function-based origin validation
  if (config.corsOrigins && config.corsOrigins.length > 0) {
    const allowedOrigins = new Set(config.corsOrigins);

    app.use(
      '*',
      cors({
        origin: (origin) => {
          if (!origin) return undefined;
          // Allow localhost origins by default
          if (origin.startsWith('http://localhost:')) return origin;
          if (origin.startsWith('http://127.0.0.1:')) return origin;
          // Check configured origins
          if (allowedOrigins.has(origin)) return origin;
          return undefined; // Deny
        },
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
        exposeHeaders: ['Content-Length'],
        maxAge: 86400,
        credentials: true
      })
    );
  }

  // Bearer auth middleware (if token configured)
  if (config.token) {
    app.use('*', bearerAuth({ token: config.token }));
  }

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.getResponse();
    }

    console.error('Server error:', err);

    if (err instanceof TreqError) {
      return c.json(err.toObject(), getStatusForError(err));
    }

    const response: ErrorResponse = {
      error: {
        code: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : String(err)
      }
    };
    return c.json(response, 500);
  });

  // ============================================================================
  // Health Endpoint
  // ============================================================================

  app.openapi(healthRoute, (c) => {
    return c.json(service.health());
  });

  // ============================================================================
  // Capabilities Endpoint
  // ============================================================================

  app.openapi(capabilitiesRoute, (c) => {
    return c.json(service.capabilities());
  });

  // ============================================================================
  // Config Endpoint
  // ============================================================================

  app.openapi(configRoute, async (c) => {
    const { profile, path } = c.req.valid('query');
    const result = await service.getConfig({ profile, path });
    return c.json(result, 200);
  });

  // ============================================================================
  // Parse Endpoint
  // ============================================================================

  app.openapi(parseRoute, async (c) => {
    const request = c.req.valid('json');
    const result = await service.parse(request);
    return c.json(result, 200);
  });

  // ============================================================================
  // Execute Endpoint
  // ============================================================================

  app.openapi(executeRoute, async (c) => {
    const request = c.req.valid('json');
    const result = await service.execute(request);
    return c.json(result, 200);
  });

  // ============================================================================
  // Session Endpoints
  // ============================================================================

  app.openapi(createSessionRoute, (c) => {
    const request = c.req.valid('json');
    const result = service.createSession(request);
    return c.json(result, 201);
  });

  app.openapi(getSessionRoute, (c) => {
    const { id } = c.req.valid('param');
    const result = service.getSession(id);
    return c.json(result, 200);
  });

  app.openapi(updateSessionVariablesRoute, async (c) => {
    const { id } = c.req.valid('param');
    const request = c.req.valid('json');
    const result = await service.updateSessionVariables(id, request);
    return c.json(result, 200);
  });

  app.openapi(deleteSessionRoute, (c) => {
    const { id } = c.req.valid('param');
    service.deleteSession(id);
    return c.body(null, 204);
  });

  // ============================================================================
  // Flow Endpoints (Observer Mode)
  // ============================================================================

  app.openapi(createFlowRoute, (c) => {
    const request = c.req.valid('json');
    const result = service.createFlow(request);
    return c.json(result, 201);
  });

  app.openapi(finishFlowRoute, (c) => {
    const { flowId } = c.req.valid('param');
    const result = service.finishFlow(flowId);
    return c.json(result, 200);
  });

  app.openapi(getExecutionRoute, (c) => {
    const { flowId, reqExecId } = c.req.valid('param');
    const result = service.getExecution(flowId, reqExecId);
    return c.json(result, 200);
  });

  // ============================================================================
  // Workspace Endpoints
  // ============================================================================

  app.openapi(listWorkspaceFilesRoute, async (c) => {
    const { ignore } = c.req.valid('query');
    const additionalIgnore = ignore ? ignore.split(',').map((p) => p.trim()) : undefined;
    const result = await service.listWorkspaceFiles(additionalIgnore);
    return c.json(result, 200);
  });

  app.openapi(listWorkspaceRequestsRoute, async (c) => {
    const { path } = c.req.valid('query');
    const result = await service.listWorkspaceRequests(path);
    return c.json(result, 200);
  });

  // ============================================================================
  // Event Streaming (SSE)
  // ============================================================================

  app.openapi(eventRoute, async (c) => {
    const { sessionId, flowId } = c.req.valid('query');

    // Require sessionId or flowId when auth is enabled (prevents cross-session leakage)
    if (config.token && !sessionId && !flowId) {
      throw new ValidationError(
        'sessionId or flowId query parameter is required when authentication is enabled'
      );
    }

    return streamSSE(c, async (stream) => {
      let subscriberId: string | undefined;

      const send = (event: EventEnvelope) => {
        stream.writeSSE({
          data: JSON.stringify(event),
          event: event.type,
          id: `${event.runId}-${event.seq}`
        });
      };

      const close = () => {
        stream.close();
      };

      subscriberId = eventManager.subscribe(sessionId, send, close, flowId);

      // Send initial connection event
      stream.writeSSE({
        data: JSON.stringify({ connected: true, sessionId, flowId }),
        event: 'connected'
      });

      // Keep connection alive with periodic heartbeats
      const heartbeatInterval = setInterval(() => {
        try {
          stream.writeSSE({
            data: JSON.stringify({ ts: Date.now() }),
            event: 'heartbeat'
          });
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 30000);

      // Handle abort signal for cleanup
      const abortHandler = () => {
        clearInterval(heartbeatInterval);
        if (subscriberId) {
          eventManager.unsubscribe(subscriberId);
        }
      };

      // Use AbortController pattern for Bun compatibility
      const rawRequest = c.req.raw as unknown as { signal?: AbortSignal };
      const signal = rawRequest.signal;
      if (signal) {
        signal.addEventListener('abort', abortHandler);
      }

      // Keep the stream open until aborted
      await new Promise<void>((resolve) => {
        if (signal) {
          if (signal.aborted) {
            resolve();
          } else {
            signal.addEventListener('abort', () => resolve());
          }
        }
      });
    });
  });

  // ============================================================================
  // OpenAPI Documentation
  // ============================================================================

  app.doc('/doc', {
    openapi: '3.0.3',
    info: {
      title: 't-req Server API',
      version: SERVER_VERSION,
      description:
        'HTTP API for parsing and executing .http files, managing sessions, and subscribing to real-time events.',
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: `http://${config.host}:${config.port}`,
        description: 'Local development server'
      }
    ],
    tags: [
      { name: 'System', description: 'System endpoints for health checks and capabilities' },
      { name: 'Requests', description: 'Parse and execute HTTP requests from .http files' },
      { name: 'Sessions', description: 'Manage stateful sessions with variables and cookies' },
      { name: 'Flows', description: 'Observer Mode - track and correlate request executions' },
      { name: 'Workspace', description: 'Workspace discovery - list .http files and requests' },
      { name: 'Events', description: 'Real-time event streaming via Server-Sent Events' }
    ],
    externalDocs: {
      description: 't-req Documentation',
      url: 'https://github.com/tensorix-labs/t-req'
    }
  });

  return { app, service, eventManager, workspaceRoot };
}
