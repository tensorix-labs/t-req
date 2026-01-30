import { installFetchMock } from './fetch-mock.ts';

/**
 * Mock implementation of httpbin.org endpoints for deterministic testing.
 * Simulates the responses from httpbin.org without making real network requests.
 */

interface HttpbinResponse {
  url: string;
  args: Record<string, string>;
  headers: Record<string, string>;
  origin?: string;
  json?: unknown;
  data?: string;
  form?: Record<string, string>;
  files?: Record<string, string>;
}

function parseQueryParams(url: URL): Record<string, string> {
  const args: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    args[key] = value;
  });
  return args;
}

function normalizeHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    // Capitalize header names like httpbin does (e.g., "content-type" -> "Content-Type")
    const normalized = key
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('-');
    result[normalized] = value;
  });
  return result;
}

async function handleHttpbinRequest(url: URL, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? 'GET';
  const headers = new Headers(init?.headers);
  const normalizedHeaders = normalizeHeaders(headers);
  const pathname = url.pathname;
  const args = parseQueryParams(url);

  // /get, /post, /put, /delete, /patch - Return JSON with url, args, headers, body
  if (/^\/(get|post|put|delete|patch)$/i.test(pathname)) {
    const expectedMethod = pathname.slice(1).toUpperCase();
    if (method.toUpperCase() !== expectedMethod) {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const response: HttpbinResponse = {
      url: url.toString(),
      args,
      headers: normalizedHeaders,
      origin: '127.0.0.1'
    };

    // Parse body for non-GET methods
    if (init?.body && method !== 'GET') {
      const bodyStr = typeof init.body === 'string' ? init.body : await readBody(init.body);
      response.data = bodyStr;

      // Try to parse as JSON
      if (headers.get('content-type')?.includes('application/json') && bodyStr) {
        try {
          response.json = JSON.parse(bodyStr);
        } catch {
          // Not valid JSON, keep as data
        }
      }
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // /headers - Return request headers as JSON
  if (pathname === '/headers') {
    return new Response(JSON.stringify({ headers: normalizedHeaders }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // /basic-auth/:user/:passwd - Validate Basic auth header
  const basicAuthMatch = pathname.match(/^\/basic-auth\/([^/]+)\/([^/]+)$/);
  if (basicAuthMatch) {
    const [, expectedUser, expectedPasswd] = basicAuthMatch;
    const authHeader = headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Fake Realm"' }
      });
    }

    const encoded = authHeader.slice(6);
    const decoded = atob(encoded);
    const [user, passwd] = decoded.split(':');

    if (user === expectedUser && passwd === expectedPasswd) {
      return new Response(JSON.stringify({ authenticated: true, user: expectedUser }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Fake Realm"' }
    });
  }

  // /status/:code - Return specified HTTP status
  const statusMatch = pathname.match(/^\/status\/(\d+)$/);
  if (statusMatch) {
    const statusCode = parseInt(statusMatch[1], 10);
    return new Response(null, { status: statusCode });
  }

  // /delay/:seconds - Support abort signal for timeout testing
  const delayMatch = pathname.match(/^\/delay\/(\d+)$/);
  if (delayMatch) {
    const seconds = parseInt(delayMatch[1], 10);
    const signal = init?.signal;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(
          new Response(JSON.stringify({ url: url.toString(), args, delay: seconds }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        );
      }, seconds * 1000);

      if (signal) {
        if (signal.aborted) {
          clearTimeout(timeout);
          reject(new DOMException('The operation was aborted.', 'AbortError'));
          return;
        }

        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      }
    });
  }

  // /cookies - Parse Cookie header and return cookies
  if (pathname === '/cookies') {
    const cookieHeader = headers.get('cookie') ?? '';
    const cookies: Record<string, string> = {};

    if (cookieHeader) {
      cookieHeader.split(';').forEach((cookie) => {
        const [name, ...valueParts] = cookie.trim().split('=');
        if (name) {
          cookies[name] = valueParts.join('=');
        }
      });
    }

    return new Response(JSON.stringify({ cookies }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Unknown endpoint
  return new Response('Not Found', { status: 404 });
}

async function readBody(body: BodyInit): Promise<string> {
  if (typeof body === 'string') {
    return body;
  }
  if (body instanceof Blob) {
    return body.text();
  }
  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }
  if (body instanceof URLSearchParams) {
    return body.toString();
  }
  if (body instanceof FormData) {
    // FormData is complex - return empty for now
    return '';
  }
  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (result.value) {
        chunks.push(result.value);
      }
    }
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(combined);
  }
  return String(body);
}

/**
 * Installs a mock for httpbin.org requests.
 * Non-httpbin requests are passed through to the real fetch.
 * @returns A function to restore the original fetch
 */
export function installHttpbinMock(): () => void {
  const originalFetch = globalThis.fetch;

  return installFetchMock(async (input, init) => {
    const url =
      input instanceof Request
        ? new URL(input.url)
        : typeof input === 'string'
          ? new URL(input)
          : input;

    // Only mock httpbin.org requests
    if (url.hostname === 'httpbin.org') {
      return handleHttpbinRequest(url, init);
    }

    // Pass through non-httpbin requests to original fetch
    return originalFetch(input, init);
  });
}
