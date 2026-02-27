import { resolve } from 'node:path';
import { flushPendingCookieSaves } from '@t-req/core/cookies/persistence';
import type { CommandModule } from 'yargs';
import { createApp, type ServerConfig } from '../server/app';
import { resolveAutoUpdateEnabled, runAutoUpdate } from '../update';
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  generateToken,
  HEALTH_CHECK_BACKOFF_MS,
  HEALTH_CHECK_MAX_RETRIES,
  openBrowser,
  waitForHealthWithRetry
} from '../utils/server';

interface WebOptions {
  workspace?: string;
  port?: number;
  host: string;
  autoUpdate?: boolean;
}

export const webCommand: CommandModule<object, WebOptions> = {
  command: 'web [workspace]',
  describe: 'Start server and open web UI in browser (no TUI)',
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
      .option('auto-update', {
        type: 'boolean',
        describe: 'Automatically check and apply updates on startup',
        default: true
      }),
  handler: async (argv) => {
    await runWeb(argv);
  }
};

async function runWeb(argv: WebOptions): Promise<void> {
  const host = argv.host;
  const port = argv.port ?? DEFAULT_PORT;
  const token = generateToken();

  const workspace = argv.workspace ? resolve(argv.workspace) : process.cwd();

  const config: ServerConfig = {
    port,
    host,
    workspace,
    token,
    maxBodyBytes: 10 * 1024 * 1024, // 10MB
    maxSessions: 100,
    allowCookieAuth: true,
    web: { enabled: true }
  };

  const { app, service, eventManager, dispose, websocket } = createApp(config);

  const server = Bun.serve({
    fetch: app.fetch,
    websocket,
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

    console.log('\nShutting down...');
    eventManager.closeAll();
    service.dispose();
    dispose();
    try {
      await flushPendingCookieSaves();
    } catch {
      // Ignore flush errors during shutdown
    }
    server.stop(true);
    process.exit(0);
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

  console.log('t-req web server running');
  console.log(`  Address:   ${serverUrl}`);
  console.log(`  Workspace: ${workspace}`);
  console.log('');

  const webUrl = `${serverUrl}/auth/init`;
  console.log(`Opening browser: ${webUrl}`);
  openBrowser(webUrl);

  void runAutoUpdate({
    enabled: resolveAutoUpdateEnabled(argv.autoUpdate),
    interactive: process.stdout.isTTY === true
  }).then((outcome) => {
    switch (outcome.status) {
      case 'updated':
        console.log(`Update installed: v${outcome.latestVersion} (applies next run)`);
        break;
      case 'available_manual':
        console.log(`Update available: v${outcome.latestVersion}. Run: ${outcome.command}`);
        break;
      case 'backoff_skipped':
        console.warn(
          `Update available: v${outcome.latestVersion}. Auto-update temporarily paused.`
        );
        console.warn(`Run manually: ${outcome.command}`);
        break;
      case 'failed':
        if (outcome.phase === 'upgrade' && outcome.command) {
          console.warn('Auto-update failed. Continuing startup.');
          console.warn(`Run manually: ${outcome.command}`);
        }
        break;
      default:
        break;
    }
  });

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  // Block forever — Bun.serve keeps the process alive,
  // but the async handler must stay pending.
  await new Promise(() => {});
}
