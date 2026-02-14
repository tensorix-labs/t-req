import { OpenAPIHono } from '@hono/zod-openapi';
import {
  createImporterRegistry,
  createPostmanImporter,
  type Importer,
  type ImportResult
} from '@t-req/core/import';
import type { MiddlewareFunction } from '@t-req/core/plugin';
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
  createFileRoute,
  createFlowRoute,
  createSessionRoute,
  deleteFileRoute,
  deleteSessionRoute,
  eventRoute,
  executeRoute,
  executeSSERoute,
  finishFlowRoute,
  getExecutionRoute,
  getFileContentRoute,
  getRunnersRoute,
  getSessionRoute,
  getTestFrameworksRoute,
  healthRoute,
  importApplyRoute,
  importPreviewRoute,
  listWorkspaceFilesRoute,
  listWorkspaceRequestsRoute,
  parseRoute,
  pluginsRoute,
  runScriptRoute,
  runTestRoute,
  updateFileRoute,
  updateSessionVariablesRoute
} from './openapi';
import type { ErrorResponse } from './schemas';
import { createService, resolveWorkspaceRoot } from './service';
import { ImportApplyError } from './service/import-service';
import { formatSSEMessage } from './sse-format';
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

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function createValidationErrorResponse(message: string): ErrorResponse {
  return { error: { code: 'VALIDATION_ERROR', message } };
}

