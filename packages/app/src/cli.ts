import { resolveProjectConfig } from '@t-req/core/config';
import type { CommandModule } from 'yargs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { importCommand } from './cmd/import';
import { initCommand } from './cmd/init';
import { openCommand } from './cmd/open';
import { runCommand } from './cmd/run';
import { serveCommand } from './cmd/serve';
import { tuiCommand } from './cmd/tui';
import { upgradeCommand } from './cmd/upgrade';
import { validateCommand } from './cmd/validate';
import { webCommand } from './cmd/web';
import { wsCommand } from './cmd/ws';
import { Installation } from './installation';
import { resolveWorkspaceRoot } from './utils';

/**
 * Create a yargs command from a plugin command.
 */
function createPluginCommand(
  name: string,
  pluginName: string,
  handler: (ctx: import('@t-req/core').CommandContext) => Promise<void> | void,
  projectRoot: string
): CommandModule {
  return {
    command: name,
    describe: `[Plugin: ${pluginName}]`,
    handler: async (argv) => {
      // Build command context
      const ctx: import('@t-req/core').CommandContext = {
        args: argv._.slice(1).map(String),
        flags: Object.fromEntries(
          Object.entries(argv).filter(([k]) => k !== '_' && k !== '$0' && !k.includes('-'))
        ) as Record<string, string | boolean>,
        readFile: async (path: string) => {
          const fs = await import('node:fs/promises');
          const nodePath = await import('node:path');
          const resolved = nodePath.resolve(projectRoot, path);
          return await fs.readFile(resolved, 'utf-8');
        },
        writeFile: async (path: string, content: string) => {
          const fs = await import('node:fs/promises');
          const nodePath = await import('node:path');
          const resolved = nodePath.resolve(projectRoot, path);
          await fs.writeFile(resolved, content, 'utf-8');
        },
        writeHttpFile: async (name: string, requests) => {
          const fs = await import('node:fs/promises');
          const nodePath = await import('node:path');
          const { serializeDocument } = await import('@t-req/core');
          const resolved = nodePath.resolve(projectRoot, name);
          const content = serializeDocument({ requests });
          await fs.mkdir(nodePath.dirname(resolved), { recursive: true });
          await fs.writeFile(resolved, content, 'utf-8');
        },
        parseCollection: async () => {
          throw new Error('parseCollection not implemented in CLI context');
        },
        parseHttpFile: async () => {
          throw new Error('parseHttpFile not implemented in CLI context');
        },
        run: async () => {
          throw new Error('run not implemented in CLI context');
        },
        log: (message: string) => console.log(message),
        warn: (message: string) => console.warn(message),
        error: (message: string) => console.error(message),
        table: (data: unknown[]) => console.table(data),
        json: (data: unknown) => console.log(JSON.stringify(data, null, 2)),
        exit: (code = 0) => process.exit(code),
        config: {
          projectRoot,
          variables: {},
          security: {
            allowExternalFiles: false,
            allowPluginsOutsideProject: false
          }
        },
        cwd: process.cwd()
      };

      try {
        await handler(ctx);
      } catch (err) {
        console.error(
          `Command '${name}' failed:`,
          err instanceof Error ? err.message : String(err)
        );
        process.exit(1);
      }
    }
  };
}

export async function cli(args: string[]): Promise<void> {
  const workspaceRoot = resolveWorkspaceRoot();

  // Start building yargs
  let yargsInstance = yargs(hideBin(['node', 'cli', ...args]))
    .scriptName('treq')
    .usage('$0 <command> [options]')
    .command(importCommand)
    .command(initCommand)
    .command(openCommand)
    .command(runCommand)
    .command(serveCommand)
    .command(tuiCommand)
    .command(upgradeCommand)
    .command(validateCommand)
    .command(wsCommand)
    .command(webCommand);

  // Try to load plugin commands (non-blocking - don't fail if no config)
  try {
    const { config } = await resolveProjectConfig({
      startDir: workspaceRoot,
      stopDir: workspaceRoot
    });

    if (config.pluginManager) {
      const commands = config.pluginManager.getCommands();
      const plugins = config.pluginManager.getPlugins();

      for (const [name, handler] of Object.entries(commands)) {
        // Find which plugin provides this command
        const plugin = plugins.find((p) => p.plugin.commands?.[name]);
        const pluginName = plugin?.plugin.name ?? 'unknown';

        yargsInstance = yargsInstance.command(
          createPluginCommand(name, pluginName, handler, config.projectRoot)
        );
      }
    }
  } catch {
    // Ignore errors - plugins are optional
  }

  yargsInstance
    .demandCommand(1, 'You need to specify a command')
    .strict()
    .help()
    .version(Installation.VERSION)
    .parse();
}
