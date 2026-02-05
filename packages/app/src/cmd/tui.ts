import type { CommandModule } from 'yargs';

interface TuiOptions {
  server: string;
  token?: string;
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
    }
  },
  handler: async (argv) => {
    const { startTui } = await import('../tui');
    await startTui({ serverUrl: argv.server, token: argv.token });
  }
};
