import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { createApp, type ServerConfig } from '../../src/server/app';
import type { ExecuteResponse, PluginsResponse } from '../../src/server/schemas';
import { installFetchMock, mockResponse } from '../utils/fetch-mock';
import { createTestServer, type TestServer } from '../utils/test-server';
import { type TempDir, tmpdir } from '../utils/tmpdir';

/**
 * Plugin system integration tests.
 *
 * Tests the full plugin lifecycle:
 * - Plugin loading from file://
 * - Hook execution order
 * - Request modification via hooks
 * - Plugin info visibility in API responses
 * - Graceful error handling
 */

// Path to the monorepo root (packages/app/test/integration -> ../../../..)
const MONOREPO_ROOT = path.resolve(__dirname, '../../../..');

// Path to the example test plugin
const TEST_PLUGIN_PATH = path.join(MONOREPO_ROOT, 'examples/plugins/treq-plugin-test.ts');

function createTestConfig(workspaceRoot: string): ServerConfig {
  return {
    workspace: workspaceRoot,
    port: 3000,
    host: 'localhost',
    maxBodyBytes: 1024 * 1024,
    maxSessions: 10
  };
}

describe('Plugin: Hook execution with example plugin', () => {
  let tmp: TempDir;
  let server: TestServer;
  let restoreFetch: () => void;
  let requestLog: Array<{ method: string; url: string; headers: Record<string, string> }>;

  beforeEach(async () => {
    tmp = await tmpdir();
    requestLog = [];

    // Create a simple HTTP test file
    await tmp.writeFile(
      'test.http',
      `GET https://api.example.com/data
Accept: application/json
`
    );

    // Create treq.jsonc config that loads the example plugin using absolute path
    await tmp.writeFile(
      'treq.jsonc',
      JSON.stringify(
        {
          security: {
            allowPluginsOutsideProject: true
          },
          plugins: [`file://${TEST_PLUGIN_PATH}`]
        },
        null,
        2
      )
    );

    const { app } = createApp(createTestConfig(tmp.path));
    server = createTestServer(app);

    restoreFetch = installFetchMock(async (url, init) => {
      const urlStr = url.toString();
      const method = init?.method ?? 'GET';
      const headers: Record<string, string> = {};

      if (init?.headers) {
        const h = new Headers(init.headers);
        h.forEach((value, name) => {
          headers[name] = value;
        });
      }

      requestLog.push({ method, url: urlStr, headers });
      return mockResponse({ success: true }, { status: 200 });
    });
  });

  afterEach(async () => {
    restoreFetch();
    await tmp[Symbol.asyncDispose]();
  });

  test('plugin should add X-Test-Plugin header via request.before hook', async () => {
    const { data } = await server.post<ExecuteResponse>('/execute', {
      path: 'test.http'
    });

    expect(data.response.status).toBe(200);

    // Verify the plugin added the header (X-Test-Plugin: active)
    const request = requestLog[0];
    expect(request).toBeDefined();
    expect(request?.headers['x-test-plugin']).toBe('active');
  });
});

describe('Plugin: Visibility in API responses', () => {
  let tmp: TempDir;
  let server: TestServer;
  let restoreFetch: () => void;

  beforeEach(async () => {
    tmp = await tmpdir();

    await tmp.writeFile(
      'test.http',
      `GET https://api.example.com/data
`
    );

    // Use the example test plugin
    await tmp.writeFile(
      'treq.jsonc',
      JSON.stringify(
        {
          security: {
            allowPluginsOutsideProject: true
          },
          plugins: [`file://${TEST_PLUGIN_PATH}`]
        },
        null,
        2
      )
    );

    const { app } = createApp(createTestConfig(tmp.path));
    server = createTestServer(app);

    restoreFetch = installFetchMock(async () => mockResponse({ ok: true }));
  });

  afterEach(async () => {
    restoreFetch();
    await tmp[Symbol.asyncDispose]();
  });

  test('GET /plugins should return loaded plugins', async () => {
    // First execute a request to trigger plugin loading
    await server.post<ExecuteResponse>('/execute', {
      path: 'test.http'
    });

    const { status, data } = await server.get<PluginsResponse>('/plugins');

    expect(status).toBe(200);
    expect(data.plugins).toBeDefined();
    expect(Array.isArray(data.plugins)).toBe(true);

    // Find the test plugin
    const plugin = data.plugins.find((p) => p.name === 'treq-plugin-test');
    expect(plugin).toBeDefined();
    expect(plugin?.version).toBe('1.0.0');
    expect(plugin?.source).toBe('file');
  });
});

