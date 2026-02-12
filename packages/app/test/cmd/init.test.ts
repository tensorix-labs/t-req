import { describe, expect, test } from 'bun:test';
import {
  generateClientFile,
  generateConfig,
  generateCreatePostRequest,
  generateEmptyConfig,
  generateEmptyReadme,
  generateEmptyTestFile,
  generateGetUserRequest,
  generateGitignore,
  generateHelloRequest,
  generateListUsersRequest,
  generatePackageJson,
  generateReadme,
  generateRunScript,
  generateTestFile,
  generateTsconfig,
  getInstallCommand,
  getNextSteps,
  TEMPLATE_CAPABILITIES,
  validateProjectName
} from '../../src/cmd/init';

// Helper: basic template config
function basicConfig(
  overrides: Partial<import('../../src/cmd/init').ProjectConfig> = {}
): import('../../src/cmd/init').ProjectConfig {
  return {
    name: 'my-project',
    template: 'basic',
    runtime: 'bun',
    packageManager: 'bun',
    testRunner: 'bun',
    ...overrides
  };
}

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

  test('should generate config with both plugins', () => {
    const config = generateConfig();
    expect(config).toContain('"@t-req/plugin-base"');
    expect(config).toContain('"@t-req/plugin-assert"');
  });

  test('should generate run script with correct shebang for bun', () => {
    const script = generateRunScript('bun');
    expect(script).toContain('#!/usr/bin/env bun');
    expect(script).toContain("import { client } from './client'");
  });

  test('should generate run script with correct shebang for node', () => {
    const script = generateRunScript('node');
    expect(script).toContain('#!/usr/bin/env npx tsx');
    expect(script).toContain("import { client } from './client'");
  });

  test('should generate package.json with correct name', () => {
    const pkgText = generatePackageJson('my-api-tests', basicConfig({ name: 'my-api-tests' }));
    const pkg = JSON.parse(pkgText) as { name: string; version: string; private: boolean };
    expect(pkg.name).toBe('my-api-tests');
    expect(pkg.version).toBe('0.0.1');
    expect(pkg.private).toBe(true);
  });

  test('should add type devDependencies per runtime', () => {
    const bunPkg = JSON.parse(
      generatePackageJson('test-proj', basicConfig({ name: 'test-proj' }))
    ) as { devDependencies?: Record<string, string> };
    expect(bunPkg.devDependencies?.['@types/bun']).toBe('latest');

    const nodePkg = JSON.parse(
      generatePackageJson(
        'test-proj',
        basicConfig({
          name: 'test-proj',
          runtime: 'node',
          packageManager: 'npm',
          testRunner: 'vitest'
        })
      )
    ) as { devDependencies?: Record<string, string> };
    expect(nodePkg.devDependencies?.tsx).toBe('^4.0.0');
    expect(nodePkg.devDependencies?.['@types/node']).toBe('^22.0.0');
  });

  test('should use latest for @t-req dependencies', () => {
    const pkg = JSON.parse(
      generatePackageJson('test-proj', basicConfig({ name: 'test-proj' }))
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@t-req/core']).toBe('latest');
    expect(pkg.dependencies['@t-req/plugin-base']).toBe('latest');
    expect(pkg.dependencies['@t-req/plugin-assert']).toBe('latest');
  });

  test('should generate .gitignore with common patterns', () => {
    const gitignore = generateGitignore();
    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('.env');
    expect(gitignore).toContain('*.log');
  });

  test('should generate config with profiles for dev and prod', () => {
    const config = generateConfig();
    expect(config).toContain('localhost:3000');
    expect(config).toContain('api.example.com');
    expect(config).toContain('Uncomment to persist cookies');
  });

  test('should generate sample HTTP request files with assert directives', () => {
    const createPost = generateCreatePostRequest();
    expect(createPost).toContain('POST');
    expect(createPost).toContain('{{baseUrl}}/posts');
    expect(createPost).toContain('"title"');
    expect(createPost).toContain('# @assert status == 201');
    expect(createPost).not.toContain('{{email}}');
    expect(createPost).not.toContain('{{password}}');

    const listUsers = generateListUsersRequest();
    expect(listUsers).toContain('# @assert status == 200');

    const getUser = generateGetUserRequest();
    expect(getUser).toContain('# @assert status == 200');
  });

  test('should generate run script that imports from client', () => {
    const script = generateRunScript('bun');
    expect(script).toContain("import { client } from './client'");
    expect(script).toContain('client.run');
    expect(script).not.toContain('createClient');
    expect(script).not.toContain('resolveProjectConfig');
  });

  test('should generate tsconfig with bun-types for bun runtime', () => {
    const tsconfig = JSON.parse(generateTsconfig('bun'));
    expect(tsconfig.compilerOptions.types).toEqual(['bun-types']);
  });

  test('should generate tsconfig with node types for node runtime', () => {
    const tsconfig = JSON.parse(generateTsconfig('node'));
    expect(tsconfig.compilerOptions.types).toEqual(['node']);
  });

  test('all template variables should be defined in config', () => {
    const config = generateConfig();
    const templates = [
      generateCreatePostRequest(),
      generateListUsersRequest(),
      generateGetUserRequest()
    ];
    for (const tpl of templates) {
      const vars = [...tpl.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
      for (const v of vars) {
        expect(config).toContain(`"${v}"`);
      }
    }
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
  test('should generate correct next steps without tests', () => {
    const steps = getNextSteps(basicConfig({ testRunner: 'none' }));
    expect(steps).toBe('cd my-project\nbun install\nbun run.ts');

    const nodeSteps = getNextSteps(
      basicConfig({
        name: 'api-tests',
        runtime: 'node',
        packageManager: 'npm',
        testRunner: 'none'
      })
    );
    expect(nodeSteps).toBe('cd api-tests\nnpm install\nnpx tsx run.ts');

    const yarnSteps = getNextSteps(
      basicConfig({
        name: 'my-app',
        packageManager: 'yarn',
        testRunner: 'none'
      })
    );
    expect(yarnSteps).toBe('cd my-app\nyarn\nbun run.ts');
  });

  test('should include test command when tests enabled', () => {
    const bunSteps = getNextSteps(basicConfig());
    expect(bunSteps).toBe('cd my-project\nbun install\nbun run.ts\nbun test');

    const vitestSteps = getNextSteps(
      basicConfig({
        runtime: 'node',
        packageManager: 'npm',
        testRunner: 'vitest'
      })
    );
    expect(vitestSteps).toBe('cd my-project\nnpm install\nnpx tsx run.ts\nnpm test');

    const jestPnpmSteps = getNextSteps(
      basicConfig({
        runtime: 'node',
        packageManager: 'pnpm',
        testRunner: 'jest'
      })
    );
    expect(jestPnpmSteps).toBe('cd my-project\npnpm install\nnpx tsx run.ts\npnpm test');
  });
});

describe('generateTestFile', () => {
  test('should generate test file with bun imports', () => {
    const testFile = generateTestFile('bun');
    expect(testFile).toContain("import { describe, expect, test } from 'bun:test'");
    expect(testFile).toContain("import { client } from '../client'");
    expect(testFile).not.toContain('createClient');
    expect(testFile).not.toContain('resolveProjectConfig');
  });

  test('should generate test file with vitest imports', () => {
    const testFile = generateTestFile('vitest');
    expect(testFile).toContain("import { describe, expect, test } from 'vitest'");
    expect(testFile).toContain("import { client } from '../client'");
  });

  test('should generate test file with jest comment', () => {
    const testFile = generateTestFile('jest');
    expect(testFile).toContain('// Jest globals are available');
    expect(testFile).toContain("import { client } from '../client'");
  });

  test('should reference collection/users/list.http', () => {
    const testFile = generateTestFile('bun');
    expect(testFile).toContain('collection/users/list.http');
    expect(testFile).toContain("describe('collection/users/list.http'");
  });

  test('should return empty string for none runner', () => {
    const testFile = generateTestFile('none');
    expect(testFile).toBe('');
  });
});

describe('generateClientFile', () => {
  test('should generate client file for bun runtime', () => {
    const clientFile = generateClientFile('bun');
    expect(clientFile).toContain("import { createClient } from '@t-req/core'");
    expect(clientFile).toContain("import { resolveProjectConfig } from '@t-req/core/config'");
    expect(clientFile).toContain('export const client = createClient');
    expect(clientFile).not.toContain('createNodeIO');
  });

  test('should generate client file for node runtime with createNodeIO', () => {
    const clientFile = generateClientFile('node');
    expect(clientFile).toContain("import { createClient } from '@t-req/core'");
    expect(clientFile).toContain("import { resolveProjectConfig } from '@t-req/core/config'");
    expect(clientFile).toContain("import { createNodeIO } from '@t-req/core/runtime'");
    expect(clientFile).toContain('io: createNodeIO()');
    expect(clientFile).toContain('export const client = createClient');
  });

  test('should include resolveProjectConfig', () => {
    const clientFile = generateClientFile('bun');
    expect(clientFile).toContain('resolveProjectConfig');
    expect(clientFile).toContain('config.variables');
    expect(clientFile).toContain('config.defaults');
  });
});

describe('generatePackageJson with test runners', () => {
  test('should include test script for bun runner', () => {
    const pkg = JSON.parse(
      generatePackageJson('test-project', basicConfig({ name: 'test-project' }))
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts.test).toBe('bun test');
  });

  test('should include test script for vitest runner', () => {
    const pkg = JSON.parse(
      generatePackageJson(
        'test-project',
        basicConfig({
          name: 'test-project',
          runtime: 'node',
          packageManager: 'npm',
          testRunner: 'vitest'
        })
      )
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts.test).toBe('vitest');
  });

  test('should include test script for jest runner', () => {
    const pkg = JSON.parse(
      generatePackageJson(
        'test-project',
        basicConfig({
          name: 'test-project',
          runtime: 'node',
          packageManager: 'npm',
          testRunner: 'jest'
        })
      )
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts.test).toBe('jest');
  });

  test('should omit test script when testRunner is none', () => {
    const pkg = JSON.parse(
      generatePackageJson(
        'test-project',
        basicConfig({
          name: 'test-project',
          testRunner: 'none'
        })
      )
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts.test).toBeUndefined();
  });

  test('should include vitest devDependency', () => {
    const pkg = JSON.parse(
      generatePackageJson(
        'test-project',
        basicConfig({
          name: 'test-project',
          runtime: 'node',
          packageManager: 'npm',
          testRunner: 'vitest'
        })
      )
    ) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies.vitest).toBe('^3.0.0');
  });

  test('should include jest devDependencies', () => {
    const pkg = JSON.parse(
      generatePackageJson(
        'test-project',
        basicConfig({
          name: 'test-project',
          runtime: 'node',
          packageManager: 'npm',
          testRunner: 'jest'
        })
      )
    ) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies.jest).toBe('^29.0.0');
    expect(pkg.devDependencies['@types/jest']).toBe('^29.0.0');
    expect(pkg.devDependencies['ts-jest']).toBe('^29.0.0');
  });

  test('should not add test runner deps for bun', () => {
    const pkg = JSON.parse(
      generatePackageJson('test-project', basicConfig({ name: 'test-project' }))
    ) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies.vitest).toBeUndefined();
    expect(pkg.devDependencies.jest).toBeUndefined();
  });
});

