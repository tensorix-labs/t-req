import { describe, expect, test } from 'bun:test';
import { compileExecuteRequest } from '../src/engine/compile-request';

describe('compileExecuteRequest', () => {
  test('merges header defaults with request headers (request wins)', async () => {
    const result = await compileExecuteRequest(
      {
        method: 'GET',
        url: 'https://example.com',
        headers: { Authorization: 'Bearer token' }
      },
      {
        basePath: '/app',
        headerDefaults: { 'User-Agent': 'test-agent', Authorization: 'Bearer default' }
      }
    );

    expect(result.executeRequest.headers).toEqual({
      'User-Agent': 'test-agent',
      Authorization: 'Bearer token'
    });
  });

  test('applies header defaults when no request headers conflict', async () => {
    const result = await compileExecuteRequest(
      {
        method: 'POST',
        url: 'https://example.com',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        basePath: '/app',
        headerDefaults: { Accept: 'application/json' }
      }
    );

    expect(result.executeRequest.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json'
    });
  });

  test('passes string body through directly', async () => {
    const result = await compileExecuteRequest(
      {
        method: 'POST',
        url: 'https://example.com',
        headers: {},
        body: '{"key":"value"}'
      },
      { basePath: '/app' }
    );

    expect(result.executeRequest.body).toBe('{"key":"value"}');
  });

  test('builds url-encoded body from non-file form data', async () => {
    const result = await compileExecuteRequest(
      {
        method: 'POST',
        url: 'https://example.com',
        headers: {},
        formData: [
          { name: 'field1', value: 'val1', isFile: false },
          { name: 'field2', value: 'val2', isFile: false }
        ]
      },
      { basePath: '/app' }
    );

    expect(result.executeRequest.body).toBeInstanceOf(URLSearchParams);
    const params = result.executeRequest.body as URLSearchParams;
    expect(params.get('field1')).toBe('val1');
    expect(params.get('field2')).toBe('val2');
    expect(result.executeRequest.headers?.['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    );
  });

  test('does not overwrite existing Content-Type for url-encoded form data', async () => {
    const result = await compileExecuteRequest(
      {
        method: 'POST',
        url: 'https://example.com',
        headers: { 'Content-Type': 'custom/type' },
        formData: [{ name: 'field1', value: 'val1', isFile: false }]
      },
      { basePath: '/app' }
    );

    expect(result.executeRequest.headers?.['Content-Type']).toBe('custom/type');
  });

  test('omits body when not provided', async () => {
    const result = await compileExecuteRequest(
      {
        method: 'GET',
        url: 'https://example.com',
        headers: {}
      },
      { basePath: '/app' }
    );

    expect(result.executeRequest.body).toBeUndefined();
  });

  test('uses empty header defaults when not provided', async () => {
    const result = await compileExecuteRequest(
      {
        method: 'GET',
        url: 'https://example.com',
        headers: { Host: 'example.com' }
      },
      { basePath: '/app' }
    );

    expect(result.executeRequest.headers).toEqual({ Host: 'example.com' });
  });

  test('constructs correct method and url', async () => {
    const result = await compileExecuteRequest(
      {
        method: 'DELETE',
        url: 'https://api.example.com/resource/123',
        headers: {}
      },
      { basePath: '/app' }
    );

    expect(result.executeRequest.method).toBe('DELETE');
    expect(result.executeRequest.url).toBe('https://api.example.com/resource/123');
  });
});
