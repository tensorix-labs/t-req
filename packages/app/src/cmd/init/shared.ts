import type { PackageManager, ProjectConfig, Runtime, TestRunner } from './types';

// ============================================================================
// Path utilities (no node:path dependency)
// ============================================================================

const SEP = '/';

export function basename(p: string): string {
  const lastSlash = p.lastIndexOf(SEP);
  return lastSlash === -1 ? p : p.slice(lastSlash + 1);
}

export function isAbsolute(p: string): boolean {
  return p.startsWith(SEP);
}

export function join(...parts: string[]): string {
  return parts.filter(Boolean).join(SEP).replace(/\/+/g, SEP);
}

export function resolve(...parts: string[]): string {
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
// Validation
// ============================================================================

const NPM_RESERVED = new Set(['node_modules', 'package', 'npm', 'node', 'bun', 'test', 'tests']);

export function validateProjectName(value: string): string | undefined {
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
// Runtime helpers
// ============================================================================

export function getDefaultTestRunner(runtime: Runtime): TestRunner {
  return runtime === 'bun' ? 'bun' : 'vitest';
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

// ============================================================================
// Shared generators (used by empty + basic templates)
// ============================================================================

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
      '@t-req/core': 'latest',
      '@t-req/plugin-base': 'latest',
      '@t-req/plugin-assert': 'latest'
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
