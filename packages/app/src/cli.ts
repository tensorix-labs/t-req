import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { initCommand } from './cmd/init';
import { openCommand } from './cmd/open';
import { runCommand } from './cmd/run';
import { serveCommand } from './cmd/serve';
import { tuiCommand } from './cmd/tui';
import { upgradeCommand } from './cmd/upgrade';
import { Installation } from './installation';

export function cli(args: string[]): void {
  yargs(hideBin(['node', 'cli', ...args]))
    .scriptName('treq')
    .usage('$0 <command> [options]')
    .command(initCommand)
    .command(openCommand)
    .command(runCommand)
    .command(serveCommand)
    .command(tuiCommand)
    .command(upgradeCommand)
    .demandCommand(1, 'You need to specify a command')
    .strict()
    .help()
    .version(Installation.VERSION)
    .parse();
}
