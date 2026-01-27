import * as p from '@clack/prompts';
import { $ } from 'bun';
import type { CommandModule } from 'yargs';

type Runtime = 'bun' | 'node';
type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn';

interface InitOptions {
  name?: string;
  yes?: boolean;
}

interface ProjectConfig {
  name: string;
  runtime: Runtime;
  packageManager: PackageManager;
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
    return {
      name,
      runtime: 'bun',
      packageManager: 'bun'
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

  return {
    name: name as string,
    runtime: runtime as Runtime,
    packageManager: packageManager as PackageManager
  };
}

async function createProjectStructure(projectPath: string, config: ProjectConfig): Promise<void> {
  const projectName = basename(projectPath);

  // Create directories using Bun shell
  await $`mkdir -p ${projectPath}`.quiet();
  await $`mkdir -p ${join(projectPath, '.treq')}`.quiet();
  await $`mkdir -p ${join(projectPath, 'collection', 'posts')}`.quiet();
  await $`mkdir -p ${join(projectPath, 'collection', 'users')}`.quiet();

  // Write root files
  await Bun.write(join(projectPath, 'treq.jsonc'), generateConfig());
  await Bun.write(join(projectPath, 'run.ts'), generateRunScript(config.runtime));
  await Bun.write(join(projectPath, 'package.json'), generatePackageJson(projectName, config));
  await Bun.write(join(projectPath, 'tsconfig.json'), generateTsconfig(config.runtime));
  await Bun.write(join(projectPath, '.gitignore'), generateGitignore());

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

export function generateRunScript(runtime: Runtime): string {
  const shebang = runtime === 'bun' ? '#!/usr/bin/env bun' : '#!/usr/bin/env npx tsx';

  const nodeImport =
    runtime === 'node' ? "\nimport { createNodeIO } from '@t-req/core/runtime';" : '';
  const ioOption = runtime === 'node' ? '\n  io: createNodeIO(),' : '';

  return `${shebang}
import { createClient } from '@t-req/core';
import { resolveProjectConfig } from '@t-req/core/config';${nodeImport}

const { config } = await resolveProjectConfig({ startDir: process.cwd() });

const client = createClient({${ioOption}
  variables: config.variables,
  defaults: config.defaults,
});

const response = await client.run('./collection/users/get.http');
console.log(response.status, await response.json());
`;
}

export function generatePackageJson(projectName: string, config: ProjectConfig): string {
  const runCommand = config.runtime === 'bun' ? 'bun run.ts' : 'npx tsx run.ts';

  const pkg: Record<string, unknown> = {
    name: projectName,
    version: '0.0.1',
    private: true,
    type: 'module',
    scripts: {
      start: runCommand
    },
    dependencies: {
      '@t-req/core': 'latest'
    }
  };

  if (config.runtime === 'bun') {
    pkg['devDependencies'] = {
      '@types/bun': 'latest'
    };
  } else {
    pkg['devDependencies'] = {
      '@types/node': '^22.0.0',
      tsx: '^4.0.0'
    };
  }

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

{
  "title": "Hello from t-req",
  "body": "This is a sample post.",
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

  return `cd ${config.name}
${installCmd}
${runCmd}`;
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
