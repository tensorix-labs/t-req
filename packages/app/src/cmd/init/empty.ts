import { $ } from 'bun';
import {
  basename,
  generateClientFile,
  generateGitignore,
  generatePackageJson,
  generateRunScript,
  generateTsconfig,
  getInstallCommand,
  join
} from './shared';
import type { ProjectConfig } from './types';

export async function createEmptyProject(
  projectPath: string,
  config: ProjectConfig
): Promise<void> {
  const projectName = basename(projectPath);

  // Create directories
  await $`mkdir -p ${projectPath}`.quiet();
  await $`mkdir -p ${join(projectPath, '.treq')}`.quiet();
  await $`mkdir -p ${join(projectPath, 'collection')}`.quiet();

  if (config.testRunner !== 'none') {
    await $`mkdir -p ${join(projectPath, 'tests')}`.quiet();
  }

  // Write root files
  await Bun.write(join(projectPath, 'treq.jsonc'), generateEmptyConfig());
  await Bun.write(join(projectPath, 'client.ts'), generateClientFile(config.runtime));
  await Bun.write(join(projectPath, 'run.ts'), generateRunScript(config.runtime));
  await Bun.write(join(projectPath, 'package.json'), generatePackageJson(projectName, config));
  await Bun.write(join(projectPath, 'tsconfig.json'), generateTsconfig(config.runtime));
  await Bun.write(join(projectPath, '.gitignore'), generateGitignore());
  await Bun.write(join(projectPath, 'README.md'), generateEmptyReadme(projectName, config));

  // Write collection
  await Bun.write(join(projectPath, 'collection', 'hello.http'), generateHelloRequest());

  // Write test file if tests enabled
  if (config.testRunner !== 'none') {
    await Bun.write(
      join(projectPath, 'tests', 'hello.test.ts'),
      generateEmptyTestFile(config.testRunner)
    );
  }
}

export function generateEmptyConfig(): string {
  return `{
  // Enable base resolvers and assertion directives
  "plugins": ["@t-req/plugin-base", "@t-req/plugin-assert"],

  "variables": {
    "baseUrl": "https://jsonplaceholder.typicode.com"
  },
  "defaults": {
    "timeoutMs": 30000
  }
}
`;
}

export function generateHelloRequest(): string {
  return `GET {{baseUrl}}/users/1

# @assert status == 200
`;
}

export function generateEmptyTestFile(testRunner: ProjectConfig['testRunner']): string {
  if (testRunner === 'none') return '';

  let imports: string;
  if (testRunner === 'bun') {
    imports = "import { describe, expect, test } from 'bun:test';";
  } else if (testRunner === 'vitest') {
    imports = "import { describe, expect, test } from 'vitest';";
  } else {
    imports = '// Jest globals are available (describe, expect, test)';
  }

  return `${imports}
import { client } from '../client';

describe('collection/hello.http', () => {
  test('returns a user', async () => {
    const response = await client.run('./collection/hello.http');

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  });
});
`;
}

export function generateEmptyReadme(projectName: string, config: ProjectConfig): string {
  const installCmd = getInstallCommand(config.packageManager);
  const runCmd = config.runtime === 'bun' ? 'bun run.ts' : 'npx tsx run.ts';

  return `# ${projectName}

A t-req API testing project.

## Getting Started

\`\`\`bash
${installCmd}
${runCmd}
\`\`\`

## Learn More

- [t-req Documentation](https://t-req.io)
`;
}
