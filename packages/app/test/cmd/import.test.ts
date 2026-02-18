import { describe, expect, test } from 'bun:test';
import type { ImportResult } from '@t-req/core/import';
import {
  curlImportBuilder,
  curlImportCommand,
  formatImportDiagnosticLine,
  type ImportCommandDependencies,
  importCommand,
  postmanImportBuilder,
  postmanImportCommand,
  runCurlImport,
  runPostmanImport
} from '../../src/cmd/import';
import { ValidationError } from '../../src/server/errors';
import { ImportApplyError } from '../../src/server/service/import-service';

function makeResult(params?: {
  name?: string;
  diagnostics?: ImportResult['diagnostics'];
  variables?: Record<string, unknown>;
}): ImportResult {
  const diagnostics = params?.diagnostics ?? [];
  return {
    name: params?.name ?? 'My Collection',
    files: [
      {
        relativePath: 'users/list.http',
        document: {
          requests: [{ method: 'GET', url: 'https://api.example.com/users' }]
        }
      }
    ],
    variables: params?.variables ?? {},
    diagnostics,
    stats: {
      requestCount: 1,
      fileCount: 1,
      diagnosticCount: diagnostics.length
    }
  };
}

function createDeps(overrides?: Partial<ImportCommandDependencies>): {
  deps: ImportCommandDependencies;
  stdout: string[];
  stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const deps: ImportCommandDependencies = {
    cwd: () => '/tmp',
    workspaceRoot: () => '/tmp/workspace',
    colorEnabled: () => false,
    readInput: async () => '{"info":{"name":"x"},"item":[]}',
    convertPostman: () => makeResult(),
    convertCurl: () => makeResult({ name: 'curl-import' }),
    createImportService: () => ({
      preview: async () => ({
        written: ['imports/users/list.http'],
        skipped: [],
        renamed: [],
        failed: [],
        variablesMerged: false
      }),
      apply: async () => ({
        written: ['imports/users/list.http'],
        skipped: [],
        renamed: [],
        failed: [],
        variablesMerged: false
      })
    }),
    stdout: (message: string) => {
      stdout.push(message);
    },
    stderr: (message: string) => {
      stderr.push(message);
    },
    ...overrides
  };

  return { deps, stdout, stderr };
}

describe('import command definition', () => {
  test('registers top-level import command and source subcommands', () => {
    expect(importCommand.command).toBe('import');
    expect(postmanImportCommand.command).toBe('postman <file>');
    expect(curlImportCommand.command).toBe('curl <command>');
  });

  test('postman builder has expected defaults', () => {
    expect(postmanImportBuilder.strategy.default).toBe('request-per-file');
    expect(postmanImportBuilder['on-conflict'].default).toBe('fail');
    expect(postmanImportBuilder['dry-run'].default).toBe(false);
    expect(postmanImportBuilder['merge-variables'].default).toBe(false);
    expect(postmanImportBuilder.force.default).toBe(false);
  });

  test('curl builder has expected defaults', () => {
    expect(curlImportBuilder['on-conflict'].default).toBe('fail');
    expect(curlImportBuilder['dry-run'].default).toBe(false);
    expect(curlImportBuilder['merge-variables'].default).toBe(false);
    expect(curlImportBuilder.force.default).toBe(false);
  });
});

describe('formatImportDiagnosticLine', () => {
  test('formats diagnostic lines without color', () => {
    const line = formatImportDiagnosticLine(
      {
        code: 'unsupported-auth',
        severity: 'warning',
        message: 'Auth ignored',
        sourcePath: 'Collection / Folder / Request'
      },
      false,
      0
    );
    expect(line).toContain('1. [warning]');
    expect(line).toContain('unsupported-auth');
    expect(line).toContain('Auth ignored');
    expect(line).toContain('(Collection / Folder / Request)');
  });
});

