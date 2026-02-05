import { describe, expect, test } from 'bun:test';
import {
  extractResponseHeaders,
  processResponseBody
} from '../../src/server/service/response-processor';
import type { FetchResponse } from '../../src/server/service/utils';

function createMockResponse(
  body: string | Uint8Array | null,
  options?: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    setCookies?: string[];
  }
): FetchResponse {
  const status = options?.status ?? 200;
  const statusText = options?.statusText ?? 'OK';
  const rawHeaders = options?.headers ?? {};
  const setCookies = options?.setCookies ?? [];

  let _responseBody: ReadableStream<Uint8Array> | null = null;

  if (body !== null) {
    const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
    _responseBody = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      }
    });
  }

  // We need a cloneable response - use actual Response for this
  const actualHeaders = new Headers(rawHeaders);

  const resp = new Response(body !== null ? (typeof body === 'string' ? body : body) : null, {
    status,
    statusText,
    headers: actualHeaders
  });

  // Add getSetCookie support
  const headersProxy = resp.headers as unknown as Record<string, unknown>;
  headersProxy.getSetCookie = () => setCookies;

  return resp as unknown as FetchResponse;
}

describe('processResponseBody', () => {
  test('processes text body', async () => {
    const resp = createMockResponse('Hello, World!');

    const result = await processResponseBody(resp, 1024 * 1024);

    expect(result.body).toBe('Hello, World!');
    expect(result.encoding).toBe('utf-8');
    expect(result.truncated).toBe(false);
    expect(result.bodyBytes).toBe(13);
    expect(result.bodyMode).toBe('buffered');
  });

  test('truncates body exceeding maxBodyBytes', async () => {
    const longBody = 'x'.repeat(100);
    const resp = createMockResponse(longBody);

    const result = await processResponseBody(resp, 50);

    expect(result.truncated).toBe(true);
    expect(result.bodyBytes).toBe(50);
    expect(result.body?.length).toBe(50);
    expect(result.bodyMode).toBe('buffered');
  });

  test('handles empty body', async () => {
    const resp = createMockResponse(null);

    const result = await processResponseBody(resp, 1024);

    expect(result.body).toBeUndefined();
    expect(result.bodyBytes).toBe(0);
    expect(result.bodyMode).toBe('none');
    expect(result.truncated).toBe(false);
  });

  test('detects binary content and encodes as base64', async () => {
    // Create binary content with null bytes (triggers binary detection)
    const binaryData = new Uint8Array([
      0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x00, 0x89, 0x50, 0x4e, 0x47
    ]);
    const resp = createMockResponse(binaryData);

    const result = await processResponseBody(resp, 1024);

    expect(result.encoding).toBe('base64');
    expect(result.bodyMode).toBe('buffered');
    expect(typeof result.body).toBe('string');
  });

  test('handles exact maxBodyBytes boundary', async () => {
    const body = 'x'.repeat(50);
    const resp = createMockResponse(body);

    const result = await processResponseBody(resp, 50);

    expect(result.truncated).toBe(false);
    expect(result.bodyBytes).toBe(50);
    expect(result.body).toBe(body);
  });
});

describe('extractResponseHeaders', () => {
  test('extracts regular headers', () => {
    const resp = createMockResponse('', {
      headers: { 'Content-Type': 'application/json', 'X-Custom': 'value' }
    });

    const headers = extractResponseHeaders(resp);

    const contentType = headers.find((h) => h.name === 'content-type');
    expect(contentType?.value).toBe('application/json');

    const custom = headers.find((h) => h.name === 'x-custom');
    expect(custom?.value).toBe('value');
  });

  test('extracts multi-value set-cookie headers separately', () => {
    const resp = createMockResponse('', {
      setCookies: ['session=abc; Path=/', 'theme=dark; Path=/']
    });

    const headers = extractResponseHeaders(resp);

    const cookies = headers.filter((h) => h.name === 'set-cookie');
    expect(cookies).toHaveLength(2);
    expect(cookies[0]?.value).toBe('session=abc; Path=/');
    expect(cookies[1]?.value).toBe('theme=dark; Path=/');
  });

  test('lowercases header names', () => {
    const resp = createMockResponse('', {
      headers: { 'X-Request-Id': '12345' }
    });

    const headers = extractResponseHeaders(resp);

    const reqId = headers.find((h) => h.name === 'x-request-id');
    expect(reqId).toBeDefined();
    expect(reqId?.value).toBe('12345');
  });

  test('handles empty headers', () => {
    const resp = createMockResponse('');

    const headers = extractResponseHeaders(resp);

    // Should at least not throw
    expect(Array.isArray(headers)).toBe(true);
  });
});
