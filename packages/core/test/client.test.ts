import { describe, expect, test } from 'bun:test';
import { createClient } from '../src/client.ts';
import { createCookieJar } from '../src/cookies.ts';
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
});
