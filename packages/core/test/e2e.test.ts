import { beforeAll, describe, expect, test } from 'bun:test';
import { createCookieJar } from '../src/cookies.ts';
import { execute } from '../src/execute.ts';
import { createClient, parse } from '../src/index';

// Create test fixtures directory and files for e2e tests
const FIXTURES = './test/fixtures/e2e';

beforeAll(async () => {
  await Bun.write(`${FIXTURES}/simple-get.http`, 'GET https://httpbin.org/get\n');
  await Bun.write(
    `${FIXTURES}/get-with-accept.http`,
    'GET https://httpbin.org/get\nAccept: application/json\n'
  );
  await Bun.write(
    `${FIXTURES}/post-json.http`,
    `POST https://httpbin.org/post
Content-Type: application/json

{"message": "hello from .http file"}
`
  );
  await Bun.write(`${FIXTURES}/get-with-variables.http`, 'GET {{baseUrl}}/{{endpoint}}\n');
  await Bun.write(`${FIXTURES}/get-headers.http`, 'GET https://httpbin.org/headers\n');
  await Bun.write(
    `${FIXTURES}/get-with-timestamp.http`,
    'GET https://httpbin.org/get?t={{$timestamp()}}\n'
  );
  await Bun.write(`${FIXTURES}/get-cookies.http`, 'GET https://httpbin.org/cookies\n');
  await Bun.write(
    `${FIXTURES}/get-with-query.http`,
    'GET https://httpbin.org/get?a={{initial}}&b={{added}}\n'
  );
  await Bun.write(`${FIXTURES}/empty.http`, '# just a comment\n');
});

/**
 * End-to-End tests using httpbin.org
 * These tests verify the library works with real HTTP requests
 */

describe('E2E: execute (internal)', () => {
  test('simple GET request', async () => {
    const response = await execute({
      method: 'GET',
      url: 'https://httpbin.org/get'
    });

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);

    const json = (await response.json()) as { url: string };
    expect(json.url).toBe('https://httpbin.org/get');
  });

  test('POST with JSON body', async () => {
    const body = JSON.stringify({ name: 'test', value: 123 });

    const response = await execute({
      method: 'POST',
      url: 'https://httpbin.org/post',
      headers: { 'Content-Type': 'application/json' },
      body
    });

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);

    const json = (await response.json()) as { json: { name: string; value: number } };
    expect(json.json.name).toBe('test');
    expect(json.json.value).toBe(123);
  });

  test('sends custom headers', async () => {
    const response = await execute({
      method: 'GET',
      url: 'https://httpbin.org/headers',
      headers: {
        'X-Custom-Header': 'custom-value',
        'X-Another-Header': 'another-value'
      }
    });

    expect(response.ok).toBe(true);

    const json = (await response.json()) as { headers: Record<string, string> };
    expect(json.headers['X-Custom-Header']).toBe('custom-value');
    expect(json.headers['X-Another-Header']).toBe('another-value');
  });

  test('handles query parameters', async () => {
    const response = await execute({
      method: 'GET',
      url: 'https://httpbin.org/get?foo=bar&baz=qux'
    });

    expect(response.ok).toBe(true);

    const json = (await response.json()) as { args: Record<string, string> };
    expect(json.args.foo).toBe('bar');
    expect(json.args.baz).toBe('qux');
  });

  test('basic authentication', async () => {
    const response = await execute({
      method: 'GET',
      url: 'https://httpbin.org/basic-auth/user/passwd',
      headers: {
        Authorization: `Basic ${btoa('user:passwd')}`
      }
    });

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);

    const json = (await response.json()) as { authenticated: boolean; user: string };
    expect(json.authenticated).toBe(true);
    expect(json.user).toBe('user');
  });

  test('different HTTP methods', async () => {
    // PUT
    const putResponse = await execute({
      method: 'PUT',
      url: 'https://httpbin.org/put',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update' })
    });
    expect(putResponse.ok).toBe(true);

    // DELETE
    const deleteResponse = await execute({
      method: 'DELETE',
      url: 'https://httpbin.org/delete'
    });
    expect(deleteResponse.ok).toBe(true);

    // PATCH
    const patchResponse = await execute({
      method: 'PATCH',
      url: 'https://httpbin.org/patch',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: 'value' })
    });
    expect(patchResponse.ok).toBe(true);
  });

  test('handles status codes', async () => {
    const response = await execute({
      method: 'GET',
      url: 'https://httpbin.org/status/201'
    });

    expect(response.status).toBe(201);
    expect(response.ok).toBe(true);
  });

  test('handles 4xx errors gracefully', async () => {
    const response = await execute({
      method: 'GET',
      url: 'https://httpbin.org/status/404'
    });

    expect(response.status).toBe(404);
    expect(response.ok).toBe(false);
  });

  test('timeout handling', async () => {
    await expect(
      execute({ method: 'GET', url: 'https://httpbin.org/delay/10' }, { timeout: 1000 })
    ).rejects.toThrow('Request timeout after 1000ms');
  });
});

