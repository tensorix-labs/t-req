import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createApp, type ServerConfig } from '../../src/server/app';
import { clearAllScriptTokens, generateScriptToken } from '../../src/server/auth';
import type { ErrorResponse } from '../../src/server/schemas';
import { createTestServer, type TestServer } from '../utils/test-server';
import { type TempDir, tmpdir } from '../utils/tmpdir';

const POSTMAN_SCHEMA_URL = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
const SERVER_TOKEN = 'test-server-token-secret';

function createTestConfig(workspaceRoot: string, overrides?: Partial<ServerConfig>): ServerConfig {
  return {
    workspace: workspaceRoot,
    port: 3000,
    host: 'localhost',
    maxBodyBytes: 1024 * 1024,
    maxSessions: 10,
    ...overrides
  };
}

function makePostmanCollectionJson(requestNames: string[]): string {
  return JSON.stringify({
    info: {
      name: 'Sample Import Collection',
      schema: POSTMAN_SCHEMA_URL
    },
    item: requestNames.map((name) => ({
      name,
      request: {
        method: 'GET',
        url: `https://api.example.com/${name}`
      }
    }))
  });
}

function makeCurlCommand(): string {
  return `curl -X POST https://api.example.com/users -H 'Authorization: Bearer abc' -d '{"name":"Ada"}'`;
}

describe('import endpoints', () => {
  let tmp: TempDir;
  let server: TestServer;
  let dispose: () => void;

  beforeEach(async () => {
    tmp = await tmpdir();
    const appResult = createApp(createTestConfig(tmp.path));
    server = createTestServer(appResult.app);
    dispose = appResult.dispose;
  });

  afterEach(async () => {
    clearAllScriptTokens();
    dispose();
    await tmp[Symbol.asyncDispose]();
  });

  test('POST /import/postman/preview returns 200 with response shape', async () => {
    const { status, data } = await server.post<{
      result: {
        written: string[];
        skipped: string[];
        renamed: Array<{ original: string; actual: string }>;
        failed: Array<{ path: string; error: string }>;
        variablesMerged: boolean;
      };
      diagnostics: Array<{ severity: 'error' | 'warning' | 'info' }>;
      stats: { requestCount: number; fileCount: number; diagnosticCount: number };
    }>('/import/postman/preview', {
      input: makePostmanCollectionJson(['get-users']),
      planOptions: { outputDir: 'imported', onConflict: 'fail' }
    });

    expect(status).toBe(200);
    expect(data.result.written).toEqual(['imported/get-users.http']);
    expect(data.result.failed).toEqual([]);
    expect(data.diagnostics).toHaveLength(0);
    expect(data.stats).toMatchObject({
      requestCount: 1,
      fileCount: 1,
      diagnosticCount: 0
    });
  });

  test('POST /import/curl/preview returns 200 with response shape', async () => {
    const { status, data } = await server.post<{
      result: {
        written: string[];
        skipped: string[];
        renamed: Array<{ original: string; actual: string }>;
        failed: Array<{ path: string; error: string }>;
        variablesMerged: boolean;
      };
      diagnostics: Array<{ severity: 'error' | 'warning' | 'info' }>;
      stats: { requestCount: number; fileCount: number; diagnosticCount: number };
    }>('/import/curl/preview', {
      input: makeCurlCommand(),
      planOptions: { outputDir: 'imported', onConflict: 'fail' }
    });

    expect(status).toBe(200);
    expect(data.result.written).toEqual(['imported/curl-request.http']);
    expect(data.result.failed).toEqual([]);
    expect(data.stats).toMatchObject({
      requestCount: 1,
      fileCount: 1
    });
  });

  test('POST /import/{source}/preview returns 400 for unknown source', async () => {
    const { status, data } = await server.post<ErrorResponse>('/import/unknown/preview', {
      input: makePostmanCollectionJson(['get-users']),
      planOptions: { outputDir: 'imported', onConflict: 'fail' }
    });

    expect(status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
    expect(data.error.message).toContain('Unknown import source');
  });

  test('POST /import/postman/preview returns 400 for invalid convertOptions', async () => {
    const { status, data } = await server.post<ErrorResponse>('/import/postman/preview', {
      input: makePostmanCollectionJson(['get-users']),
      convertOptions: { fileStrategy: 'not-a-strategy' },
      planOptions: { outputDir: 'imported', onConflict: 'fail' }
    });

    expect(status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
    expect(data.error.message).toContain('Invalid convertOptions');
  });

  test('POST /import/curl/preview returns 400 for invalid convertOptions', async () => {
    const { status, data } = await server.post<ErrorResponse>('/import/curl/preview', {
      input: makeCurlCommand(),
      convertOptions: { fileName: '' },
      planOptions: { outputDir: 'imported', onConflict: 'fail' }
    });

    expect(status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
    expect(data.error.message).toContain('Invalid convertOptions');
  });

  test('POST /import/postman/apply returns 422 when diagnostics contain errors and force=false', async () => {
    const { status, data } = await server.post<{
      diagnostics: Array<{ severity: 'error' | 'warning' | 'info'; code: string }>;
      stats: { requestCount: number; fileCount: number; diagnosticCount: number };
    }>('/import/postman/apply', {
      input: '{',
      applyOptions: {
        outputDir: 'imported',
        onConflict: 'fail',
        mergeVariables: false,
        force: false
      }
    });

    expect(status).toBe(422);
    expect(data.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(true);
    expect(data.stats.diagnosticCount).toBe(data.diagnostics.length);
  });

  test('POST /import/postman/apply returns 207 for partial commit failures', async () => {
    await tmp.mkdir('imported/a.http');

    const { status, data } = await server.post<{
      partialResult: {
        written: string[];
        failed: Array<{ path: string; error: string }>;
      };
    }>('/import/postman/apply', {
      input: makePostmanCollectionJson(['a', 'b']),
      applyOptions: {
        outputDir: 'imported',
        onConflict: 'overwrite',
        mergeVariables: false,
        force: false
      }
    });

    expect(status).toBe(207);
    expect(data.partialResult.failed.length).toBeGreaterThan(0);
    expect(data.partialResult.written).toContain('imported/b.http');
  });
});

describe('import endpoints with script token auth', () => {
  let tmp: TempDir;
  let server: TestServer;
  let dispose: () => void;

  beforeEach(async () => {
    tmp = await tmpdir();
    const appResult = createApp(createTestConfig(tmp.path, { token: SERVER_TOKEN }));
    server = createTestServer(appResult.app);
    dispose = appResult.dispose;
  });

  afterEach(async () => {
    clearAllScriptTokens();
    dispose();
    await tmp[Symbol.asyncDispose]();
  });

  test('script tokens are blocked on preview and apply endpoints (403)', async () => {
    const { token } = generateScriptToken(SERVER_TOKEN, 'flow-1', 'session-1');
    const headers = { Authorization: `Bearer ${token}` };
    const body = {
      input: makePostmanCollectionJson(['get-users']),
      planOptions: { outputDir: 'imported', onConflict: 'fail' },
      applyOptions: {
        outputDir: 'imported',
        onConflict: 'fail',
        mergeVariables: false,
        force: false
      }
    };

    const previewResponse = (await server.request('/import/postman/preview', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: body.input,
        planOptions: body.planOptions
      })
    })) as { status: number };

    const applyResponse = (await server.request('/import/postman/apply', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: body.input,
        applyOptions: body.applyOptions
      })
    })) as { status: number };

    expect(previewResponse.status).toBe(403);
    expect(applyResponse.status).toBe(403);
  });
});
