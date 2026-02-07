import * as p from '@clack/prompts';
import { $ } from 'bun';
import type { CommandModule } from 'yargs';

type Runtime = 'bun' | 'node';
type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn';
type TestRunner = 'bun' | 'vitest' | 'jest' | 'none';

interface InitOptions {
  name?: string;
  yes?: boolean;
  'no-tests'?: boolean;
  'test-runner'?: TestRunner;
}

interface ProjectConfig {
  name: string;
  runtime: Runtime;
  packageManager: PackageManager;
  testRunner: TestRunner;
}

export const initCommand: CommandModule<object, InitOptions> = {
  command: 'init [name]',
  describe: 'Create a new t-req project',
  builder: {
    name: {
      type: 'string',
      describe: 'Project name (also used as directory name)'
    },
    yes: {
      alias: 'y',
      type: 'boolean',
      describe: 'Skip prompts and use defaults (bun runtime, bun package manager)',
      default: false
    },
    'no-tests': {
      type: 'boolean',
      describe: 'Skip test file generation',
      default: false
    },
    'test-runner': {
      type: 'string',
      choices: ['bun', 'vitest', 'jest'] as const,
      describe: 'Test runner to use (auto-detected if not specified)'
    }
  },
  handler: async (argv) => {
    await runInit(argv);
  }
};

const SEP = '/';

function basename(p: string): string {
  const lastSlash = p.lastIndexOf(SEP);
  return lastSlash === -1 ? p : p.slice(lastSlash + 1);
}

function isAbsolute(p: string): boolean {
  return p.startsWith(SEP);
}

function join(...parts: string[]): string {
  return parts.filter(Boolean).join(SEP).replace(/\/+/g, SEP);
}

function resolve(...parts: string[]): string {
  let resolved = '';
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (!part) continue;
    resolved = resolved ? join(part, resolved) : part;
    if (isAbsolute(resolved)) break;
  }
  if (!isAbsolute(resolved)) {
    resolved = join(process.cwd(), resolved);
  }
  // Normalize path (resolve . and ..)
  const segments = resolved.split(SEP).filter(Boolean);
  const stack: string[] = [];
  for (const segment of segments) {
    if (segment === '..') {
      stack.pop();
    } else if (segment !== '.') {
      stack.push(segment);
    }
  }
  return SEP + stack.join(SEP);
}

// ============================================================================
// Constants
// ============================================================================

const NPM_RESERVED = new Set(['node_modules', 'package', 'npm', 'node', 'bun', 'test', 'tests']);

function getDefaultTestRunner(runtime: Runtime): TestRunner {
  return runtime === 'bun' ? 'bun' : 'vitest';
}

// ============================================================================
// Validation
// ============================================================================

function validateProjectName(value: string): string | undefined {
  if (!value.trim()) return 'Project name is required';
  if (value.length > 214) return 'Project name must be 214 characters or less';
  if (!/^[a-z0-9-_]+$/i.test(value)) {
    return 'Project name can only contain letters, numbers, hyphens, and underscores';
  }
  if (NPM_RESERVED.has(value.toLowerCase())) return `"${value}" is a reserved name`;
  if (value.startsWith('-') || value.startsWith('_')) {
    return 'Project name cannot start with - or _';
  }
  return undefined;
}

// ============================================================================
// Init Command
// ============================================================================

