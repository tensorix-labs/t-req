import * as p from '@clack/prompts';
import type { CommandModule } from 'yargs';
import {
  createBasicProject,
  generateBasicConfig,
  generateBasicReadme,
  generateBasicTestFile,
  generateCreatePostRequest,
  generateGetUserRequest,
  generateListUsersRequest
} from './basic';
import {
  createEmptyProject,
  generateEmptyConfig,
  generateEmptyReadme,
  generateEmptyTestFile,
  generateHelloRequest
} from './empty';
import {
  generateClientFile,
  generateGitignore,
  generatePackageJson,
  generateRunScript,
  generateTsconfig,
  getDefaultTestRunner,
  getInstallCommand,
  resolve,
  validateProjectName
} from './shared';
import type { InitOptions, PackageManager, ProjectConfig, Runtime, TemplateType } from './types';
import { TEMPLATE_CAPABILITIES } from './types';

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
    template: {
      alias: 't',
      type: 'string',
      choices: ['empty', 'basic'] as const,
      describe: 'Template to use'
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
    switch (config.template) {
      case 'empty':
        await createEmptyProject(projectPath, config);
        break;
      case 'basic':
        await createBasicProject(projectPath, config);
        break;
    }
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
    const validationError = validateProjectName(name);
    if (validationError) {
      p.cancel(validationError);
      process.exit(1);
    }
    const runtime: Runtime = 'bun';
    const template: TemplateType = argv.template ?? 'basic';
    const testRunner = argv['no-tests']
      ? ('none' as const)
      : (argv['test-runner'] ?? getDefaultTestRunner(runtime));
    return {
      name,
      template,
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

  // Template selection — show all templates compatible with the chosen runtime
  const selectedRuntime = runtime as Runtime;
  const templateOptions = (
    Object.entries(TEMPLATE_CAPABILITIES) as [
      TemplateType,
      (typeof TEMPLATE_CAPABILITIES)[TemplateType]
    ][]
  )
    .filter(([, caps]) => caps.runtimes.includes(selectedRuntime))
    .map(([key, caps]) => ({ value: key, label: key, hint: caps.description }));

  let template: TemplateType;
  if (argv.template) {
    template = argv.template;
  } else {
    const templateChoice = await p.select({
      message: 'Select template',
      options: templateOptions,
      initialValue: 'basic' as TemplateType
    });

    if (p.isCancel(templateChoice)) return templateChoice;
    template = templateChoice as TemplateType;
  }

  const caps = TEMPLATE_CAPABILITIES[template];

  // Package manager — only prompt if template supports multiple
  let packageManager: PackageManager;
  if (caps.packageManagers.length === 1) {
    packageManager = caps.packageManagers[0] as PackageManager;
  } else {
    const pmChoice = await p.select({
      message: 'Select package manager',
      options: [
        { value: 'bun', label: 'bun' },
        { value: 'npm', label: 'npm' },
        { value: 'pnpm', label: 'pnpm' },
        { value: 'yarn', label: 'yarn' }
      ],
      initialValue: 'bun'
    });

    if (p.isCancel(pmChoice)) return pmChoice;
    packageManager = pmChoice as PackageManager;
  }

  const testRunner = argv['no-tests']
    ? ('none' as const)
    : (argv['test-runner'] ?? getDefaultTestRunner(selectedRuntime));

  return {
    name: name as string,
    template,
    runtime: selectedRuntime,
    packageManager,
    testRunner
  };
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

// Re-export everything tests need
export {
  generateBasicConfig as generateConfig,
  generateBasicReadme as generateReadme,
  generateBasicTestFile as generateTestFile,
  generateCreatePostRequest,
  generateGetUserRequest,
  generateListUsersRequest,
  generateClientFile,
  generateGitignore,
  generatePackageJson,
  generateRunScript,
  generateTsconfig,
  getInstallCommand,
  validateProjectName,
  // Empty template exports
  generateEmptyConfig,
  generateEmptyReadme,
  generateEmptyTestFile,
  generateHelloRequest,
  // Types
  TEMPLATE_CAPABILITIES
};
export type {
  InitOptions,
  PackageManager,
  ProjectConfig,
  Runtime,
  TemplateType,
  TestRunner
} from './types';
