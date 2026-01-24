import { join, resolve } from 'node:path';
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
  /** Proxy web UI requests to this URL (e.g., https://app.t-req.io) */
  webUrl?: string;
  /** Serve web UI from this local directory */
  webDir?: string;
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

  // CORS middleware - always enabled for localhost, additional origins via config
  const allowedOrigins = new Set(config.corsOrigins ?? []);

  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return undefined;
        // Allow localhost origins by default (for web UI development)
        if (origin.startsWith('http://localhost:')) return origin;
        if (origin.startsWith('http://127.0.0.1:')) return origin;
        // Allow t-req.io domains (hosted web UI)
        if (origin.endsWith('.t-req.io') || origin === 'https://t-req.io') return origin;
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

  // ============================================================================
  // Web UI Serving (--web-url or --web-dir)
  // ============================================================================

  // Define API paths that should NOT be handled by web UI middleware
  const API_PATHS = new Set([
    '/health',
    '/capabilities',
    '/config',
    '/parse',
    '/execute',
    '/session',
    '/flows',
    '/workspace',
    '/event',
    '/doc'
  ]);

  const isApiPath = (pathname: string): boolean => {
    // Check exact matches and prefix matches (e.g., /session/123)
    if (API_PATHS.has(pathname)) return true;
    for (const apiPath of API_PATHS) {
      if (pathname.startsWith(apiPath + '/')) return true;
    }
    return false;
  };

  // Web UI proxy (--web-url)
  if (config.webUrl) {
    const webUrl = config.webUrl.replace(/\/+$/, ''); // Remove trailing slashes

    app.use('*', async (c, next) => {
      const pathname = new URL(c.req.url).pathname;

      // Skip API paths
      if (isApiPath(pathname)) {
        return next();
      }

      // Proxy to remote web UI
      const targetUrl = `${webUrl}${pathname}`;
      try {
        const response = await fetch(targetUrl, {
          method: c.req.method,
          headers: {
            // Forward relevant headers but not host
            Accept: c.req.header('Accept') ?? '*/*',
            'Accept-Encoding': c.req.header('Accept-Encoding') ?? 'gzip, deflate'
          }
        });

        // If not found and no file extension, serve index.html for SPA routing
        if (response.status === 404 && !pathname.includes('.')) {
          const indexResponse = await fetch(`${webUrl}/index.html`);
          if (indexResponse.ok) {
            return new Response(indexResponse.body, {
              status: 200,
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-cache'
              }
            });
          }
        }

        // Forward the response
        return new Response(response.body, {
          status: response.status,
          headers: response.headers
        });
      } catch (err) {
        console.error('Web UI proxy error:', err);
        return c.text('Web UI proxy error', 502);
      }
    });
  }

  // Web UI static files (--web-dir)
  if (config.webDir) {
    const webDir = resolve(config.webDir);

    app.use('*', async (c, next) => {
      const pathname = new URL(c.req.url).pathname;

      // Skip API paths
      if (isApiPath(pathname)) {
        return next();
      }

      // Resolve file path
      const filePath = join(webDir, pathname === '/' ? 'index.html' : pathname);

      // Security: prevent path traversal
      const resolvedPath = resolve(filePath);
      if (!resolvedPath.startsWith(webDir)) {
        return c.text('Forbidden', 403);
      }

      try {
        const file = Bun.file(filePath);
        const exists = await file.exists();

        if (exists) {
          return new Response(file, {
            headers: {
              'Content-Type': file.type,
              'Cache-Control': filePath.includes('/assets/') ? 'max-age=31536000' : 'no-cache'
            }
          });
        }

        // SPA fallback: serve index.html for paths without file extensions
        if (!pathname.includes('.')) {
          const indexFile = Bun.file(join(webDir, 'index.html'));
          if (await indexFile.exists()) {
            return new Response(indexFile, {
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-cache'
              }
            });
          }
        }

        return c.text('Not Found', 404);
      } catch {
        return c.text('Not Found', 404);
      }
    });
  }

  return { app, service, eventManager, workspaceRoot };
}
