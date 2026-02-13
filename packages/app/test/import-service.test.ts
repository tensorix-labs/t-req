import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ImportResult } from '@t-req/core/import';
import { PathOutsideWorkspaceError, ValidationError } from '../src/server/errors';
import {
  type ApplyImportOptions,
  createImportService,
  ImportApplyError
} from '../src/server/service/import-service';
import type { ServiceContext } from '../src/server/service/types';

interface TempDir {
  path: string;
  join(...parts: string[]): string;
  writeFile(relativePath: string, content: string): Promise<void>;
  mkdir(relativePath: string): Promise<void>;
  dispose(): Promise<void>;
}

async function createTempDir(prefix = 'treq-import-service-'): Promise<TempDir> {
  const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return {
    path: dirPath,
    join(...parts: string[]) {
      return path.join(dirPath, ...parts);
    },
    async writeFile(relativePath: string, content: string): Promise<void> {
      const fullPath = path.join(dirPath, relativePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
    },
    async mkdir(relativePath: string): Promise<void> {
      await fs.mkdir(path.join(dirPath, relativePath), { recursive: true });
    },
    async dispose(): Promise<void> {
      await fs.rm(dirPath, { recursive: true, force: true });
    }
  };
}

function createContext(workspaceRoot: string): ServiceContext {
  return {
    workspaceRoot,
    maxBodyBytes: 1024 * 1024,
    maxSessions: 10,
    sessionTtlMs: 30 * 60 * 1000,
    now: Date.now
  };
}

function makeImportResult(params?: {
  files?: ImportResult['files'];
  variables?: Record<string, unknown>;
  diagnostics?: ImportResult['diagnostics'];
}): ImportResult {
  const files = params?.files ?? [
    {
      relativePath: 'request.http',
      document: {
        requests: [{ method: 'GET', url: 'https://api.example.com/users' }]
      }
    }
  ];
  const diagnostics = params?.diagnostics ?? [];

  return {
    name: 'test-collection',
    files,
    variables: params?.variables ?? {},
    diagnostics,
    stats: {
      requestCount: files.reduce((sum, file) => sum + file.document.requests.length, 0),
      fileCount: files.length,
      diagnosticCount: diagnostics.length
    }
  };
}

function makeOptions(overrides?: Partial<ApplyImportOptions>): ApplyImportOptions {
  return {
    outputDir: 'imports',
    onConflict: 'fail',
    mergeVariables: false,
    force: false,
    ...overrides
  };
}

async function fileText(tmp: TempDir, relativePath: string): Promise<string> {
  return await Bun.file(tmp.join(relativePath)).text();
}

async function fileExists(tmp: TempDir, relativePath: string): Promise<boolean> {
  return await Bun.file(tmp.join(relativePath)).exists();
}

describe('import-service', () => {
  let tmp: TempDir;

  beforeEach(async () => {
    tmp = await createTempDir();
  });

  afterEach(async () => {
    await tmp.dispose();
  });

  test('conflict policy fail throws when target exists', async () => {
    await tmp.writeFile('imports/request.http', 'GET https://old.example.com');

    const service = createImportService(createContext(tmp.path));
    const result = makeImportResult();

    await expect(service.apply(result, makeOptions({ onConflict: 'fail' }))).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  test('conflict policy skip returns skipped without modifying existing file', async () => {
    await tmp.writeFile('imports/request.http', 'GET https://old.example.com');

    const service = createImportService(createContext(tmp.path));
    const result = makeImportResult();

    const applyResult = await service.apply(result, makeOptions({ onConflict: 'skip' }));
    expect(applyResult.written).toEqual([]);
    expect(applyResult.skipped).toEqual(['imports/request.http']);
    expect(await fileText(tmp, 'imports/request.http')).toBe('GET https://old.example.com');
  });

  test('conflict policy overwrite replaces existing file', async () => {
    await tmp.writeFile('imports/request.http', 'GET https://old.example.com');

    const service = createImportService(createContext(tmp.path));
    const result = makeImportResult({
      files: [
        {
          relativePath: 'request.http',
          document: {
            requests: [{ method: 'POST', url: 'https://api.example.com/new' }]
          }
        }
      ]
    });

    const applyResult = await service.apply(result, makeOptions({ onConflict: 'overwrite' }));
    expect(applyResult.written).toEqual(['imports/request.http']);
    expect(await fileText(tmp, 'imports/request.http')).toContain(
      'POST https://api.example.com/new'
    );
  });

  test('conflict policy rename appends numeric suffix', async () => {
    await tmp.writeFile('imports/request.http', 'GET https://old.example.com');

    const service = createImportService(createContext(tmp.path));
    const result = makeImportResult();

    const applyResult = await service.apply(result, makeOptions({ onConflict: 'rename' }));
    expect(applyResult.written).toEqual(['imports/request-2.http']);
    expect(applyResult.renamed).toEqual([
      { original: 'imports/request.http', actual: 'imports/request-2.http' }
    ]);
    expect(await fileExists(tmp, 'imports/request-2.http')).toBe(true);
    expect(await fileText(tmp, 'imports/request.http')).toBe('GET https://old.example.com');
  });

  test('rejects output paths outside workspace', async () => {
    const service = createImportService(createContext(tmp.path));
    const result = makeImportResult();

    await expect(
      service.preview(result, makeOptions({ outputDir: '../outside' }))
    ).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
    await expect(
      service.apply(result, makeOptions({ outputDir: '../outside' }))
    ).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
  });

  test('preview matches apply output without writing files', async () => {
    await tmp.writeFile('imports/request.http', 'GET https://old.example.com');

    const service = createImportService(createContext(tmp.path));
    const result = makeImportResult({
      files: [
        {
          relativePath: 'request.http',
          document: { requests: [{ method: 'GET', url: 'https://api.example.com/request' }] }
        },
        {
          relativePath: 'new.http',
          document: { requests: [{ method: 'GET', url: 'https://api.example.com/new' }] }
        }
      ]
    });

    const options = makeOptions({ onConflict: 'skip' });
    const preview = await service.preview(result, options);
    expect(preview.written).toEqual(['imports/new.http']);
    expect(preview.skipped).toEqual(['imports/request.http']);
    expect(await fileExists(tmp, 'imports/new.http')).toBe(false);

    const apply = await service.apply(result, options);
    expect(apply.written).toEqual(preview.written);
    expect(apply.skipped).toEqual(preview.skipped);
    expect(apply.renamed).toEqual(preview.renamed);
    expect(await fileExists(tmp, 'imports/new.http')).toBe(true);
  });

  test('blocks apply on error diagnostics unless forced', async () => {
    const service = createImportService(createContext(tmp.path));
    const result = makeImportResult({
      diagnostics: [
        {
          code: 'invalid-source',
          severity: 'error',
          message: 'Malformed collection'
        }
      ]
    });

    await expect(service.apply(result, makeOptions())).rejects.toBeInstanceOf(ValidationError);

    const forced = await service.apply(result, makeOptions({ force: true }));
    expect(forced.written).toEqual(['imports/request.http']);
    expect(await fileExists(tmp, 'imports/request.http')).toBe(true);
  });

  test('merges variables into JSON config while preserving existing keys', async () => {
    await tmp.writeFile(
      'treq.json',
      JSON.stringify(
        {
          variables: { existing: 'keep', override: 'old' },
          defaults: { timeout: 1000 }
        },
        null,
        2
      )
    );

    const service = createImportService(createContext(tmp.path));
    const result = makeImportResult({
      files: [],
      variables: { override: 'new', added: 2 }
    });

    const applyResult = await service.apply(result, makeOptions({ mergeVariables: true }));
    expect(applyResult.variablesMerged).toBe(true);

    const config = JSON.parse(await fileText(tmp, 'treq.json')) as {
      variables: Record<string, unknown>;
      defaults: Record<string, unknown>;
    };

    expect(config.variables).toEqual({
      existing: 'keep',
      override: 'old',
      added: 2
    });
    expect(config.defaults).toEqual({ timeout: 1000 });
  });

  test('returns manual merge instructions for TS config and does not rewrite it', async () => {
    const tsConfig = 'export default { variables: { existing: "value" } };\n';
    await tmp.writeFile('treq.config.ts', tsConfig);

    const service = createImportService(createContext(tmp.path));
    const result = makeImportResult({
      files: [],
      variables: { token: 'abc123' }
    });

    const applyResult = await service.apply(result, makeOptions({ mergeVariables: true }));
    expect(applyResult.variablesMerged).toBe(false);
    expect(applyResult.variableMergeInstructions).toContain('treq.config.ts');
    expect(applyResult.variableMergeInstructions).toContain('"token": "abc123"');
    expect(await fileText(tmp, 'treq.config.ts')).toBe(tsConfig);
  });

  test('mergeVariables defaults to false and does not create config file', async () => {
    const service = createImportService(createContext(tmp.path));
    const result = makeImportResult({
      files: [],
      variables: { token: 'abc123' }
    });

    const applyResult = await service.apply(result, makeOptions({ mergeVariables: undefined }));
    expect(applyResult.variablesMerged).toBe(false);
    expect(await fileExists(tmp, 'treq.jsonc')).toBe(false);
  });

  test('supports writing into nested output directories that do not yet exist', async () => {
    const service = createImportService(createContext(tmp.path));
    const result = makeImportResult({
      files: [
        {
          relativePath: 'users/list.http',
          document: { requests: [{ method: 'GET', url: 'https://api.example.com/users' }] }
        }
      ]
    });

    const applyResult = await service.apply(result, makeOptions({ outputDir: 'imports/deep/new' }));
    expect(applyResult.written).toEqual(['imports/deep/new/users/list.http']);
    expect(await fileExists(tmp, 'imports/deep/new/users/list.http')).toBe(true);
  });

  test('throws ImportApplyError with partial result when commit has failures', async () => {
    const service = createImportService(createContext(tmp.path));
    const result = makeImportResult({
      files: [
        {
          relativePath: 'a.http',
          document: { requests: [{ method: 'GET', url: 'https://api.example.com/a' }] }
        },
        {
          relativePath: 'b.http',
          document: { requests: [{ method: 'GET', url: 'https://api.example.com/b' }] }
        }
      ]
    });

    // Make b.http a directory to force rename failure during commit.
    await tmp.mkdir('imports/b.http');

    let caught: unknown;
    try {
      await service.apply(result, makeOptions({ onConflict: 'overwrite' }));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ImportApplyError);
    const partial = (caught as ImportApplyError).partialResult;
    expect(partial.written).toContain('imports/a.http');
    expect(partial.failed.some((entry) => entry.path === 'imports/b.http')).toBe(true);
  });
});
