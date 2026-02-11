import { describe, expect, test } from 'bun:test';
import { extractHeaders, readResponseBody } from '../../src/execution/response-utils';

describe('response utils', () => {
  test('extracts headers from response', () => {
    const response = new Response('ok', {
      headers: {
        'Content-Type': 'text/plain',
        'X-Test': 'value'
      }
    });

    const headers = extractHeaders(response);
    expect(headers).toEqual([
      { name: 'content-type', value: 'text/plain' },
      { name: 'x-test', value: 'value' }
    ]);
  });

  test('reads utf-8 response body', async () => {
    const response = new Response('{"ok":true}', {
      headers: { 'Content-Type': 'application/json' }
    });

    const body = await readResponseBody(response, 1024);
    expect(body.encoding).toBe('utf-8');
    expect(body.body).toBe('{"ok":true}');
    expect(body.bodyBytes).toBeGreaterThan(0);
    expect(body.truncated).toBe(false);
  });

  test('keeps valid multibyte utf-8 content as text', async () => {
    const value = 'héllo';
    const response = new Response(value, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });

    const body = await readResponseBody(response, 1024);
    expect(body.encoding).toBe('utf-8');
    expect(body.body).toBe(value);
    expect(body.truncated).toBe(false);
  });

  test('truncates body when max bytes is exceeded', async () => {
    const response = new Response('abcdefghij');
    const body = await readResponseBody(response, 4);

    expect(body.body).toBe('abcd');
    expect(body.encoding).toBe('utf-8');
    expect(body.bodyBytes).toBe(4);
    expect(body.truncated).toBe(true);
  });

  test('encodes binary response bodies as base64', async () => {
    const binary = new Uint8Array([0, 159, 146, 150, 255]);
    const response = new Response(binary);
    const body = await readResponseBody(response, 1024);

    expect(body.encoding).toBe('base64');
    expect(body.body).toBe(Buffer.from(binary).toString('base64'));
  });
});
