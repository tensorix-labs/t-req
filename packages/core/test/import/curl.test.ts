import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import {
  type CurlConvertOptions,
  convertCurlCommand,
  createCurlImporter
} from '../../src/import/curl.ts';
import type { ImportResult } from '../../src/import/types.ts';
import type { SerializableRequest } from '../../src/serializer.ts';

const fixturesDir = path.join(import.meta.dir, '../fixtures/curl');

function flattenRequests(result: ImportResult): SerializableRequest[] {
  return result.files.flatMap((file) => file.document.requests);
}

function firstRequest(result: ImportResult): SerializableRequest | undefined {
  return flattenRequests(result)[0];
}

function convert(command: string, options?: CurlConvertOptions): ImportResult {
  return convertCurlCommand(command, options);
}

async function readCurlFixture(name: string): Promise<string> {
  return await Bun.file(path.join(fixturesDir, name)).text();
}

interface FixtureCase {
  name: string;
  fixture: string;
  assert: (result: ImportResult) => void;
}

describe('convertCurlCommand', () => {
  const fixtureCases: FixtureCase[] = [
    {
      name: 'converts a basic GET curl command fixture',
      fixture: 'basic-get.sh',
      assert: (result) => {
        expect(result.name).toBe('curl-import');
        expect(result.files).toHaveLength(1);
        expect(result.files[0]?.relativePath).toBe('curl-request.http');
        expect(result.stats.requestCount).toBe(1);
        expect(result.stats.fileCount).toBe(1);

        const request = firstRequest(result);
        expect(request?.method).toBe('GET');
        expect(request?.url).toBe('https://api.example.com/users');
        expect(request?.body).toBeUndefined();
      }
    },
    {
      name: 'preserves literal backslashes in double-quoted payload fixture',
      fixture: 'double-quoted-backslashes.sh',
      assert: (result) => {
        const request = firstRequest(result);
        expect(request?.method).toBe('POST');
        expect(request?.body).toBe('path\\to\\file\\nraw');
        expect(request?.headers?.['Content-Type']).toBe('application/x-www-form-urlencoded');
      }
    },
    {
      name: 'supports attached method/url/json option values fixture',
      fixture: 'attached-options-json.sh',
      assert: (result) => {
        const request = firstRequest(result);
        expect(request?.method).toBe('POST');
        expect(request?.url).toBe('https://api.example.com/users');
        expect(request?.body).toBe('{"name":"Ada"}');
        expect(request?.headers?.['Content-Type']).toBe('application/json');
        expect(request?.headers?.Accept).toBe('application/json');
      }
    },
    {
      name: 'supports fenced shell input with line continuations fixture',
      fixture: 'fenced-multiline.sh',
      assert: (result) => {
        const request = firstRequest(result);
        expect(request?.method).toBe('GET');
        expect(request?.url).toBe('https://api.example.com/users');
        expect(request?.headers?.['X-Test']).toBe('1');
      }
    },
    {
      name: 'does not treat unrelated --d* long flags as data flags fixture',
      fixture: 'unsupported-digest.sh',
      assert: (result) => {
        const request = firstRequest(result);
        expect(request?.method).toBe('GET');
        expect(request?.url).toBe('https://api.example.com/users');
        expect(request?.body).toBeUndefined();
        expect(
          result.diagnostics.some(
            (diagnostic) =>
              diagnostic.code === 'unsupported-option' && diagnostic.message.includes('--digest')
          )
        ).toBe(true);
      }
    },
    {
      name: 'emits warning when --get includes data file payloads fixture',
      fixture: 'get-data-file-warning.sh',
      assert: (result) => {
        const request = firstRequest(result);
        expect(request?.method).toBe('GET');
        expect(request?.url).toBe('https://api.example.com/search?q=hello');
        expect(
          result.diagnostics.some((diagnostic) => diagnostic.code === 'unsupported-data-file')
        ).toBe(true);
      }
    },
    {
      name: 'maps user-agent, referer, and cookie header flags fixture',
      fixture: 'header-flags.sh',
      assert: (result) => {
        const request = firstRequest(result);
        expect(request?.method).toBe('GET');
        expect(request?.url).toBe('https://api.example.com/users');
        expect(request?.headers?.['User-Agent']).toBe('my-agent/1.0');
        expect(request?.headers?.Referer).toBe('https://ref.example.com');
        expect(request?.headers?.Cookie).toBe('sid=abc; mode=test');
      }
    },
    {
      name: 'reports cookie file references as unsupported fixture',
      fixture: 'cookie-file.sh',
      assert: (result) => {
        const request = firstRequest(result);
        expect(request?.method).toBe('GET');
        expect(request?.url).toBe('https://api.example.com/users');
        expect(request?.headers?.Cookie).toBeUndefined();
        expect(
          result.diagnostics.some((diagnostic) => diagnostic.code === 'unsupported-cookie-file')
        ).toBe(true);
      }
    },
    {
      name: 'consumes ignored option values without positional spillover fixture',
      fixture: 'ignored-value-options.sh',
      assert: (result) => {
        const request = firstRequest(result);
        expect(request?.method).toBe('GET');
        expect(request?.url).toBe('https://api.example.com/users');
        expect(
          result.diagnostics.filter((diagnostic) => diagnostic.code === 'unsupported-option')
        ).toHaveLength(3);
        expect(
          result.diagnostics.some((diagnostic) => diagnostic.code === 'unexpected-argument')
        ).toBe(false);
      }
    },
    {
      name: 'ignores runtime transport flags without affecting request extraction fixture',
      fixture: 'runtime-flags.sh',
      assert: (result) => {
        const request = firstRequest(result);
        expect(request?.method).toBe('GET');
        expect(request?.url).toBe('https://api.example.com/users');
        expect(
          result.diagnostics.filter((diagnostic) => diagnostic.code === 'unsupported-option')
        ).toHaveLength(7);
        expect(
          result.diagnostics.some((diagnostic) => diagnostic.code === 'unexpected-argument')
        ).toBe(false);
      }
    }
  ];

  for (const fixtureCase of fixtureCases) {
    test(fixtureCase.name, async () => {
      const command = await readCurlFixture(fixtureCase.fixture);
      const result = convert(command);
      fixtureCase.assert(result);
    });
  }

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
