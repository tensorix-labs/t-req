import * as prompts from '@clack/prompts';
import type { CommandModule } from 'yargs';
import { Installation } from '../installation';

interface UpgradeOptions {
  target?: string;
}

export const upgradeCommand: CommandModule<object, UpgradeOptions> = {
  command: 'upgrade [target]',
  describe: 'Upgrade treq to the latest or a specific version',
  builder: {
    target: {
      type: 'string',
      describe: 'Version to upgrade to, e.g. "0.2.1" or "v0.2.1"'
    }
  },
  handler: async (argv) => {
    prompts.intro('treq upgrade');

    const detectedMethod = await Installation.method();
    if (detectedMethod === 'unknown') {
      prompts.log.warn(`Could not detect install method. treq is running from ${process.execPath}`);
    }

    prompts.log.info(`Using method: ${detectedMethod}`);

    const target = argv.target
      ? argv.target.replace(/^v/, '')
      : await Installation.latest().catch(() => {
          prompts.log.error('Failed to fetch latest version from npm registry');
          return undefined;
        });

    if (!target) {
      prompts.outro('Done');
      return;
    }

    if (Installation.VERSION === target) {
      prompts.log.warn(`treq is already at version ${target}`);
      prompts.outro('Done');
      return;
    }

    prompts.log.info(`From ${Installation.VERSION} -> ${target}`);

    if (detectedMethod === 'unknown') {
      prompts.log.info(
        `Run manually:\n  npm install -g @t-req/app@${target}\n  bun install -g @t-req/app@${target}`
      );
      prompts.outro('Done');
      return;
    }

    const spinner = prompts.spinner();
    spinner.start('Upgrading...');

    try {
      await Installation.upgrade(detectedMethod, target);
      spinner.stop('Upgrade complete');
    } catch (err) {
      spinner.stop('Upgrade failed', 1);
      if (err instanceof Error) {
        prompts.log.error(err.message);
      }
    }

    prompts.outro('Done');
  }
};