async function runInit(argv: InitOptions): Promise<void> {
  p.intro('Create a new t-req project');

  const config = await gatherConfig(argv);

  if (p.isCancel(config)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  const projectPath = resolve(process.cwd(), config.name);

  if (await Bun.file(projectPath).exists()) {
    p.cancel(`Directory "${config.name}" already exists`);
    process.exit(1);
  }

  const s = p.spinner();
  s.start('Creating project structure');

  try {
    await createProjectStructure(projectPath, config);
    s.stop('Project structure created');

    p.note(getNextSteps(config), 'Next steps');
    p.outro(`Project "${config.name}" created successfully!`);
  } catch (error) {
    s.stop('Failed to create project');
    p.cancel(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

async function gatherConfig(argv: InitOptions): Promise<ProjectConfig | symbol> {
  if (argv.yes) {
    const name = argv.name ?? 'my-treq-project';
    // Validate name even in non-interactive mode
    const validationError = validateProjectName(name);
    if (validationError) {
      p.cancel(validationError);
      process.exit(1);
    }
    const runtime: Runtime = 'bun';
    const testRunner: TestRunner = argv['no-tests']
      ? 'none'
      : (argv['test-runner'] ?? getDefaultTestRunner(runtime));
    return {
      name,
      runtime,
      packageManager: 'bun',
      testRunner
    };
  }

  const name =
    argv.name ??
    (await p.text({
      message: 'Project name',
      placeholder: 'my-treq-project',
      defaultValue: 'my-treq-project',
      validate: validateProjectName
    }));

  if (p.isCancel(name)) return name;

  const runtime = await p.select({
    message: 'Select runtime',
    options: [
      { value: 'bun', label: 'Bun', hint: 'recommended' },
      { value: 'node', label: 'Node.js', hint: 'requires tsx' }
    ],
    initialValue: 'bun'
  });

  if (p.isCancel(runtime)) return runtime;

  const packageManager = await p.select({
    message: 'Select package manager',
    options: [
      { value: 'bun', label: 'bun' },
      { value: 'npm', label: 'npm' },
      { value: 'pnpm', label: 'pnpm' },
      { value: 'yarn', label: 'yarn' }
    ],
    initialValue: 'bun'
  });

  if (p.isCancel(packageManager)) return packageManager;

  const selectedRuntime = runtime as Runtime;
  const testRunner: TestRunner = argv['no-tests']
    ? 'none'
    : (argv['test-runner'] ?? getDefaultTestRunner(selectedRuntime));

  return {
    name: name as string,
    runtime: selectedRuntime,
    packageManager: packageManager as PackageManager,
    testRunner
  };
}

async function createProjectStructure(projectPath: string, config: ProjectConfig): Promise<void> {
  const projectName = basename(projectPath);

  // Create directories using Bun shell
  await $`mkdir -p ${projectPath}`.quiet();
  await $`mkdir -p ${join(projectPath, '.treq')}`.quiet();
  await $`mkdir -p ${join(projectPath, 'collection', 'posts')}`.quiet();
  await $`mkdir -p ${join(projectPath, 'collection', 'users')}`.quiet();

  // Create tests directory if tests enabled
  if (config.testRunner !== 'none') {
    await $`mkdir -p ${join(projectPath, 'tests')}`.quiet();
  }

  // Write root files
  await Bun.write(join(projectPath, 'treq.jsonc'), generateConfig());
  await Bun.write(join(projectPath, 'client.ts'), generateClientFile(config.runtime));
  await Bun.write(join(projectPath, 'run.ts'), generateRunScript(config.runtime));
  await Bun.write(join(projectPath, 'package.json'), generatePackageJson(projectName, config));
  await Bun.write(join(projectPath, 'tsconfig.json'), generateTsconfig(config.runtime));
  await Bun.write(join(projectPath, '.gitignore'), generateGitignore());
  await Bun.write(join(projectPath, 'README.md'), generateReadme(projectName, config));

  // Write test file if tests enabled
  if (config.testRunner !== 'none') {
    await Bun.write(
      join(projectPath, 'tests', 'list.test.ts'),
      generateTestFile(config.testRunner)
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

export function generateConfig(): string {
  return `{
  // Enable base resolvers: {{$uuid()}}, {{$timestamp()}}, {{$env(KEY)}}, etc.
  "plugins": ["@t-req/plugin-base"],

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

export function generateClientFile(runtime: Runtime): string {
  const nodeImport =
    runtime === 'node' ? "\nimport { createNodeIO } from '@t-req/core/runtime';" : '';
  const ioOption = runtime === 'node' ? '\n  io: createNodeIO(),' : '';

  return `import { createClient } from '@t-req/core';
import { resolveProjectConfig } from '@t-req/core/config';${nodeImport}

const { config } = await resolveProjectConfig({ startDir: process.cwd() });

export const client = createClient({${ioOption}
  variables: config.variables,
  defaults: config.defaults,
});
`;
}

export function generateRunScript(runtime: Runtime): string {
  const shebang = runtime === 'bun' ? '#!/usr/bin/env bun' : '#!/usr/bin/env npx tsx';

  return `${shebang}
import { client } from './client';

const response = await client.run('./collection/users/get.http');
console.log(response.status, await response.json());
`;
}

export function generateTestFile(testRunner: TestRunner): string {
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

export function generateReadme(projectName: string, config: ProjectConfig): string {
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

export function generatePackageJson(projectName: string, config: ProjectConfig): string {
  const runCommand = config.runtime === 'bun' ? 'bun run.ts' : 'npx tsx run.ts';

  const scripts: Record<string, string> = {
    start: runCommand
  };

  // Add test script based on runner
  if (config.testRunner === 'bun') {
    scripts.test = 'bun test';
  } else if (config.testRunner === 'vitest') {
    scripts.test = 'vitest';
  } else if (config.testRunner === 'jest') {
    scripts.test = 'jest';
  }

  const pkg: Record<string, unknown> = {
    name: projectName,
    version: '0.0.1',
    private: true,
    type: 'module',
    scripts,
    dependencies: {
      '@t-req/core': 'latest'
    }
  };

  const devDeps: Record<string, string> = {};

  // Add runtime-specific devDependencies
  if (config.runtime === 'bun') {
    devDeps['@types/bun'] = 'latest';
  } else {
    devDeps['@types/node'] = '^22.0.0';
    devDeps['tsx'] = '^4.0.0';
  }

  // Add test runner devDependencies
  if (config.testRunner === 'vitest') {
    devDeps['vitest'] = '^3.0.0';
  } else if (config.testRunner === 'jest') {
    devDeps['jest'] = '^29.0.0';
    devDeps['@types/jest'] = '^29.0.0';
    devDeps['ts-jest'] = '^29.0.0';
  }

  pkg['devDependencies'] = devDeps;

  return `${JSON.stringify(pkg, null, 2)}\n`;
}

export function generateGitignore(): string {
  return `node_modules/
dist/
.env
.env.local
*.log

# t-req local state
.treq/cookies.json
`;
}

export function generateTsconfig(runtime: Runtime): string {
  const types = runtime === 'bun' ? 'bun-types' : 'node';
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'bundler',
        types: [types],
        strict: true,
        noEmit: true
      }
    },
    null,
    2
  )}\n`;
}

export function generateCreatePostRequest(): string {
  return `POST {{baseUrl}}/posts
Content-Type: application/json
X-Request-ID: {{$uuid()}}

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
`;
}

export function generateGetUserRequest(): string {
  return `GET {{baseUrl}}/users/{{userId}}
`;
}

export function getNextSteps(config: ProjectConfig): string {
  const installCmd = getInstallCommand(config.packageManager);
  const runCmd = config.runtime === 'bun' ? 'bun run.ts' : 'npx tsx run.ts';

  let testCmd = '';
  if (config.testRunner !== 'none') {
    if (config.testRunner === 'bun') {
      testCmd = '\nbun test';
    } else {
      const pm = config.packageManager;
      testCmd = pm === 'npm' ? '\nnpm test' : `\n${pm} test`;
    }
  }

  return `cd ${config.name}
${installCmd}
${runCmd}${testCmd}`;
}

export function getInstallCommand(pm: PackageManager): string {
  switch (pm) {
    case 'bun':
      return 'bun install';
    case 'npm':
      return 'npm install';
    case 'pnpm':
      return 'pnpm install';
    case 'yarn':
      return 'yarn';
  }
}

// Exported for unit tests (and to avoid re-implementing validation logic in tests).
export { validateProjectName };
