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

export async function createBasicProject(
  projectPath: string,
  config: ProjectConfig
): Promise<void> {
  const projectName = basename(projectPath);

  // Create directories
  await $`mkdir -p ${projectPath}`.quiet();
  await $`mkdir -p ${join(projectPath, '.treq')}`.quiet();
  await $`mkdir -p ${join(projectPath, 'collection', 'posts')}`.quiet();
  await $`mkdir -p ${join(projectPath, 'collection', 'users')}`.quiet();

  if (config.testRunner !== 'none') {
    await $`mkdir -p ${join(projectPath, 'tests')}`.quiet();
  }

  // Write root files
  await Bun.write(join(projectPath, 'treq.jsonc'), generateBasicConfig());
  await Bun.write(join(projectPath, 'client.ts'), generateClientFile(config.runtime));
  await Bun.write(join(projectPath, 'run.ts'), generateRunScript(config.runtime));
  await Bun.write(join(projectPath, 'package.json'), generatePackageJson(projectName, config));
  await Bun.write(join(projectPath, 'tsconfig.json'), generateTsconfig(config.runtime));
  await Bun.write(join(projectPath, '.gitignore'), generateGitignore());
  await Bun.write(join(projectPath, 'README.md'), generateBasicReadme(projectName, config));

  // Write test file if tests enabled
  if (config.testRunner !== 'none') {
    await Bun.write(
      join(projectPath, 'tests', 'list.test.ts'),
      generateBasicTestFile(config.testRunner)
    );
  }

  // Write collection
  await Bun.write(
    join(projectPath, 'collection', 'posts', 'create.http'),
    generateCreatePostRequest()
  );
  await Bun.write(
    join(projectPath, 'collection', 'users', 'list.http'),
    generateListUsersRequest()
  );
  await Bun.write(join(projectPath, 'collection', 'users', 'get.http'), generateGetUserRequest());
}

export function generateBasicConfig(): string {
  return `{
  // Enable base resolvers and assertion directives
  "plugins": ["@t-req/plugin-base", "@t-req/plugin-assert"],

  "variables": {
    // Default base URL for the included sample requests.
    // Switch profiles with: treq run ... --profile dev
    "baseUrl": "https://jsonplaceholder.typicode.com",
    "userId": 1
    // Example substitutions:
    // "apiKey": "{env:API_KEY}",
    // "authToken": "{file:./secrets/token.txt}"
  },
  "defaults": {
    "timeoutMs": 30000
  },
  // Uncomment to persist cookies between runs:
  // "cookies": {
  //   "enabled": true,
  //   "jarPath": ".treq/cookies.json"
  // },
  "profiles": {
    "dev": {
      "variables": { "baseUrl": "http://localhost:3000" },
      "defaults": { "validateSSL": false }
    },
    "prod": {
      "variables": { "baseUrl": "https://api.example.com" }
    }
  }
}
`;
}

export function generateBasicReadme(projectName: string, config: ProjectConfig): string {
  const installCmd = getInstallCommand(config.packageManager);
  const runCmd = config.runtime === 'bun' ? 'bun run.ts' : 'npx tsx run.ts';

  let testSection = '';
  if (config.testRunner !== 'none') {
    let testCmd: string;
    if (config.testRunner === 'bun') {
      testCmd = 'bun test';
    } else if (config.testRunner === 'vitest') {
      testCmd = config.packageManager === 'npm' ? 'npm test' : `${config.packageManager} test`;
    } else {
      testCmd = config.packageManager === 'npm' ? 'npm test' : `${config.packageManager} test`;
    }

    testSection = `
## Running Tests

\`\`\`bash
${testCmd}
\`\`\`

Tests are located in the \`tests/\` directory. The example test demonstrates how to use the t-req client to test your HTTP requests.
`;
  }

  return `# ${projectName}

A t-req API testing project.

## Getting Started

\`\`\`bash
${installCmd}
${runCmd}
\`\`\`
${testSection}
## Project Structure

- \`treq.jsonc\` - Project configuration (variables, profiles, defaults)
- \`client.ts\` - Shared t-req client (import this in your scripts and tests)
- \`run.ts\` - Example script showing programmatic usage
- \`collection/\` - HTTP request files organized by resource
${config.testRunner !== 'none' ? '- `tests/` - Test files for your HTTP requests\n' : ''}
## Learn More

- [t-req Documentation](https://t-req.io)
`;
}

export function generateBasicTestFile(testRunner: ProjectConfig['testRunner']): string {
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

describe('collection/users/list.http', () => {
  test('returns a list of users', async () => {
    const response = await client.run('./collection/users/list.http');

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);

    const users = await response.json();
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);
  });
});
`;
}

export function generateCreatePostRequest(): string {
  return `POST {{baseUrl}}/posts
Content-Type: application/json
X-Request-ID: {{$uuid()}}

# @assert status == 201

{
  "title": "Hello from t-req",
  "body": "Created at {{$isodate()}}",
  "userId": 1
}
`;
}

export function generateListUsersRequest(): string {
  return `GET {{baseUrl}}/users
Accept: application/json

# @assert status == 200
`;
}

export function generateGetUserRequest(): string {
  return `GET {{baseUrl}}/users/{{userId}}

# @assert status == 200
`;
}