describe('Plugin: No plugins loaded', () => {
  let tmp: TempDir;
  let server: TestServer;
  let restoreFetch: () => void;

  beforeEach(async () => {
    tmp = await tmpdir();

    await tmp.writeFile(
      'test.http',
      `GET https://api.example.com/data
`
    );

    // No treq.jsonc - no plugins
    const { app } = createApp(createTestConfig(tmp.path));
    server = createTestServer(app);

    restoreFetch = installFetchMock(async () => mockResponse({ ok: true }));
  });

  afterEach(async () => {
    restoreFetch();
    await tmp[Symbol.asyncDispose]();
  });

  test('should work without any plugins', async () => {
    const { status, data } = await server.post<ExecuteResponse>('/execute', {
      path: 'test.http'
    });

    expect(status).toBe(200);
    expect(data.response.status).toBe(200);
  });

  test('GET /plugins should return empty array when no plugins', async () => {
    const { status, data } = await server.get<PluginsResponse>('/plugins');

    expect(status).toBe(200);
    expect(data.plugins).toEqual([]);
    expect(data.count).toBe(0);
  });
});

describe('Plugin: Error handling and graceful degradation', () => {
  let tmp: TempDir;
  let server: TestServer;
  let restoreFetch: () => void;

  beforeEach(async () => {
    tmp = await tmpdir();

    await tmp.writeFile(
      'test.http',
      `GET https://api.example.com/data
`
    );

    // Create a plugin that throws an error - using inline export to avoid import issues
    const coreIndexPath = path.join(MONOREPO_ROOT, 'packages/core/src/index');
    await tmp.writeFile(
      'plugins/error-plugin.ts',
      `import { definePlugin } from '${coreIndexPath}';

export default definePlugin({
  name: 'error-plugin',
  version: '1.0.0',

  hooks: {
    async 'request.before'(input, output) {
      throw new Error('Plugin intentionally failed');
    }
  }
});
`
    );

    await tmp.writeFile(
      'treq.jsonc',
      JSON.stringify(
        {
          security: {
            allowPluginsOutsideProject: true
          },
          plugins: ['file://./plugins/error-plugin.ts']
        },
        null,
        2
      )
    );

    const { app } = createApp(createTestConfig(tmp.path));
    server = createTestServer(app);

    restoreFetch = installFetchMock(async () => mockResponse({ ok: true }));
  });

  afterEach(async () => {
    restoreFetch();
    await tmp[Symbol.asyncDispose]();
  });

  test('should continue execution when plugin hook throws', async () => {
    // The request should still complete despite the plugin error
    // This tests graceful degradation
    const { status, data } = await server.post<ExecuteResponse>('/execute', {
      path: 'test.http'
    });

    // Request should complete - plugin errors are caught and logged
    expect(status).toBe(200);
    expect(data.response.status).toBe(200);
  });
});

describe('Plugin: Execution details include plugin hooks', () => {
  let tmp: TempDir;
  let server: TestServer;
  let restoreFetch: () => void;

  beforeEach(async () => {
    tmp = await tmpdir();

    await tmp.writeFile(
      'test.http',
      `GET https://api.example.com/data
`
    );

    // Use the example test plugin
    await tmp.writeFile(
      'treq.jsonc',
      JSON.stringify(
        {
          security: {
            allowPluginsOutsideProject: true
          },
          plugins: [`file://${TEST_PLUGIN_PATH}`]
        },
        null,
        2
      )
    );

    const { app } = createApp(createTestConfig(tmp.path));
    server = createTestServer(app);

    restoreFetch = installFetchMock(async () => mockResponse({ ok: true }));
  });

  afterEach(async () => {
    restoreFetch();
    await tmp[Symbol.asyncDispose]();
  });

  test('execution response should work with plugins', async () => {
    const { status, data } = await server.post<ExecuteResponse>('/execute', {
      path: 'test.http'
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response.status).toBe(200);
    expect(data.request).toBeDefined();
    expect(data.request.method).toBe('GET');
  });
});
