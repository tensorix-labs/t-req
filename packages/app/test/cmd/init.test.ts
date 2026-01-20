import { describe, expect, test } from 'bun:test';
import {
  generateConfig,
  generateGitignore,
  generateLoginRequest,
  generatePackageJson,
  generateRunScript,
  getInstallCommand,
  getNextSteps,
  validateProjectName
} from '../../src/cmd/init';

describe('project name validation', () => {
  test('should accept valid project names', () => {
    expect(validateProjectName('my-project')).toBeUndefined();
    expect(validateProjectName('my_project')).toBeUndefined();
    expect(validateProjectName('project123')).toBeUndefined();
    expect(validateProjectName('MyProject')).toBeUndefined();
    expect(validateProjectName('a')).toBeUndefined();
  });

  test('should reject empty names', () => {
    expect(validateProjectName('')).toBe('Project name is required');
    expect(validateProjectName('   ')).toBe('Project name is required');
  });

  test('should reject names over 214 characters', () => {
    const longName = 'a'.repeat(215);
    expect(validateProjectName(longName)).toBe('Project name must be 214 characters or less');
  });

  test('should accept names up to 214 characters', () => {
    const maxName = 'a'.repeat(214);
    expect(validateProjectName(maxName)).toBeUndefined();
  });

  test('should reject names with special characters', () => {
    expect(validateProjectName('my project')).toContain('only contain letters');
    expect(validateProjectName('my.project')).toContain('only contain letters');
    expect(validateProjectName('my@project')).toContain('only contain letters');
    expect(validateProjectName('my/project')).toContain('only contain letters');
  });

  test('should reject reserved npm names', () => {
    expect(validateProjectName('node_modules')).toContain('reserved name');
    expect(validateProjectName('package')).toContain('reserved name');
    expect(validateProjectName('npm')).toContain('reserved name');
    expect(validateProjectName('node')).toContain('reserved name');
    expect(validateProjectName('bun')).toContain('reserved name');
    expect(validateProjectName('test')).toContain('reserved name');
    expect(validateProjectName('tests')).toContain('reserved name');
  });

  test('should reject reserved names case-insensitively', () => {
    expect(validateProjectName('NODE_MODULES')).toContain('reserved name');
    expect(validateProjectName('Package')).toContain('reserved name');
    expect(validateProjectName('NPM')).toContain('reserved name');
  });

  test('should reject names starting with - or _', () => {
    expect(validateProjectName('-project')).toContain('cannot start with');
    expect(validateProjectName('_project')).toContain('cannot start with');
  });

  test('should allow - and _ in middle of name', () => {
    expect(validateProjectName('my-cool-project')).toBeUndefined();
    expect(validateProjectName('my_cool_project')).toBeUndefined();
    expect(validateProjectName('project-')).toBeUndefined(); // Trailing is ok
  });
});

describe('generated file contents', () => {
  test('should generate valid treq.jsonc config', () => {
    const config = generateConfig();
    expect(config).toContain('"variables"');
    expect(config).toContain('"baseUrl"');
    expect(config).toContain('"profiles"');
    expect(config).toContain('"dev"');
    expect(config).toContain('"prod"');
  });

  test('should generate run script with correct shebang for bun', () => {
    const script = generateRunScript('bun');
    expect(script).toContain('#!/usr/bin/env bun');
    expect(script).toContain('import { createClient }');
  });

  test('should generate run script with correct shebang for node', () => {
    const script = generateRunScript('node');
    expect(script).toContain('#!/usr/bin/env npx tsx');
  });

  test('should generate package.json with correct name', () => {
    const pkgText = generatePackageJson('my-api-tests', {
      name: 'my-api-tests',
      runtime: 'bun',
      packageManager: 'bun'
    });
    const pkg = JSON.parse(pkgText) as { name: string; version: string; private: boolean };
    expect(pkg.name).toBe('my-api-tests');
    expect(pkg.version).toBe('0.0.1');
    expect(pkg.private).toBe(true);
  });

  test('should add tsx devDependency for node runtime', () => {
    const bunPkg = JSON.parse(
      generatePackageJson('test', { name: 'test', runtime: 'bun', packageManager: 'bun' })
    ) as { devDependencies?: Record<string, string> };
    expect(bunPkg.devDependencies).toBeUndefined();

    const nodePkg = JSON.parse(
      generatePackageJson('test', { name: 'test', runtime: 'node', packageManager: 'npm' })
    ) as { devDependencies?: Record<string, string> };
    expect(nodePkg.devDependencies?.tsx).toBe('^4.0.0');
  });

  test('should generate .gitignore with common patterns', () => {
    const gitignore = generateGitignore();
    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('.env');
    expect(gitignore).toContain('*.log');
  });

  test('should generate config with profiles for dev and prod', () => {
    const config = generateConfig();
    // Dev profile should have localhost
    expect(config).toContain('localhost:3000');
    // Prod profile should have api.example.com
    expect(config).toContain('api.example.com');
    // Should have commented cookie persistence example
    expect(config).toContain('Uncomment to persist cookies');
  });

  test('should generate sample HTTP request files', () => {
    const loginRequest = generateLoginRequest();
    expect(loginRequest).toContain('POST');
    expect(loginRequest).toContain('{{baseUrl}}');
    expect(loginRequest).toContain('{{email}}');
    expect(loginRequest).toContain('{{password}}');
  });
});

describe('install command generation', () => {
  test('should generate correct install commands', () => {
    expect(getInstallCommand('bun')).toBe('bun install');
    expect(getInstallCommand('npm')).toBe('npm install');
    expect(getInstallCommand('pnpm')).toBe('pnpm install');
    expect(getInstallCommand('yarn')).toBe('yarn');
  });
});

describe('next steps generation', () => {
  test('should generate correct next steps', () => {
    const steps = getNextSteps({
      name: 'my-project',
      runtime: 'bun',
      packageManager: 'bun'
    });
    expect(steps).toBe('cd my-project\nbun install\nbun run.ts');

    const nodeSteps = getNextSteps({
      name: 'api-tests',
      runtime: 'node',
      packageManager: 'npm'
    });
    expect(nodeSteps).toBe('cd api-tests\nnpm install\nnpx tsx run.ts');

    const yarnSteps = getNextSteps({
      name: 'test',
      runtime: 'bun',
      packageManager: 'yarn'
    });
    expect(yarnSteps).toBe('cd test\nyarn\nbun run.ts');
  });
});
