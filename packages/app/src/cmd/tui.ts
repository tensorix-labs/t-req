import type { CommandModule } from 'yargs';
import { resolveAutoUpdateEnabled } from '../update';

interface TuiOptions {
  server: string;
  token?: string;
  autoUpdate?: boolean;
}

export const tuiCommand: CommandModule<object, TuiOptions> = {
  command: 'tui',
  describe: 'Start interactive TUI for browsing workspace',
  builder: {
    server: {
      type: 'string',
      alias: 's',
      default: 'http://localhost:4097',
      describe: 'Server URL to connect to'
    },
    token: {
      type: 'string',
      alias: 't',
      describe: 'Bearer token for authentication'
    },
    'auto-update': {
      type: 'boolean',
      default: true,
      describe: 'Automatically check and apply updates on startup'
    }
  },
  handler: async (argv) => {
    const { startTui } = await import('../tui');
    await startTui({
      serverUrl: argv.server,
      token: argv.token,
      autoUpdate: resolveAutoUpdateEnabled(argv.autoUpdate)
    });
  }
};
