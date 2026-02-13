import type { ImportDiagnostic, ImportResult } from '@t-req/core/import';
import { convertPostmanCollection, type PostmanConvertOptions, slugify } from '@t-req/core/import';
import type { CommandModule } from 'yargs';
import { ValidationError } from '../server/errors';
import {
  type ApplyImportOptions,
  type ApplyImportResult,
  type ConflictPolicy,
  createImportService,
  ImportApplyError,
  type ImportService
} from '../server/service/import-service';
import type { ServiceContext } from '../server/service/types';
import { DEFAULT_SESSION_TTL_MS } from '../server/service/types';
import { ANSI, isAbsolute, resolve, resolveWorkspaceRoot, useColor } from '../utils';

export interface PostmanImportOptions {
  file: string;
  output?: string;
  strategy?: 'request-per-file' | 'folder-per-file';
  reportDisabled?: boolean;
  dryRun?: boolean;
  onConflict?: ConflictPolicy;
  mergeVariables?: boolean;
  force?: boolean;
}

export interface ImportCommandDependencies {
  cwd(): string;
  workspaceRoot(): string;
  colorEnabled(): boolean;
  readInput(path: string): Promise<string>;
  convert(input: string, options?: PostmanConvertOptions): ImportResult;
  createImportService(context: ServiceContext): ImportService;
  stdout(message: string): void;
  stderr(message: string): void;
}

function buildServiceContext(workspaceRoot: string): ServiceContext {
  return {
    workspaceRoot,
    maxBodyBytes: 10 * 1024 * 1024,
    maxSessions: 100,
    sessionTtlMs: DEFAULT_SESSION_TTL_MS,
    now: Date.now
  };
}

export function createDefaultImportCommandDependencies(): ImportCommandDependencies {
  return {
    cwd: () => process.cwd(),
    workspaceRoot: () => resolveWorkspaceRoot(),
    colorEnabled: useColor,
    readInput: async (inputPath: string) => {
      const file = Bun.file(inputPath);
      if (!(await file.exists())) {
        throw new ValidationError(`Input file not found: ${inputPath}`);
      }
      return await file.text();
    },
    convert: convertPostmanCollection,
    createImportService,
    stdout: (message: string) => console.log(message),
    stderr: (message: string) => console.error(message)
  };
}

export function formatImportDiagnosticLine(
  diagnostic: ImportDiagnostic,
  color: boolean,
  index: number
): string {
  const severity =
    diagnostic.severity === 'error'
      ? color
        ? `${ANSI.red}error${ANSI.reset}`
        : 'error'
      : diagnostic.severity === 'warning'
        ? color
          ? `${ANSI.yellow}warning${ANSI.reset}`
          : 'warning'
        : color
          ? `${ANSI.dim}info${ANSI.reset}`
          : 'info';

  const source = diagnostic.sourcePath ? ` (${diagnostic.sourcePath})` : '';
  return `${index + 1}. [${severity}] ${diagnostic.code}: ${diagnostic.message}${source}`;
}

function printDiagnostics(
  diagnostics: ImportDiagnostic[],
  deps: ImportCommandDependencies,
  color: boolean
): void {
  if (diagnostics.length === 0) {
    return;
  }

  deps.stdout(`Diagnostics (${diagnostics.length}):`);
  for (const [index, diagnostic] of diagnostics.entries()) {
    const line = formatImportDiagnosticLine(diagnostic, color, index);
    if (diagnostic.severity === 'error') {
      deps.stderr(line);
    } else {
      deps.stdout(line);
    }
  }
}

function formatDefaultOutputDir(collectionName: string): string {
  return `./${slugify(collectionName)}`;
}

function printPathList(
  heading: string,
  paths: string[],
  deps: ImportCommandDependencies,
  writer: 'stdout' | 'stderr' = 'stdout'
): void {
  if (paths.length === 0) {
    return;
  }
  deps[writer](`${heading} (${paths.length}):`);
  for (const path of paths) {
    deps[writer](`- ${path}`);
  }
}

function printRenamed(
  renamed: ApplyImportResult['renamed'],
  deps: ImportCommandDependencies,
  writer: 'stdout' | 'stderr' = 'stdout'
): void {
  if (renamed.length === 0) {
    return;
  }
  deps[writer](`Renamed (${renamed.length}):`);
  for (const entry of renamed) {
    deps[writer](`- ${entry.original} -> ${entry.actual}`);
  }
}

