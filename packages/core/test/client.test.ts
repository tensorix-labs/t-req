import { describe, expect, test } from 'bun:test';
import { createClient } from '../src/client.ts';
import { createCookieJar } from '../src/cookies.ts';
import { getServerMetadata } from '../src/server-metadata.ts';
import { installFetchMock } from './utils/fetch-mock.ts';

const FIXTURES = './test/fixtures';

describe('createClient', () => {
  test('creates client with default config', () => {
    const client = createClient();
    expect(client).toBeDefined();
    expect(client.run).toBeDefined();
    expect(client.setVariables).toBeDefined();
    expect(client.setVariable).toBeDefined();
    expect(client.getVariables).toBeDefined();
    expect(client.close).toBeDefined();
    expect(client[Symbol.asyncDispose]).toBeDefined();
  });

  test('getVariables returns copy of variables', () => {
    const client = createClient({
      variables: { key: 'value' }
    });

    const vars = client.getVariables();
    expect(vars.key).toBe('value');

    vars.key = 'modified';
    expect(client.getVariables().key).toBe('value');
  });

  test('setVariable adds new variable', () => {
    const client = createClient();
    client.setVariable('newKey', 'newValue');
    expect(client.getVariables().newKey).toBe('newValue');
  });

  test('setVariable updates existing variable', () => {
    const client = createClient({
      variables: { key: 'original' }
    });

    client.setVariable('key', 'updated');
    expect(client.getVariables().key).toBe('updated');
  });

  test('setVariables merges multiple variables', () => {
    const client = createClient({
      variables: { a: '1', b: '2' }
    });

    client.setVariables({ b: 'updated', c: '3' });

    const vars = client.getVariables();
    expect(vars.a).toBe('1');
    expect(vars.b).toBe('updated');
    expect(vars.c).toBe('3');
  });

  test('run throws on file with no valid requests', async () => {
    const tempPath = `${FIXTURES}/empty.http`;
    await Bun.write(tempPath, '# just comments\n');

    try {
      const client = createClient();
      await expect(client.run(tempPath)).rejects.toThrow('No valid requests found');
    } finally {
      await Bun.$`rm -f ${tempPath}`;
    }
  });

  test('run parses and executes request from file', async () => {
    let callCount = 0;
    const restore = installFetchMock(async (url) => {
      callCount++;
      expect(String(url)).toBe('https://example.com/api');
      return new Response('{}', { status: 200 });
    });

    try {
      const client = createClient();
      await client.run(`${FIXTURES}/simple-get.http`);
      expect(callCount).toBe(1);
    } finally {
      restore();
    }
  });

  test('run interpolates variables', async () => {
    const restore = installFetchMock(async (url) => {
      expect(String(url)).toBe('https://api.example.com/users');
      return new Response('{}', { status: 200 });
    });

    try {
      const client = createClient({
        variables: {
          host: 'api.example.com',
          path: 'users'
        }
      });
      await client.run(`${FIXTURES}/get-with-variables.http`);
    } finally {
      restore();
    }
  });

  test('run accepts additional variables in options', async () => {
    const restore = installFetchMock(async (url) => {
      expect(String(url)).toBe('https://override.com/extra');
      return new Response('{}', { status: 200 });
    });

    try {
      const client = createClient({
        variables: { host: 'original.com' }
      });
      await client.run(`${FIXTURES}/get-with-variables.http`, {
        variables: { host: 'override.com', path: 'extra' }
      });
    } finally {
      restore();
    }
  });

  test('client merges default headers', async () => {
    const restore = installFetchMock(async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers['X-Default']).toBe('default-value');
      expect(headers['X-Request']).toBe('request-value');
      return new Response('{}', { status: 200 });
    });

    try {
      const client = createClient({
        defaults: {
          headers: { 'X-Default': 'default-value' }
        }
      });
      await client.run(`${FIXTURES}/get-with-headers.http`);
    } finally {
      restore();
    }
  });

  test('request headers override default headers', async () => {
    const tempPath = `${FIXTURES}/auth-override.http`;
    await Bun.write(
      tempPath,
      `GET https://example.com/api
Authorization: Bearer override
`
    );

    const restore = installFetchMock(async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer override');
      return new Response('{}', { status: 200 });
    });

    try {
      const client = createClient({
        defaults: {
          headers: { Authorization: 'Bearer default' }
        }
      });
      await client.run(tempPath);
    } finally {
      restore();
      await Bun.$`rm -f ${tempPath}`;
    }
  });

  test('client adds cookies from jar to request', async () => {
    const restore = installFetchMock(async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Cookie).toContain('session=abc123');
      return new Response('{}', { status: 200 });
    });

    try {
      const jar = createCookieJar();
      jar.setCookieSync('session=abc123; Domain=example.com; Path=/', 'https://example.com/');

      const client = createClient({ cookieJar: jar });
      await client.run(`${FIXTURES}/simple-get.http`);
    } finally {
      restore();
    }
  });

  test('client uses custom resolver', async () => {
    const restore = installFetchMock(async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer secret-token');
      return new Response('{}', { status: 200 });
    });

    try {
      const client = createClient({
        resolvers: {
          $secret: (key) => (key === 'API_TOKEN' ? 'secret-token' : '')
        }
      });
      await client.run(`${FIXTURES}/get-with-auth-variable.http`);
    } finally {
      restore();
    }
  });

  test('client uses default timeout', async () => {
    const restore = installFetchMock(async (_url, init) => {
      expect(init?.signal).toBeDefined();
      return new Response('{}', { status: 200 });
    });

    try {
      const client = createClient({
        timeout: 5000
      });
      await client.run(`${FIXTURES}/simple-get.http`);
    } finally {
      restore();
    }
  });

  test('run accepts timeout option', async () => {
    const restore = installFetchMock(async (_url, init) => {
      expect(init?.signal).toBeDefined();
      return new Response('{}', { status: 200 });
    });

    try {
      const client = createClient();
      await client.run(`${FIXTURES}/simple-get.http`, {
        timeout: 1000
      });
    } finally {
      restore();
    }
  });

  test('run accepts signal option', async () => {
    const controller = new AbortController();
    const restore = installFetchMock(async (_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      return new Response('{}', { status: 200 });
    });

    try {
      const client = createClient();
      await client.run(`${FIXTURES}/simple-get.http`, {
        signal: controller.signal
      });
    } finally {
      restore();
    }
  });

  test('returns native Response', async () => {
    const restore = installFetchMock(async () => new Response('{"ok":true}', { status: 200 }));

    try {
      const client = createClient();
      const response = await client.run(`${FIXTURES}/simple-get.http`);

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200);
      expect(response.ok).toBe(true);

      const json = await response.json();
      expect(json).toEqual({ ok: true });
    } finally {
      restore();
    }
  });

  test('close() is a no-op for local client', async () => {
    const client = createClient();
    // Should not throw
    await client.close();
    // Can be called multiple times
    await client.close();
  });

  test('Symbol.asyncDispose works for local client', async () => {
    const client = createClient();
    // Should not throw
    await client[Symbol.asyncDispose]();
  });

  test('getServerMetadata returns undefined for local client', () => {
    const client = createClient();
    const meta = getServerMetadata(client);
    expect(meta).toBeUndefined();
  });
});