describe('generateReadme', () => {
  test('should include project name', () => {
    const readme = generateReadme('my-api-tests', basicConfig({ name: 'my-api-tests' }));
    expect(readme).toContain('# my-api-tests');
  });

  test('should include test section when tests enabled', () => {
    const readme = generateReadme('my-project', basicConfig());
    expect(readme).toContain('## Running Tests');
    expect(readme).toContain('bun test');
    expect(readme).toContain('tests/');
  });

  test('should omit test section when tests disabled', () => {
    const readme = generateReadme('my-project', basicConfig({ testRunner: 'none' }));
    expect(readme).not.toContain('## Running Tests');
    expect(readme).not.toContain('tests/');
  });

  test('should include correct install command', () => {
    const npmReadme = generateReadme(
      'my-project',
      basicConfig({
        runtime: 'node',
        packageManager: 'npm',
        testRunner: 'vitest'
      })
    );
    expect(npmReadme).toContain('npm install');

    const pnpmReadme = generateReadme(
      'my-project',
      basicConfig({
        runtime: 'node',
        packageManager: 'pnpm',
        testRunner: 'vitest'
      })
    );
    expect(pnpmReadme).toContain('pnpm install');
  });

  test('should include correct test command for each runner', () => {
    const bunReadme = generateReadme('my-project', basicConfig());
    expect(bunReadme).toContain('bun test');

    const vitestReadme = generateReadme(
      'my-project',
      basicConfig({
        runtime: 'node',
        packageManager: 'npm',
        testRunner: 'vitest'
      })
    );
    expect(vitestReadme).toContain('npm test');
  });

  test('should include documentation link', () => {
    const readme = generateReadme('my-project', basicConfig());
    expect(readme).toContain('https://t-req.io');
  });

  test('should include client.ts in project structure', () => {
    const readme = generateReadme('my-project', basicConfig());
    expect(readme).toContain('client.ts');
    expect(readme).toContain('Shared t-req client');
  });
});

