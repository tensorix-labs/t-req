import { resolve } from 'node:path';
import { flushPendingCookieSaves } from '@t-req/core/cookies/persistence';
import type { CommandModule } from 'yargs';
import { createApp, type ServerConfig } from '../server/app';
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  generateToken,
  HEALTH_CHECK_BACKOFF_MS,
  HEALTH_CHECK_MAX_RETRIES,
  isLoopbackAddress,
  openBrowser,
  waitForHealthWithRetry
} from '../utils/server';

interface OpenOptions {
  workspace?: string;
  port?: number;
  host: string;
  web?: boolean;
  expose?: boolean;
}

export const openCommand: CommandModule<object, OpenOptions> = {
  command: 'open [workspace]',
  describe: 'Open workspace in TUI (starts server automatically)',
  builder: (yargs) =>
    yargs
      .positional('workspace', {
        type: 'string',
        describe: 'Workspace root directory'
      })
      .option('port', {
        type: 'number',
        describe: 'Port to listen on',
        alias: 'p',
        default: DEFAULT_PORT
      })
      .option('host', {
        type: 'string',
        describe: 'Host to bind to',
        alias: 'H',
        default: DEFAULT_HOST
      })
      .option('web', {
        type: 'boolean',
        describe: 'Enable web UI (opens browser)',
        default: false
      })
      .option('expose', {
        type: 'boolean',
        describe: 'Allow non-loopback binding (disables cookie auth for security)',
        default: false
      }),
  handler: async (argv) => {
    await runOpen(argv);
  }
};

async function runOpen(argv: OpenOptions): Promise<void> {
  const host = argv.host;
  const port = argv.port ?? DEFAULT_PORT;
  const token = generateToken(); // Always generate token for defense-in-depth

  // Security: --expose and --web together is not allowed (SSRF protection)
  if (argv.expose && argv.web) {
    console.error('Error: --web is not available with --expose.');
    console.error('The web UI proxies to an external URL, which could be exploited for SSRF.');
    process.exit(1);
  }

  // Determine if cookie auth should be allowed
  let allowCookieAuth = true;
  if (argv.expose) {
    // When exposed to network, only allow bearer auth (no cookies)
    allowCookieAuth = false;
    console.warn('Warning: Expose mode enabled. Cookie auth disabled for security.');
  }

  // Security check: require non-loopback awareness
  if (!isLoopbackAddress(host)) {
    console.warn('Warning: Binding to non-loopback address. Token is required and generated.');
    console.warn('Other machines on the network may be able to access this server.');
  }

  // Resolve workspace to absolute path (defaults to cwd)
  const workspace = argv.workspace ? resolve(argv.workspace) : process.cwd();

  const config: ServerConfig = {
    port,
    host,
    workspace,
    token,
    maxBodyBytes: 10 * 1024 * 1024, // 10MB
    maxSessions: 100,
    allowCookieAuth,
    web: argv.web ? { enabled: true } : undefined
  };

  // Create app (but don't start server yet - we need the Bun.serve to get actual port)
  const { app, service, eventManager, dispose } = createApp(config);

  // Start server
  const server = Bun.serve({
    fetch: app.fetch,
    port,
    hostname: host
  });

  const actualPort = server.port;
  const serverUrl = `http://${host}:${actualPort}`;

  // Graceful shutdown handler
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    eventManager.closeAll();
    service.dispose();
    dispose(); // Stop session cleanup
    try {
      await flushPendingCookieSaves();
    } catch {
      // Ignore flush errors during shutdown
    }
    server.stop(true);
  };

  // Wait for server to be healthy
  try {
    await waitForHealthWithRetry(serverUrl, token, {
      maxRetries: HEALTH_CHECK_MAX_RETRIES,
      backoffMs: HEALTH_CHECK_BACKOFF_MS,
      onError: (err) => console.error('Server failed to start:', err.message)
    });
  } catch {
    await shutdown();
    process.exit(1);
  }

  // Open browser for web mode
  if (argv.web) {
    const webUrl = `${serverUrl}/auth/init`;
    console.log(`Opening web UI: ${webUrl}`);
    openBrowser(webUrl);
  }

  // Import and start TUI
  const { startTui } = await import('../tui');
  try {
    await startTui({ serverUrl, token, onExit: shutdown });
  } finally {
    // Cleanup on TUI exit
    await shutdown();
  }
}
