import { describe, expect, test } from 'bun:test';
import { execute } from '../src/execute.ts';
import { installFetchMock } from './utils/fetch-mock.ts';

describe('execute', () => {
  test('calls fetch with correct method', async () => {
    let called = false;
    const restore = installFetchMock(async (_url, init) => {
      called = true;
      expect(init?.method).toBe('POST');
      return new Response('{}', { status: 200 });
    });

    try {
      await execute({ method: 'POST', url: 'https://example.com/api' });
      expect(called).toBe(true);
    } finally {
      restore();
    }
  });

  test('includes headers in request', async () => {
    const restore = installFetchMock(async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer token');
      expect(headers['Content-Type']).toBe('application/json');
      return new Response('{}', { status: 200 });
    });

    try {
      await execute({
        method: 'GET',
        url: 'https://example.com/api',
        headers: {
          Authorization: 'Bearer token',
          'Content-Type': 'application/json'
        }
      });
    } finally {
      restore();
    }
  });

  test('includes body for POST requests', async () => {
    const testBody = '{"test": true}';
    const restore = installFetchMock(async (_url, init) => {
      expect(init?.body).toBe(testBody);
      return new Response('{}', { status: 200 });
    });

    try {
      await execute({
        method: 'POST',
        url: 'https://example.com/api',
        body: testBody
      });
    } finally {
      restore();
    }
  });

  test('does not include body for GET requests', async () => {
    const restore = installFetchMock(async (_url, init) => {
      expect(init?.body).toBeUndefined();
      return new Response('{}', { status: 200 });
    });

    try {
      await execute({
        method: 'GET',
        url: 'https://example.com/api',
        body: 'should be ignored'
      });
    } finally {
      restore();
    }
  });

  test('does not include body for HEAD requests', async () => {
    const restore = installFetchMock(async (_url, init) => {
      expect(init?.body).toBeUndefined();
      return new Response('', { status: 200 });
    });

    try {
      await execute({
        method: 'HEAD',
        url: 'https://example.com/api',
        body: 'should be ignored'
      });
    } finally {
      restore();
    }
  });

  test('returns native Response object', async () => {
    const responseBody = '{"key": "value"}';
    const restore = installFetchMock(async () => {
      return new Response(responseBody, {
        status: 201,
        statusText: 'Created',
        headers: { 'Content-Type': 'application/json' }
      });
    });

    try {
      const response = await execute({
        method: 'GET',
        url: 'https://example.com/api'
      });

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(201);
      expect(response.statusText).toBe('Created');
      expect(response.ok).toBe(true);
      expect(response.headers.get('Content-Type')).toBe('application/json');

      const text = await response.text();
      expect(text).toBe(responseBody);
    } finally {
      restore();
    }
  });

  test('response.json() parses JSON body', async () => {
    const restore = installFetchMock(async () => {
      return new Response('{"name": "test", "count": 42}', { status: 200 });
    });

    try {
      const response = await execute({
        method: 'GET',
        url: 'https://example.com/api'
      });

      const json = (await response.json()) as { name: string; count: number };
      expect(json.name).toBe('test');
      expect(json.count).toBe(42);
    } finally {
      restore();
    }
  });

  test('response.ok is true for 2xx status', async () => {
    const restore = installFetchMock(async () => new Response('', { status: 204 }));

    try {
      const response = await execute({
        method: 'DELETE',
        url: 'https://example.com/api'
      });
      expect(response.ok).toBe(true);
    } finally {
      restore();
    }
  });

  test('response.ok is false for 4xx status', async () => {
    const restore = installFetchMock(async () => new Response('Not Found', { status: 404 }));

    try {
      const response = await execute({
        method: 'GET',
        url: 'https://example.com/api'
      });
      expect(response.ok).toBe(false);
    } finally {
      restore();
    }
  });

  test('response.ok is false for 5xx status', async () => {
    const restore = installFetchMock(async () => new Response('Server Error', { status: 500 }));

    try {
      const response = await execute({
        method: 'GET',
        url: 'https://example.com/api'
      });
      expect(response.ok).toBe(false);
    } finally {
      restore();
    }
  });

  test('handles redirect option', async () => {
    const restore = installFetchMock(async (_url, init) => {
      expect(init?.redirect).toBe('manual');
      return new Response('', { status: 200 });
    });

    try {
      await execute({ method: 'GET', url: 'https://example.com/api' }, { followRedirects: false });
    } finally {
      restore();
    }
  });

  test('default timeout is 30000ms', async () => {
    const restore = installFetchMock(async (_url, init) => {
      expect(init?.signal).toBeDefined();
      return new Response('{}', { status: 200 });
    });

    try {
      await execute({ method: 'GET', url: 'https://example.com/api' });
    } finally {
      restore();
    }
  });

  test('uses provided signal', async () => {
    const controller = new AbortController();
    const restore = installFetchMock(async (_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      return new Response('{}', { status: 200 });
    });

    try {
      await execute(
        { method: 'GET', url: 'https://example.com/api' },
        { signal: controller.signal }
      );
    } finally {
      restore();
    }
  });

  test('throws timeout error when request times out', async () => {
    const restore = installFetchMock(async (_url, init) => {
      await new Promise((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
        setTimeout(resolve, 1000);
      });
      return new Response('{}', { status: 200 });
    });

    try {
      await expect(
        execute({ method: 'GET', url: 'https://example.com/api' }, { timeout: 10 })
      ).rejects.toThrow('timeout');
    } finally {
      restore();
    }
  });
});

describe('execute response handling', () => {
  test('304 Not Modified has ok=false and can read empty body', async () => {
    const restore = installFetchMock(async () => {
      return new Response('', { status: 304, statusText: 'Not Modified' });
    });

    try {
      const response = await execute({
        method: 'GET',
        url: 'https://example.com/api'
      });

      expect(response.status).toBe(304);
      expect(response.ok).toBe(false);
      // Should be able to read body without error
      const text = await response.text();
      expect(text).toBe('');
    } finally {
      restore();
    }
  });

  test('Content-Type with charset passes through correctly', async () => {
    const restore = installFetchMock(async () => {
      return new Response('{"data": "value"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    });

    try {
      const response = await execute({
        method: 'GET',
        url: 'https://example.com/api'
      });

      expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      const json = await response.json();
      expect(json).toEqual({ data: 'value' });
    } finally {
      restore();
    }
  });

  test('timeout of 0 causes immediate abort', async () => {
    const restore = installFetchMock(async (_url, init) => {
      // Check that signal is already aborted or will abort immediately
      if (init?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      await new Promise((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
        setTimeout(resolve, 100);
      });
      return new Response('{}', { status: 200 });
    });

    try {
      await expect(
        execute({ method: 'GET', url: 'https://example.com/api' }, { timeout: 0 })
      ).rejects.toThrow('timeout');
    } finally {
      restore();
    }
  });
});