describe('empty template', () => {
  test('should generate minimal config with both plugins', () => {
    const config = generateEmptyConfig();
    expect(config).toContain('"@t-req/plugin-base"');
    expect(config).toContain('"@t-req/plugin-assert"');
    expect(config).toContain('"baseUrl"');
    expect(config).not.toContain('"profiles"');
  });

  test('should generate hello request with assert directive', () => {
    const request = generateHelloRequest();
    expect(request).toContain('GET {{baseUrl}}/users/1');
    expect(request).toContain('# @assert status == 200');
  });

  test('all empty template variables should be defined in config', () => {
    const config = generateEmptyConfig();
    const vars = [...generateHelloRequest().matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    for (const v of vars) {
      expect(config).toContain(`"${v}"`);
    }
  });

  test('should generate empty test file with correct imports', () => {
    const bunTest = generateEmptyTestFile('bun');
    expect(bunTest).toContain("import { describe, expect, test } from 'bun:test'");
    expect(bunTest).toContain('collection/hello.http');

    const vitestTest = generateEmptyTestFile('vitest');
    expect(vitestTest).toContain("import { describe, expect, test } from 'vitest'");

    const jestTest = generateEmptyTestFile('jest');
    expect(jestTest).toContain('// Jest globals are available');

    expect(generateEmptyTestFile('none')).toBe('');
  });

  test('should generate empty readme with project name', () => {
    const readme = generateEmptyReadme(
      'my-empty',
      basicConfig({ name: 'my-empty', template: 'empty' })
    );
    expect(readme).toContain('# my-empty');
    expect(readme).toContain('https://t-req.io');
  });
});

describe('template capabilities', () => {
  test('should define capabilities for both templates', () => {
    expect(TEMPLATE_CAPABILITIES.basic).toBeDefined();
    expect(TEMPLATE_CAPABILITIES.empty).toBeDefined();
  });

  test('both templates should support bun and node runtimes', () => {
    expect(TEMPLATE_CAPABILITIES.basic.runtimes).toContain('bun');
    expect(TEMPLATE_CAPABILITIES.basic.runtimes).toContain('node');
    expect(TEMPLATE_CAPABILITIES.empty.runtimes).toContain('bun');
    expect(TEMPLATE_CAPABILITIES.empty.runtimes).toContain('node');
  });

  test('both templates should support all package managers', () => {
    for (const pm of ['bun', 'npm', 'pnpm', 'yarn'] as const) {
      expect(TEMPLATE_CAPABILITIES.basic.packageManagers).toContain(pm);
      expect(TEMPLATE_CAPABILITIES.empty.packageManagers).toContain(pm);
    }
  });

  test('both templates should have descriptions', () => {
    expect(TEMPLATE_CAPABILITIES.basic.description).toBeTruthy();
    expect(TEMPLATE_CAPABILITIES.empty.description).toBeTruthy();
  });
});