function printSummary(
  summary: ApplyImportResult,
  outputDir: string,
  deps: ImportCommandDependencies,
  mode: 'preview' | 'apply'
): void {
  deps.stdout(mode === 'preview' ? 'Import preview complete.' : 'Import apply complete.');
  deps.stdout(`Output directory: ${outputDir}`);

  if (mode === 'preview') {
    printPathList('Would write', summary.written, deps);
  } else {
    printPathList('Written', summary.written, deps);
  }
  printPathList('Skipped', summary.skipped, deps);
  printRenamed(summary.renamed, deps);

  if (summary.failed.length > 0) {
    deps.stderr(`Failed (${summary.failed.length}):`);
    for (const failure of summary.failed) {
      deps.stderr(`- ${failure.path}: ${failure.error}`);
    }
  }

  if (summary.variablesMerged) {
    deps.stdout('Variables merged into config.');
  }
  if (summary.variableMergeInstructions) {
    deps.stdout('Variable merge instructions:');
    deps.stdout(summary.variableMergeInstructions);
  }
}

function buildApplyOptions(argv: PostmanImportOptions, outputDir: string): ApplyImportOptions {
  return {
    outputDir,
    onConflict: argv.onConflict ?? 'fail',
    mergeVariables: argv.mergeVariables ?? false,
    force: argv.force ?? false
  };
}

export async function runPostmanImport(
  argv: PostmanImportOptions,
  deps: ImportCommandDependencies = createDefaultImportCommandDependencies()
): Promise<void> {
  const inputPath = isAbsolute(argv.file) ? argv.file : resolve(deps.cwd(), argv.file);
  const input = await deps.readInput(inputPath);

  const result = deps.convert(input, {
    fileStrategy: argv.strategy,
    reportDisabled: argv.reportDisabled
  });

  const color = deps.colorEnabled();
  printDiagnostics(result.diagnostics, deps, color);

  const outputDir = argv.output ?? formatDefaultOutputDir(result.name);
  const applyOptions = buildApplyOptions(argv, outputDir);
  const workspaceRoot = deps.workspaceRoot();
  const service = deps.createImportService(buildServiceContext(workspaceRoot));

  if (argv.dryRun) {
    const previewResult = await service.preview(result, applyOptions);
    printSummary(previewResult, outputDir, deps, 'preview');
    return;
  }

  try {
    const applyResult = await service.apply(result, applyOptions);
    printSummary(applyResult, outputDir, deps, 'apply');
  } catch (error) {
    if (error instanceof ImportApplyError) {
      printSummary(error.partialResult, outputDir, deps, 'apply');
    }
    throw error;
  }
}

async function handlePostmanImport(argv: PostmanImportOptions): Promise<void> {
  const deps = createDefaultImportCommandDependencies();
  try {
    await runPostmanImport(argv, deps);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.stderr(`Import failed: ${message}`);
    if (error instanceof ValidationError && message.includes('force=true')) {
      deps.stderr('Tip: rerun with --force to proceed despite error diagnostics.');
    }
    process.exit(1);
  }
}

export const postmanImportBuilder = {
  file: {
    type: 'string' as const,
    describe: 'Path to Postman collection JSON file',
    demandOption: true
  },
  output: {
    type: 'string' as const,
    alias: 'o',
    describe: 'Output directory (default: ./<collection-name>)'
  },
  strategy: {
    type: 'string' as const,
    choices: ['request-per-file', 'folder-per-file'] as const,
    default: 'request-per-file' as const,
    describe: 'File organization strategy'
  },
  'report-disabled': {
    type: 'boolean' as const,
    default: false,
    describe: 'Emit diagnostics for disabled Postman items'
  },
  'dry-run': {
    type: 'boolean' as const,
    default: false,
    describe: 'Preview the import without writing files'
  },
  'on-conflict': {
    type: 'string' as const,
    choices: ['fail', 'skip', 'overwrite', 'rename'] as const,
    default: 'fail' as const,
    describe: 'How to handle existing files'
  },
  'merge-variables': {
    type: 'boolean' as const,
    default: false,
    describe: 'Merge collection variables into t-req config'
  },
  force: {
    type: 'boolean' as const,
    default: false,
    describe: 'Proceed even when converter emitted error diagnostics'
  }
};

export const postmanImportCommand: CommandModule<object, PostmanImportOptions> = {
  command: 'postman <file>',
  describe: 'Import requests from a Postman collection',
  builder: postmanImportBuilder,
  handler: async (argv) => {
    await handlePostmanImport(argv);
  }
};

export const importCommand: CommandModule = {
  command: 'import',
  describe: 'Import requests from external formats',
  builder: (yargs) =>
    yargs.command(postmanImportCommand).demandCommand(1, 'Specify an import source: postman'),
  handler: () => {}
};