describe('createClient with server option', () => {
  test('routes to server client when server option provided', async () => {
    let sessionCreated = false;
    let flowCreated = false;
    let executeRequested = false;

    const restore = installFetchMock(async (url, init) => {
      const urlStr = String(url);

      // Session creation
      if (urlStr.includes('/session') && init?.method === 'POST') {
        sessionCreated = true;
        return new Response(JSON.stringify({ sessionId: 'test-session-123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Flow creation
      if (urlStr.includes('/flows') && init?.method === 'POST') {
        flowCreated = true;
        return new Response(JSON.stringify({ flowId: 'test-flow-456' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Execute request
      if (urlStr.includes('/execute')) {
        executeRequested = true;
        return new Response(
          JSON.stringify({
            runId: 'run-1',
            request: { index: 0, method: 'GET', url: 'https://example.com/api' },
            response: {
              status: 200,
              statusText: 'OK',
              headers: [{ name: 'Content-Type', value: 'application/json' }],
              body: '{"success":true}',
              encoding: 'utf-8',
              truncated: false,
              bodyBytes: 16
            },
            timing: { startTime: 0, endTime: 100, durationMs: 100 }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Flow finish
      if (urlStr.includes('/finish')) {
        return new Response('', { status: 200 });
      }

      return new Response('Not found', { status: 404 });
    });

    try {
      const client = createClient({
        server: 'http://localhost:4096',
        variables: { baseUrl: 'https://api.example.com' }
      });

      // Run a request
      const response = await client.runString('GET https://example.com/api');

      expect(sessionCreated).toBe(true);
      expect(flowCreated).toBe(true);
      expect(executeRequested).toBe(true);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json).toEqual({ success: true });

      // Close should finish the flow
      await client.close();
    } finally {
      restore();
    }
  });

  test('getServerMetadata returns metadata for server client', async () => {
    const restore = installFetchMock(async (url, init) => {
      const urlStr = String(url);

      if (urlStr.includes('/session') && init?.method === 'POST') {
        return new Response(JSON.stringify({ sessionId: 'meta-session' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (urlStr.includes('/flows') && init?.method === 'POST') {
        return new Response(JSON.stringify({ flowId: 'meta-flow' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (urlStr.includes('/execute')) {
        return new Response(
          JSON.stringify({
            runId: 'run-1',
            request: { index: 0, method: 'GET', url: 'https://example.com/api' },
            response: {
              status: 200,
              statusText: 'OK',
              headers: [],
              body: '{}',
              encoding: 'utf-8',
              truncated: false,
              bodyBytes: 2
            },
            timing: { startTime: 0, endTime: 100, durationMs: 100 }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (urlStr.includes('/finish')) {
        return new Response('', { status: 200 });
      }

      return new Response('Not found', { status: 404 });
    });

    try {
      const client = createClient({ server: 'http://localhost:4096' });

      // Metadata is available before initialization (with undefined values)
      const metaBefore = getServerMetadata(client);
      expect(metaBefore).toBeDefined();
      expect(metaBefore?.serverUrl).toBe('http://localhost:4096');
      expect(metaBefore?.sessionId).toBeUndefined();
      expect(metaBefore?.flowId).toBeUndefined();

      // Run a request to trigger initialization
      await client.runString('GET https://example.com/api');

      // After initialization, metadata contains session and flow IDs
      const metaAfter = getServerMetadata(client);
      expect(metaAfter).toBeDefined();
      expect(metaAfter?.serverUrl).toBe('http://localhost:4096');
      expect(metaAfter?.sessionId).toBe('meta-session');
      expect(metaAfter?.flowId).toBe('meta-flow');

      await client.close();
    } finally {
      restore();
    }
  });

  test('server client uses token from config', async () => {
    let authHeader: string | undefined;

    const restore = installFetchMock(async (url, init) => {
      const urlStr = String(url);
      const headers = init?.headers as Record<string, string> | undefined;
      authHeader = headers?.Authorization;

      if (urlStr.includes('/session')) {
        return new Response(JSON.stringify({ sessionId: 'session-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (urlStr.includes('/flows') && init?.method === 'POST') {
        return new Response(JSON.stringify({ flowId: 'flow-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (urlStr.includes('/execute')) {
        return new Response(
          JSON.stringify({
            runId: 'run-1',
            request: { index: 0, method: 'GET', url: 'https://example.com' },
            response: {
              status: 200,
              statusText: 'OK',
              headers: [],
              body: '',
              encoding: 'utf-8',
              truncated: false,
              bodyBytes: 0
            },
            timing: { startTime: 0, endTime: 100, durationMs: 100 }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (urlStr.includes('/finish')) {
        return new Response('', { status: 200 });
      }

      return new Response('Not found', { status: 404 });
    });

    try {
      const client = createClient({
        server: 'http://localhost:4096',
        serverToken: 'secret-token-123'
      });

      await client.runString('GET https://example.com');
      expect(authHeader).toBe('Bearer secret-token-123');

      await client.close();
    } finally {
      restore();
    }
  });
});
