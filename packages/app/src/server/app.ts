import { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';
import packageJson from '../../package.json';
import {
  createAuthMiddleware,
  type ScriptTokenPayload,
  startScriptTokenCleanup,
  startSessionCleanup,
  stopScriptTokenCleanup,
  stopSessionCleanup
} from './auth';

export type { WebConfig } from './web';

import { getStatusForError, TreqError, ValidationError } from './errors';
import { createEventManager, type EventEnvelope } from './events';
import {
  cancelScriptRoute,
  cancelTestRoute,
  capabilitiesRoute,
  configRoute,
  createFlowRoute,
  createSessionRoute,
  deleteSessionRoute,
  eventRoute,
  executeRoute,
  finishFlowRoute,
  getExecutionRoute,
  getRunnersRoute,
  getSessionRoute,
  getTestFrameworksRoute,
  healthRoute,
  listWorkspaceFilesRoute,
  listWorkspaceRequestsRoute,
  parseRoute,
  pluginsRoute,
  runScriptRoute,
  runTestRoute,
  updateSessionVariablesRoute
} from './openapi';
import type { ErrorResponse } from './schemas';
import { createService, resolveWorkspaceRoot } from './service';
import { createWebRoutes, isApiPath, type WebConfig } from './web';

const SERVER_VERSION = packageJson.version;
const SSE_HEARTBEAT_INTERVAL_MS = 5000;

// ============================================================================
// Script Token Authorization Helper
// ============================================================================

/**
 * Options for enforceScriptScope.
 */
interface EnforceScriptScopeOptions {
  /** Whether this endpoint is allowed for script tokens at all */
  allowedEndpoint: boolean;
  /** If specified, the script token's flowId must match this value */
  requiredFlowId?: string;
  /** If specified, the script token's sessionId must match this value */
  requiredSessionId?: string;
}

/**
 * Enforce script token scope restrictions.
 *
 * When a request is authenticated via script token, this function enforces
 * that the token's scope (flowId, sessionId) matches the requested resource.
 *
 * For non-script auth methods (bearer, cookie, none), this is a no-op.
 *
 * @throws HTTPException 403 if endpoint not allowed for scripts
 * @throws HTTPException 403 if flowId/sessionId mismatch
 */
function enforceScriptScope(c: Context, opts: EnforceScriptScopeOptions): void {
  const authMethod = c.get('authMethod');
  if (authMethod !== 'script') return; // Not a script token, no restrictions

  const payload = c.get('scriptTokenPayload') as ScriptTokenPayload | undefined;
  if (!payload) {
    throw new HTTPException(401, { message: 'Missing script token payload' });
  }

  if (!opts.allowedEndpoint) {
    throw new HTTPException(403, { message: 'Endpoint not allowed for script tokens' });
  }

  if (opts.requiredFlowId && opts.requiredFlowId !== payload.flowId) {
    throw new HTTPException(403, { message: 'Flow ID mismatch' });
  }

  if (opts.requiredSessionId && opts.requiredSessionId !== payload.sessionId) {
    throw new HTTPException(403, { message: 'Session ID mismatch' });
  }
}

export type ServerConfig = {
  workspace?: string;
  port: number;
  host: string;
  token?: string;
  corsOrigins?: string[];
  maxBodyBytes: number;
  maxSessions: number;
  /** Allow cookie-based authentication (default: true). Set to false for expose mode. */
  allowCookieAuth?: boolean;
  web?: WebConfig;
};

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

  const allowedOrigins = new Set(config.corsOrigins ?? []);

  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return undefined;
        if (origin.startsWith('http://localhost:')) return origin;
        if (origin.startsWith('http://127.0.0.1:')) return origin;
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

  // Auth middleware (supports bearer token + cookie sessions)
  // Note: Auth is applied to API paths. Web routes handle their own auth for /auth/* paths.
  const allowCookieAuth = config.allowCookieAuth ?? true;
  const authMiddleware = createAuthMiddleware({
    token: config.token,
    allowCookieAuth
  });

  // Start session cleanup if cookie auth is allowed
  if (allowCookieAuth) {
    startSessionCleanup();
  }

  // Start script token cleanup (always needed when token auth is enabled)
  if (config.token) {
    startScriptTokenCleanup();
  }

  // Apply auth to all API paths (non-web routes)
  app.use('*', async (c, next) => {
    const pathname = new URL(c.req.url).pathname;

    // Skip auth for web routes (they handle their own auth)
    // /auth/* routes need to be accessible without auth
    if (pathname.startsWith('/auth/')) {
      return next();
    }

    // Skip auth for web UI routes (non-API paths) when web is enabled
    if (config.web?.enabled && !isApiPath(pathname)) {
      return next();
    }

    // Apply auth middleware to API paths
    return authMiddleware(c, next);
  });

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
    // Script tokens cannot access config (may leak sensitive structure)
    enforceScriptScope(c, { allowedEndpoint: false });

    const { profile, path } = c.req.valid('query');
    const result = await service.getConfig({ profile, path });
    return c.json(result, 200);
  });

  // ============================================================================
  // Parse Endpoint
  // ============================================================================

  app.openapi(parseRoute, async (c) => {
    // Script tokens cannot use parse endpoint (unnecessary for execution)
    enforceScriptScope(c, { allowedEndpoint: false });

    const request = c.req.valid('json');
    const result = await service.parse(request);
    return c.json(result, 200);
  });

  // ============================================================================
  // Execute Endpoint
  // ============================================================================

  app.openapi(executeRoute, async (c) => {
    const request = c.req.valid('json');

    // Script tokens can execute, but must use their assigned flow/session
    const payload = c.get('scriptTokenPayload') as ScriptTokenPayload | undefined;
    if (payload) {
      enforceScriptScope(c, {
        allowedEndpoint: true,
        requiredFlowId: request.flowId,
        requiredSessionId: request.sessionId
      });
    }

    const result = await service.execute(request);
    return c.json(result, 200);
  });

  // ============================================================================
  // Session Endpoints
  // ============================================================================

  app.openapi(createSessionRoute, (c) => {
    // Script tokens cannot create sessions (use pre-created session)
    enforceScriptScope(c, { allowedEndpoint: false });

    const request = c.req.valid('json');
    const result = service.createSession(request);
    return c.json(result, 201);
  });

  app.openapi(getSessionRoute, (c) => {
    // Script tokens cannot read session data (unnecessary surface area)
    enforceScriptScope(c, { allowedEndpoint: false });

    const { id } = c.req.valid('param');
    const result = service.getSession(id);
    return c.json(result, 200);
  });

  app.openapi(updateSessionVariablesRoute, async (c) => {
    const { id } = c.req.valid('param');

    // Script tokens can update variables, but only for their own session
    enforceScriptScope(c, { allowedEndpoint: true, requiredSessionId: id });

    const request = c.req.valid('json');
    const result = await service.updateSessionVariables(id, request);
    return c.json(result, 200);
  });

  app.openapi(deleteSessionRoute, (c) => {
    // Script tokens cannot delete sessions
    enforceScriptScope(c, { allowedEndpoint: false });

    const { id } = c.req.valid('param');
    service.deleteSession(id);
    return c.body(null, 204);
  });

  // ============================================================================
  // Flow Endpoints (Observer Mode)
  // ============================================================================

  app.openapi(createFlowRoute, (c) => {
    // Script tokens cannot create flows (use pre-created flow)
    enforceScriptScope(c, { allowedEndpoint: false });

    const request = c.req.valid('json');
    const result = service.createFlow(request);
    return c.json(result, 201);
  });

  app.openapi(finishFlowRoute, (c) => {
    // Script tokens cannot finish flows
    enforceScriptScope(c, { allowedEndpoint: false });

    const { flowId } = c.req.valid('param');
    const result = service.finishFlow(flowId);
    return c.json(result, 200);
  });

  app.openapi(getExecutionRoute, (c) => {
    const { flowId, reqExecId } = c.req.valid('param');

    // Script tokens can read executions, but only from their own flow
    enforceScriptScope(c, { allowedEndpoint: true, requiredFlowId: flowId });

    const result = service.getExecution(flowId, reqExecId);
    return c.json(result, 200);
  });

  // ============================================================================
  // Workspace Endpoints
  // ============================================================================

  app.openapi(listWorkspaceFilesRoute, async (c) => {
    // Script tokens cannot list workspace files (prevents file enumeration)
    enforceScriptScope(c, { allowedEndpoint: false });

    const { ignore } = c.req.valid('query');
    const additionalIgnore = ignore ? ignore.split(',').map((p) => p.trim()) : undefined;
    const result = await service.listWorkspaceFiles(additionalIgnore);
    return c.json(result, 200);
  });

  app.openapi(listWorkspaceRequestsRoute, async (c) => {
    // Script tokens cannot list workspace requests (prevents file enumeration)
    enforceScriptScope(c, { allowedEndpoint: false });

    const { path } = c.req.valid('query');
    const result = await service.listWorkspaceRequests(path);
    return c.json(result, 200);
  });

  // ============================================================================
  // Script Endpoints
  // ============================================================================

  // Build server URL from config
  const serverUrl = `http://${config.host}:${config.port}`;

  app.openapi(runScriptRoute, async (c) => {
    // Script tokens cannot spawn nested scripts
    enforceScriptScope(c, { allowedEndpoint: false });

    const request = c.req.valid('json');
    const result = await service.executeScript(request, serverUrl, config.token);
    return c.json(result, 200);
  });

  app.openapi(cancelScriptRoute, (c) => {
    // Script tokens cannot cancel scripts
    enforceScriptScope(c, { allowedEndpoint: false });

    const { runId } = c.req.valid('param');
    const found = service.stopScript(runId);
    if (!found) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Script not found' } }, 404);
    }
    return c.body(null, 204);
  });

  app.openapi(getRunnersRoute, async (c) => {
    // Script tokens cannot list runners
    enforceScriptScope(c, { allowedEndpoint: false });

    const { filePath } = c.req.valid('query');
    const result = await service.getRunners(filePath);
    return c.json(result, 200);
  });

  // ============================================================================
  // Test Endpoints
  // ============================================================================

  app.openapi(runTestRoute, async (c) => {
    // Script tokens cannot spawn nested tests
    enforceScriptScope(c, { allowedEndpoint: false });

    const request = c.req.valid('json');
    const result = await service.executeTest(request, serverUrl, config.token);
    return c.json(result, 200);
  });

  app.openapi(cancelTestRoute, (c) => {
    // Script tokens cannot cancel tests
    enforceScriptScope(c, { allowedEndpoint: false });

    const { runId } = c.req.valid('param');
    const found = service.stopTest(runId);
    if (!found) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Test not found' } }, 404);
    }
    return c.body(null, 204);
  });

  app.openapi(getTestFrameworksRoute, async (c) => {
    // Script tokens cannot list test frameworks
    enforceScriptScope(c, { allowedEndpoint: false });

    const { filePath } = c.req.valid('query');
    const result = await service.getTestFrameworks(filePath);
    return c.json(result, 200);
  });

  // ============================================================================
  // Plugin Endpoints
  // ============================================================================

  app.openapi(pluginsRoute, async (c) => {
    // Script tokens cannot list plugins
    enforceScriptScope(c, { allowedEndpoint: false });

    const result = await service.getPlugins();
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

    // Script tokens can subscribe to events, but only for their own flow
    if (flowId) {
      enforceScriptScope(c, { allowedEndpoint: true, requiredFlowId: flowId });
    } else {
      // If no flowId but script token, deny (scripts must use flowId)
      enforceScriptScope(c, { allowedEndpoint: !!flowId, requiredFlowId: flowId });
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
      }, SSE_HEARTBEAT_INTERVAL_MS);

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
      { name: 'Scripts', description: 'Run JavaScript, TypeScript, and Python scripts' },
      {
        name: 'Tests',
        description: 'Run tests with detected frameworks (bun, vitest, jest, pytest)'
      },
      { name: 'Plugins', description: 'List and manage loaded plugins' },
      { name: 'Events', description: 'Real-time event streaming via Server-Sent Events' }
    ],
    externalDocs: {
      description: 't-req Documentation',
      url: 'https://github.com/tensorix-labs/t-req'
    }
  });

  // ============================================================================
  // Web UI Routes (auth + proxy)
  // ============================================================================

  if (config.web?.enabled) {
    const webRoutes = createWebRoutes();

    // Mount web routes with API path exclusion
    app.use('*', async (c, next) => {
      const pathname = new URL(c.req.url).pathname;

      // Skip API paths - let them fall through to API handlers
      if (isApiPath(pathname)) {
        return next();
      }

      // Handle web routes (auth + UI serving)
      return webRoutes.fetch(c.req.raw);
    });
  }

  // Cleanup function for graceful shutdown
  const dispose = () => {
    stopSessionCleanup();
    stopScriptTokenCleanup();
  };

  return { app, service, eventManager, workspaceRoot, dispose };
}