describe('runPostmanImport', () => {
  test('uses preview in dry-run mode and applies default output directory', async () => {
    let previewCalls = 0;
    let applyCalls = 0;
    let previewOptions: unknown;
    let convertOptions: unknown;
    const { deps, stdout } = createDeps({
      convertPostman: (_input, options) => {
        convertOptions = options;
        return makeResult({ name: 'My Collection' });
      },
      createImportService: () => ({
        preview: async (_result, options) => {
          previewCalls += 1;
          previewOptions = options;
          return {
            written: ['my-collection/users/list.http'],
            skipped: [],
            renamed: [],
            failed: [],
            variablesMerged: false
          };
        },
        apply: async () => {
          applyCalls += 1;
          return {
            written: [],
            skipped: [],
            renamed: [],
            failed: [],
            variablesMerged: false
          };
        }
      })
    });

    await runPostmanImport(
      {
        file: 'collection.json',
        dryRun: true,
        strategy: 'folder-per-file',
        reportDisabled: true
      },
      deps
    );

    expect(previewCalls).toBe(1);
    expect(applyCalls).toBe(0);
    expect(convertOptions).toEqual({
      fileStrategy: 'folder-per-file',
      reportDisabled: true
    });
    expect(previewOptions).toEqual({
      outputDir: './my-collection',
      onConflict: 'fail',
      mergeVariables: false,
      force: false
    });
    expect(stdout.some((line) => line.includes('Import preview complete.'))).toBe(true);
  });

  test('runs apply path and prints variable merge instructions', async () => {
    const { deps, stdout } = createDeps({
      createImportService: () => ({
        preview: async () => ({
          written: [],
          skipped: [],
          renamed: [],
          failed: [],
          variablesMerged: false
        }),
        apply: async () => ({
          written: ['custom/users/list.http'],
          skipped: [],
          renamed: [],
          failed: [],
          variablesMerged: false,
          variableMergeInstructions: 'Paste this into config'
        })
      })
    });

    await runPostmanImport(
      {
        file: 'collection.json',
        output: './custom'
      },
      deps
    );

    expect(stdout.some((line) => line.includes('Import apply complete.'))).toBe(true);
    expect(stdout.some((line) => line.includes('Variable merge instructions:'))).toBe(true);
    expect(stdout.some((line) => line.includes('Paste this into config'))).toBe(true);
  });

  test('rethrows ImportApplyError and emits partial failure details', async () => {
    const partialResult = {
      written: ['imports/a.http'],
      skipped: [],
      renamed: [],
      failed: [{ path: 'imports/b.http', error: 'EISDIR' }],
      variablesMerged: false
    };

    const { deps, stderr } = createDeps({
      createImportService: () => ({
        preview: async () => partialResult,
        apply: async () => {
          throw new ImportApplyError('partial failure', partialResult);
        }
      })
    });

    await expect(
      runPostmanImport(
        {
          file: 'collection.json'
        },
        deps
      )
    ).rejects.toBeInstanceOf(ImportApplyError);

    expect(stderr.some((line) => line.includes('Failed (1):'))).toBe(true);
    expect(stderr.some((line) => line.includes('imports/b.http: EISDIR'))).toBe(true);
  });

  test('propagates validation errors from service apply', async () => {
    const { deps } = createDeps({
      createImportService: () => ({
        preview: async () => ({
          written: [],
          skipped: [],
          renamed: [],
          failed: [],
          variablesMerged: false
        }),
        apply: async () => {
          throw new ValidationError('force=true required');
        }
      })
    });

    await expect(
      runPostmanImport(
        {
          file: 'collection.json'
        },
        deps
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('runCurlImport', () => {
  test('uses preview in dry-run mode and passes curl convert options', async () => {
    let previewCalls = 0;
    let applyCalls = 0;
    let convertOptions: unknown;
    const { deps, stdout } = createDeps({
      convertCurl: (_input, options) => {
        convertOptions = options;
        return makeResult({ name: 'curl-import' });
      },
      createImportService: () => ({
        preview: async () => {
          previewCalls += 1;
          return {
            written: ['curl-import/curl-request.http'],
            skipped: [],
            renamed: [],
            failed: [],
            variablesMerged: false
          };
        },
        apply: async () => {
          applyCalls += 1;
          return {
            written: [],
            skipped: [],
            renamed: [],
            failed: [],
            variablesMerged: false
          };
        }
      })
    });

    await runCurlImport(
      {
        command: 'curl https://api.example.com/users',
        dryRun: true,
        fileName: 'custom-curl',
        requestName: 'custom request'
      },
      deps
    );

    expect(previewCalls).toBe(1);
    expect(applyCalls).toBe(0);
    expect(convertOptions).toEqual({
      fileName: 'custom-curl',
      requestName: 'custom request'
    });
    expect(stdout.some((line) => line.includes('Import preview complete.'))).toBe(true);
  });
});
