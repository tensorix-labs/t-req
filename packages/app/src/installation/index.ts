import path from 'node:path';
import { $ } from 'bun';
import pkg from '../../package.json';

export namespace Installation {
  export const VERSION: string = pkg.version;

  export type Method = 'npm' | 'bun' | 'curl' | 'unknown';

  export async function method(): Promise<Method> {
    // Check if installed via curl script (default: ~/.treq/bin)
    if (
      process.execPath.includes(path.join('.treq', 'bin')) ||
      process.execPath.includes(path.join('.local', 'bin'))
    ) {
      return 'curl';
    }

    const exec = process.execPath.toLowerCase();

    const checks: Array<{ name: 'npm' | 'bun'; command: () => Promise<string> }> = [
      {
        name: 'npm',
        command: () => $`npm list -g --depth=0`.throws(false).quiet().text()
      },
      {
        name: 'bun',
        command: () => $`bun pm ls -g`.throws(false).quiet().text()
      }
    ];

    // Prioritize check matching the current runtime
    checks.sort((a, b) => {
      const aMatches = exec.includes(a.name);
      const bMatches = exec.includes(b.name);
      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
      return 0;
    });

    for (const check of checks) {
      const output = await check.command();
      if (output.includes('@t-req/app')) {
        return check.name;
      }
    }

    return 'unknown';
  }

  export async function latest(_installMethod?: Method): Promise<string> {
    const response = await fetch('https://registry.npmjs.org/@t-req/app/latest');
    if (!response.ok) throw new Error(response.statusText);
    const data = (await response.json()) as { version: string };
    return data.version;
  }

  export async function upgrade(installMethod: Method, target: string): Promise<void> {
    let cmd: ReturnType<typeof $>;
    switch (installMethod) {
      case 'curl':
        cmd = $`curl -fsSL https://t-req.io/install | bash -s -- --version ${target}`;
        break;
      case 'npm':
        cmd = $`npm install -g @t-req/app@${target}`;
        break;
      case 'bun':
        cmd = $`bun install -g @t-req/app@${target}`;
        break;
      default:
        throw new Error(
          `Cannot auto-upgrade: unknown install method. Please upgrade manually:\n` +
            `  npm install -g @t-req/app@${target}\n` +
            `  bun install -g @t-req/app@${target}`
        );
    }
    const result = await cmd.quiet().throws(false);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.toString('utf8'));
    }
  }

  export function updateCommand(installMethod: Method, target?: string): string {
    switch (installMethod) {
      case 'curl': {
        const versionFlag = target ? ` --version ${target}` : '';
        return `curl -fsSL https://t-req.io/install | bash${versionFlag ? ` -s --${versionFlag}` : ''}`;
      }
      case 'npm': {
        const version = target ? `@${target}` : '';
        return `npm install -g @t-req/app${version}`;
      }
      case 'bun': {
        const version = target ? `@${target}` : '';
        return `bun install -g @t-req/app${version}`;
      }
      default: {
        const version = target ? `@${target}` : '';
        return `npm install -g @t-req/app${version}`;
      }
    }
  }
}
