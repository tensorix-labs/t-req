export type Runtime = 'bun' | 'node';
export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn';
export type TestRunner = 'bun' | 'vitest' | 'jest' | 'none';
export type TemplateType = 'empty' | 'basic';

export interface InitOptions {
  name?: string;
  yes?: boolean;
  template?: TemplateType;
  'no-tests'?: boolean;
  'test-runner'?: TestRunner;
}

export interface ProjectConfig {
  name: string;
  template: TemplateType;
  runtime: Runtime;
  packageManager: PackageManager;
  testRunner: TestRunner;
}

export const TEMPLATE_CAPABILITIES: Record<
  TemplateType,
  {
    runtimes: readonly Runtime[];
    packageManagers: readonly PackageManager[];
    testRunners: readonly TestRunner[];
    description: string;
  }
> = {
  basic: {
    runtimes: ['bun', 'node'],
    packageManagers: ['bun', 'npm', 'pnpm', 'yarn'],
    testRunners: ['bun', 'vitest', 'jest', 'none'],
    description: 'Starter project with sample collection and tests'
  },
  empty: {
    runtimes: ['bun', 'node'],
    packageManagers: ['bun', 'npm', 'pnpm', 'yarn'],
    testRunners: ['bun', 'vitest', 'jest', 'none'],
    description: 'Minimal starter with one request file'
  }
};