function hasErrorDiagnostics(result: ImportResult): boolean {
  return result.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

function isImportDiagnosticGateError(error: unknown, result: ImportResult): boolean {
  return (
    error instanceof ValidationError &&
    error.message.includes('force=true') &&
    hasErrorDiagnostics(result)
  );
}

function resolveConvertOptions(
  importer: Importer,
  convertOptions: Record<string, unknown> | undefined
): unknown {
  if (!importer.optionsSchema) {
    return convertOptions;
  }

  try {
    return importer.optionsSchema.parse(convertOptions ?? {});
  } catch (error) {
    throw new ValidationError(
      `Invalid convertOptions for source "${importer.source}": ${errorMessage(error)}`
    );
  }
}

// Re-export middleware types from core for consumers
export type {
  MiddlewareFunction as PluginMiddleware,
  MiddlewareRequest,
  MiddlewareResponse
} from '@t-req/core/plugin';

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
  /** Plugin middleware to apply (from PluginManager.getMiddleware()) */
  pluginMiddleware?: MiddlewareFunction[];
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

  const importerRegistry = createImporterRegistry();
  importerRegistry.register(createPostmanImporter());

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

  // Apply plugin middleware (if any)
  // Plugin middleware uses Express-style (req, res, next) signature
  if (config.pluginMiddleware && config.pluginMiddleware.length > 0) {
    for (const pluginMiddleware of config.pluginMiddleware) {
      app.use('*', async (c, next) => {
        // Adapt Express-style middleware to Hono
        const req = c.req.raw;
        const reqHeaders: Record<string, string> = {};
        req.headers.forEach((value, key) => {
          reqHeaders[key] = value;
        });

        // Track if middleware ended the response early
        let ended = false;
        let endBody: string | Buffer | undefined;
        const resHeaders: Record<string, string> = {};
        let statusCode = 200;

        // Create Express-style request/response objects
        const middlewareReq = {
          method: req.method,
          url: req.url,
          headers: reqHeaders,
          body: undefined as Buffer | string | undefined
        };

        const middlewareRes = {
          statusCode,
          headers: resHeaders,
          setHeader: (name: string, value: string) => {
            resHeaders[name] = value;
          },
          end: (body?: string | Buffer) => {
            ended = true;
            endBody = body;
            statusCode = middlewareRes.statusCode;
          }
        };

        try {
          // Call the Express-style middleware
          await pluginMiddleware(middlewareReq, middlewareRes, async () => {
            await next();
          });

          // If middleware ended the response, return it
          if (ended) {
            return new Response(endBody, {
              status: statusCode,
              headers: resHeaders
            });
          }

          // Otherwise continue (next() was already called)
          return;
        } catch (err) {
          console.error('Plugin middleware error:', err);
          // Continue to next middleware on error (graceful degradation)
          return next();
        }
      });
    }
  }

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
    return c.json(service.health(), 200);
  });

  // ============================================================================
  // Capabilities Endpoint
  // ============================================================================

  app.openapi(capabilitiesRoute, (c) => {
    return c.json(service.capabilities(), 200);
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
  // Execute SSE Endpoint
  // ============================================================================

  app.openapi(executeSSERoute, async (c) => {
    const request = c.req.valid('json');

    // Script tokens can execute SSE, but must use their assigned flow/session
    const payload = c.get('scriptTokenPayload') as ScriptTokenPayload | undefined;
    if (payload) {
      enforceScriptScope(c, {
        allowedEndpoint: true,
        requiredFlowId: request.flowId,
        requiredSessionId: request.sessionId
      });
    }

    const encoder = new TextEncoder();

    return new Response(
      new ReadableStream({
        async start(controller) {
          try {
            const stream = await service.executeSSE(request);

            // Stream SSE messages
            for await (const msg of stream) {
              const formatted = formatSSEMessage(msg);
              controller.enqueue(encoder.encode(formatted));
            }

            controller.close();
          } catch (error) {
            // Send error as SSE event so client can distinguish from connection errors
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorEvent = formatSSEMessage({
              event: 'error',
              data: JSON.stringify({ error: errorMsg })
            });
            controller.enqueue(encoder.encode(errorEvent));
            controller.close();
          }
        }
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        }
      }
    );
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

  // File CRUD endpoints (no script token access for security)
  app.openapi(getFileContentRoute, async (c) => {
    enforceScriptScope(c, { allowedEndpoint: false });
    const { path } = c.req.valid('query');
    const result = await service.getFileContent(path);
    return c.json(result, 200);
  });

  app.openapi(updateFileRoute, async (c) => {
    enforceScriptScope(c, { allowedEndpoint: false });
    const request = c.req.valid('json');
    await service.updateFile(request);
    return c.json({}, 200);
  });

  app.openapi(createFileRoute, async (c) => {
    enforceScriptScope(c, { allowedEndpoint: false });
    const request = c.req.valid('json');
    const result = await service.createFile(request);
    return c.json(result, 201);
  });

  app.openapi(deleteFileRoute, async (c) => {
    enforceScriptScope(c, { allowedEndpoint: false });
    const { path } = c.req.valid('query');
    await service.deleteFile(path);
    return c.body(null, 204);
  });

  // ============================================================================
  // Import Endpoints
  // ============================================================================

  app.openapi(importPreviewRoute, async (c) => {
    enforceScriptScope(c, { allowedEndpoint: false });

    const { source } = c.req.valid('param');
    const importer = importerRegistry.get(source);
    if (!importer) {
      return c.json(createValidationErrorResponse(`Unknown import source: ${source}`), 400);
    }

    const request = c.req.valid('json');
    let parsedConvertOptions: unknown;
    try {
      parsedConvertOptions = resolveConvertOptions(importer, request.convertOptions);
    } catch (error) {
      return c.json(createValidationErrorResponse(errorMessage(error)), 400);
    }

    const conversionResult = importer.convert(request.input, parsedConvertOptions as never);

    try {
      const previewResult = await service.importPreview(conversionResult, {
        outputDir: request.planOptions.outputDir,
        onConflict: request.planOptions.onConflict
      });
      return c.json(
        {
          result: previewResult,
          diagnostics: conversionResult.diagnostics,
          stats: conversionResult.stats
        },
        200
      );
    } catch (error) {
      if (isImportDiagnosticGateError(error, conversionResult)) {
        return c.json(
          {
            diagnostics: conversionResult.diagnostics,
            stats: conversionResult.stats
          },
          422
        );
      }
      throw error;
    }
  });

  app.openapi(importApplyRoute, async (c) => {
    enforceScriptScope(c, { allowedEndpoint: false });

    const { source } = c.req.valid('param');
    const importer = importerRegistry.get(source);
    if (!importer) {
      return c.json(createValidationErrorResponse(`Unknown import source: ${source}`), 400);
    }

    const request = c.req.valid('json');
    let parsedConvertOptions: unknown;
    try {
      parsedConvertOptions = resolveConvertOptions(importer, request.convertOptions);
    } catch (error) {
      return c.json(createValidationErrorResponse(errorMessage(error)), 400);
    }

    const conversionResult = importer.convert(request.input, parsedConvertOptions as never);

    try {
      const applyResult = await service.importApply(conversionResult, request.applyOptions);
      return c.json(
        {
          result: applyResult,
          diagnostics: conversionResult.diagnostics,
          stats: conversionResult.stats
        },
        200
      );
    } catch (error) {
      if (error instanceof ImportApplyError) {
        return c.json({ partialResult: error.partialResult }, 207);
      }
      if (isImportDiagnosticGateError(error, conversionResult)) {
        return c.json(
          {
            diagnostics: conversionResult.diagnostics,
            stats: conversionResult.stats
          },
          422
        );
      }
      throw error;
    }
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

  const openApiDocConfig = {
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
      { name: 'Import', description: 'Import external request collections into workspace files' },
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
  };

  app.get('/doc', (c) => {
    const document = app.getOpenAPIDocument(openApiDocConfig);
    return c.json(document, 200);
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
