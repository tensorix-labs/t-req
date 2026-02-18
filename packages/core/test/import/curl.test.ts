import { describe, expect, test } from 'bun:test';
import {
  type CurlConvertOptions,
  convertCurlCommand,
  createCurlImporter
} from '../../src/import/curl.ts';
import type { ImportResult } from '../../src/import/types.ts';
import type { SerializableRequest } from '../../src/serializer.ts';

function flattenRequests(result: ImportResult): SerializableRequest[] {
  return result.files.flatMap((file) => file.document.requests);
}

function firstRequest(result: ImportResult): SerializableRequest | undefined {
  return flattenRequests(result)[0];
}

function convert(command: string, options?: CurlConvertOptions): ImportResult {
  return convertCurlCommand(command, options);
}

describe('convertCurlCommand', () => {
  test('converts a basic GET curl command', () => {
    const result = convert('curl https://api.example.com/users');

    expect(result.name).toBe('curl-import');
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.relativePath).toBe('curl-request.http');
    expect(result.stats.requestCount).toBe(1);
    expect(result.stats.fileCount).toBe(1);

    const request = firstRequest(result);
    expect(request?.method).toBe('GET');
    expect(request?.url).toBe('https://api.example.com/users');
    expect(request?.body).toBeUndefined();
  });

  test('converts method, headers, and body flags', () => {
    const result = convert(
      "curl -X POST https://api.example.com/users -H 'Authorization: Bearer abc' -H 'X-Test: 1' -d '{\"name\":\"Ada\"}'"
    );

    const request = firstRequest(result);
    expect(request?.method).toBe('POST');
    expect(request?.headers?.Authorization).toBe('Bearer abc');
    expect(request?.headers?.['X-Test']).toBe('1');
    expect(request?.body).toBe('{"name":"Ada"}');
  });

  test('converts multipart form fields and file uploads', () => {
    const result = convert(
      "curl -F 'name=Ada' -F 'avatar=@./avatar.png' https://api.example.com/users"
    );

    const request = firstRequest(result);
    expect(request?.method).toBe('POST');
    expect(request?.formData).toEqual([
      { name: 'name', value: 'Ada', isFile: false },
      { name: 'avatar', value: '', isFile: true, path: './avatar.png' }
    ]);
  });

  test('converts basic auth user flag to Authorization header', () => {
    const result = convert('curl -u user:pass https://api.example.com/secure');

    const request = firstRequest(result);
    expect(request?.headers?.Authorization).toBe('Basic dXNlcjpwYXNz');
  });

  test('maps --get data flags to query parameters', () => {
    const result = convert(
      "curl -G https://api.example.com/search --data 'q=test' --data-urlencode 'limit=10'"
    );

    const request = firstRequest(result);
    expect(request?.method).toBe('GET');
    expect(request?.url).toBe('https://api.example.com/search?q=test&limit=10');
    expect(request?.body).toBeUndefined();
  });

  test('returns an error diagnostic when URL is missing', () => {
    const result = convert('curl -X POST -H "Authorization: Bearer token"');

    expect(result.files).toHaveLength(0);
    expect(result.stats.requestCount).toBe(0);
    expect(result.diagnostics.some((diag) => diag.code === 'missing-url')).toBe(true);
    expect(result.diagnostics.some((diag) => diag.severity === 'error')).toBe(true);
  });

  test('creates importer instances with curl source', () => {
    const importerA = createCurlImporter();
    const importerB = createCurlImporter();

    expect(importerA.source).toBe('curl');
    expect(importerA.convert).toBe(convertCurlCommand);
    expect(importerA).not.toBe(importerB);
  });
});