describe('E2E: parse and execute', () => {
  test('parses and executes .http content', async () => {
    const content = `
GET https://httpbin.org/get
Accept: application/json
`;

    const requests = parse(content);
    expect(requests).toHaveLength(1);

    const response = await execute({
      method: requests[0]?.method,
      url: requests[0]?.url,
      headers: requests[0]?.headers
    });

    expect(response.ok).toBe(true);
  });

  test('parses and executes POST with body', async () => {
    const content = `
POST https://httpbin.org/post
Content-Type: application/json

{"message": "hello from .http file"}
`;

    const requests = parse(content);
    const response = await execute({
      method: requests[0]?.method,
      url: requests[0]?.url,
      headers: requests[0]?.headers,
      body: requests[0]?.body
    });

    expect(response.ok).toBe(true);

    const json = (await response.json()) as { json: { message: string } };
    expect(json.json.message).toBe('hello from .http file');
  });
});

describe('E2E: createClient', () => {
  test('client runs request from file', async () => {
    const client = createClient();

    const response = await client.run(`${FIXTURES}/simple-get.http`);

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  });

  test('client with variable interpolation', async () => {
    const client = createClient({
      variables: {
        baseUrl: 'https://httpbin.org',
        endpoint: 'get'
      }
    });

    const response = await client.run(`${FIXTURES}/get-with-variables.http`);

    expect(response.ok).toBe(true);
  });

  test('client with default headers', async () => {
    const client = createClient({
      defaults: {
        headers: {
          'X-Client-Header': 'default-value'
        }
      }
    });

    const response = await client.run(`${FIXTURES}/get-headers.http`);

    const json = (await response.json()) as { headers: Record<string, string> };
    expect(json.headers['X-Client-Header']).toBe('default-value');
  });

  test('client with custom resolver', async () => {
    const client = createClient({
      resolvers: {
        $timestamp: () => String(Date.now())
      }
    });

    const response = await client.run(`${FIXTURES}/get-with-timestamp.http`);

    expect(response.ok).toBe(true);

    const json = (await response.json()) as { args: Record<string, string> };
    expect(parseInt(json.args.t, 10)).toBeGreaterThan(0);
  });

  test('client tracks and reuses cookies', async () => {
    const jar = createCookieJar();
    const client = createClient({ cookieJar: jar });

    // Manually set a cookie (simulates receiving Set-Cookie from a response)
    // Avoid setting an explicit Domain attribute here: `tough-cookie` treats some domains as
    // "private" public suffixes (via its PSL/private list handling) and will reject them.
    // Host-only cookies are the common real-world default for Set-Cookie.
    jar.setCookieSync('session=abc123; Path=/', 'https://httpbin.org/');

    // Verify cookie was stored
    const cookies = jar.getCookiesSync('https://httpbin.org/');
    expect(cookies.length).toBeGreaterThan(0);
    expect(cookies.some((c) => c.key === 'session')).toBe(true);

    // Request should send the cookie
    const response = await client.run(`${FIXTURES}/get-cookies.http`);

    const json = (await response.json()) as { cookies: Record<string, string> };
    expect(json.cookies.session).toBe('abc123');
  });

  test('client setVariable updates state', async () => {
    const client = createClient({
      variables: { initial: 'value1' }
    });

    client.setVariable('initial', 'value2');
    client.setVariable('added', 'value3');

    const response = await client.run(`${FIXTURES}/get-with-query.http`);

    const json = (await response.json()) as { args: Record<string, string> };
    expect(json.args.a).toBe('value2');
    expect(json.args.b).toBe('value3');
  });
});

describe('E2E: error handling', () => {
  test('handles network error gracefully', async () => {
    await expect(
      execute({
        method: 'GET',
        url: 'https://this-domain-does-not-exist-12345.invalid/'
      })
    ).rejects.toThrow();
  });

  test('handles invalid URL', async () => {
    await expect(
      execute({
        method: 'GET',
        url: 'not-a-valid-url'
      })
    ).rejects.toThrow();
  });

  test('client throws on file with no valid requests', async () => {
    const client = createClient();

    await expect(client.run(`${FIXTURES}/empty.http`)).rejects.toThrow('No valid requests found');
  });
});
