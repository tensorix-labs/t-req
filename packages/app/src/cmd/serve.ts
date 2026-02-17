import { resolveProjectConfig } from '@t-req/core/config';
import { flushPendingCookieSaves } from '@t-req/core/cookies/persistence';
import type { MiddlewareFunction } from '@t-req/core/plugin';
import type { CommandModule } from 'yargs';
import { z } from 'zod';
import { createApp, type ServerConfig } from '../server/app';
import {
  CreateSessionRequestSchema,
  ExecuteRequestSchema,
  ParseRequestSchema
} from '../server/schemas';
import { WEB_UI_PROXY_URL } from '../server/web';
import { resolveWorkspaceRoot } from '../utils';
import { DEFAULT_HOST, DEFAULT_PORT, isLoopbackAddress } from '../utils/server';

interface ServeOptions {
  port: number;
  host: string;
  workspace?: string;
  token?: string;
  cors?: string;
  maxBodySize: number;
  maxSessions: number;
  stdio?: boolean;
  web?: boolean;
}

export const serveCommand: CommandModule<object, ServeOptions> = {
  command: 'serve',
  describe: 'Start the t-req HTTP server',
  builder: {
    port: {
      type: 'number',
      describe: 'Port to listen on',
      alias: 'p',
      default: DEFAULT_PORT
    },
    host: {
      type: 'string',
      describe: 'Host to bind to',
      alias: 'H',
      default: DEFAULT_HOST
    },
    workspace: {
      type: 'string',
      describe: 'Workspace root directory',
      alias: 'w'
    },
    token: {
      type: 'string',
      describe: 'Bearer token for authentication (required for non-localhost)',
      alias: 't'
    },
    cors: {
      type: 'string',
      describe: 'Allowed CORS origins (comma-separated)',
      alias: 'c'
    },
    'max-body-size': {
      type: 'number',
      describe: 'Maximum response body size in bytes',
      default: 10 * 1024 * 1024 // 10MB
    },
    'max-sessions': {
      type: 'number',
      describe: 'Maximum concurrent sessions',
      default: 100
    },
    stdio: {
      type: 'boolean',
      describe: 'Run in stdio mode (JSON-RPC over stdin/stdout)',
      default: false
    },
    web: {
      type: 'boolean',
      describe: 'Enable web UI (proxies to production URL)',
      default: false
    }
  },
  handler: async (argv) => {
    await runServer(argv);
  }
};

async function runServer(argv: ServeOptions): Promise<void> {
  // Security check: require token for non-loopback addresses
  if (!isLoopbackAddress(argv.host) && !argv.token) {
    console.error('Error: --token is required when binding to non-loopback addresses');
    console.error('This prevents unauthorized access to your workspace files.');
    process.exit(1);
  }

  if (argv.stdio) {
    await runStdioMode(argv);
    return;
  }

  await runHttpMode(argv);
}

async function runHttpMode(argv: ServeOptions): Promise<void> {
  // Parse CORS origins for function-based validation
  const corsOrigins = argv.cors ? argv.cors.split(',').map((s) => s.trim()) : undefined;

  // Resolve workspace root
  const workspaceRoot = resolveWorkspaceRoot(argv.workspace);

  // Load plugin middleware (non-blocking - don't fail if no config)
  let pluginMiddleware: MiddlewareFunction[] | undefined;
  try {
    const { config: projectConfig } = await resolveProjectConfig({
      startDir: workspaceRoot,
      stopDir: workspaceRoot
    });

    if (projectConfig.pluginManager) {
      const middleware = projectConfig.pluginManager.getMiddleware();
      if (middleware.length > 0) {
        pluginMiddleware = middleware;
        console.log(`Loaded ${middleware.length} plugin middleware(s)`);
      }
    }
  } catch {
    // Ignore errors - plugins are optional
  }

  const config: ServerConfig = {
    port: argv.port,
    host: argv.host,
    workspace: argv.workspace,
    token: argv.token,
    corsOrigins,
    maxBodyBytes: argv.maxBodySize,
    maxSessions: argv.maxSessions,
    web: argv.web ? { enabled: true } : undefined,
    pluginMiddleware
  };

  const { app, service, eventManager, dispose, websocket } = createApp(config);

  console.log('t-req server starting...');
  console.log(`  Workspace: ${workspaceRoot}`);
  console.log(`  Address:   http://${argv.host}:${argv.port}`);
  if (argv.token) {
    console.log('  Auth:      Bearer token + Cookie sessions');
  } else {
    console.log('  Auth:      None (open access)');
  }
  if (argv.cors) {
    console.log(`  CORS:      ${argv.cors}`);
  }
  if (argv.web) {
    console.log(`  Web UI:    Proxying to ${WEB_UI_PROXY_URL}`);
  }
  console.log('');
  console.log('Endpoints:');
  console.log('  GET  /health            - Health check');
  console.log('  GET  /capabilities      - Protocol/features metadata');
  console.log('  POST /parse             - Parse .http content');
  console.log('  POST /execute           - Execute HTTP request');
  console.log('  POST /execute/ws        - Execute WebSocket request definition');
  console.log('  POST /session           - Create session');
  console.log('  GET  /session/:id       - Get session state');
  console.log('  PUT  /session/:id/variables - Update session variables');
  console.log('  DEL  /session/:id       - Delete session');
  console.log('  GET  /event             - Event stream (SSE)');
  console.log('  GET  /ws/session/:id    - WebSocket session control stream');
  console.log('  GET  /doc               - OpenAPI documentation');
  if (argv.web) {
    console.log('');
    console.log('Web UI:');
    console.log('  GET  /auth/init         - Initialize session (sets cookie)');
    console.log('  POST /auth/logout       - Destroy session');
    console.log('  GET  /auth/status       - Check session status');
    console.log('  GET  /*                 - Web UI assets');
  }
  console.log('');
  console.log('Ready to accept connections.');

  const server = Bun.serve({
    fetch: app.fetch,
    websocket,
    port: argv.port,
    hostname: argv.host
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    eventManager.closeAll();
    service.dispose();
    dispose(); // Stop session cleanup
    try {
      // Best-effort: flush any pending debounced cookie jar writes.
      await flushPendingCookieSaves();
    } catch {
      // Ignore flush errors during shutdown.
    }
    server.stop(true);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

async function runStdioMode(argv: ServeOptions): Promise<void> {
  const { service, dispose } = createApp({
    port: 0,
    host: '127.0.0.1',
    workspace: argv.workspace,
    maxBodyBytes: argv.maxBodySize,
    maxSessions: argv.maxSessions,
    allowCookieAuth: false // stdio mode doesn't need cookie auth
  });

  // Read JSON-RPC requests from stdin
  let buffer = '';

  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', async (chunk: string) => {
    buffer += chunk;

    // Process complete lines
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      if (!line.trim()) {
        newlineIndex = buffer.indexOf('\n');
        continue;
      }

      try {
        const request = JSON.parse(line);
        const response = await handleJsonRpcRequest(request, service);
        process.stdout.write(`${JSON.stringify(response)}\n`);
      } catch (err) {
        const errorResponse = {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
            data: err instanceof Error ? err.message : String(err)
          }
        };
        process.stdout.write(`${JSON.stringify(errorResponse)}\n`);
      }

      newlineIndex = buffer.indexOf('\n');
    }
  });

  process.stdin.on('end', () => {
    dispose(); // Stop session cleanup
    process.exit(0);
  });

  // Signal ready
  const ready = {
    jsonrpc: '2.0',
    method: 'ready',
    params: { protocolVersion: '1.0' }
  };
  process.stdout.write(`${JSON.stringify(ready)}\n`);
}

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

// JSON-RPC parameter schemas
const GetSessionParamsSchema = z.object({
  sessionId: z.string().min(1)
});

const UpdateSessionVariablesParamsSchema = z.object({
  sessionId: z.string().min(1),
  variables: z.record(z.string(), z.unknown()),
  mode: z.enum(['merge', 'replace'])
});

const DeleteSessionParamsSchema = z.object({
  sessionId: z.string().min(1)
});

async function handleJsonRpcRequest(
  request: JsonRpcRequest,
  service: ReturnType<typeof createApp>['service']
): Promise<JsonRpcResponse> {
  const { id, method, params } = request;

  try {
    let result: unknown;

    switch (method) {
      case 'health':
        result = service.health();
        break;

      case 'capabilities':
        result = service.capabilities();
        break;

      case 'parse': {
        const validated = ParseRequestSchema.parse(params);
        result = await service.parse(validated);
        break;
      }

      case 'execute': {
        const validated = ExecuteRequestSchema.parse(params);
        result = await service.execute(validated);
        break;
      }

      case 'createSession': {
        const validated = CreateSessionRequestSchema.parse(params ?? {});
        result = service.createSession(validated);
        break;
      }

      case 'getSession': {
        const validated = GetSessionParamsSchema.parse(params);
        result = service.getSession(validated.sessionId);
        break;
      }

      case 'updateSessionVariables': {
        const validated = UpdateSessionVariablesParamsSchema.parse(params);
        result = await service.updateSessionVariables(validated.sessionId, {
          variables: validated.variables,
          mode: validated.mode
        });
        break;
      }

      case 'deleteSession': {
        const validated = DeleteSessionParamsSchema.parse(params);
        service.deleteSession(validated.sessionId);
        result = { success: true };
        break;
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: 'Method not found',
            data: { method }
          }
        };
    }

    return {
      jsonrpc: '2.0',
      id,
      result
    };
  } catch (err) {
    // Handle Zod validation errors
    if (err instanceof z.ZodError) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32602,
          message: 'Invalid params',
          data: err.issues
        }
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: err instanceof Error ? err.message : String(err)
      }
    };
  }
}
