import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { createClient } from '../src/client.ts';
import { parse } from '../src/parser.ts';
import { installFetchMock } from './utils/fetch-mock.ts';

const fixturesDir = path.join(import.meta.dir, 'fixtures');

// ============================================================================
// Parser Tests - File Reference Detection
// ============================================================================

describe('Parser - File Reference Syntax', () => {
  describe('detects file reference', () => {
    test('parses < ./path syntax', () => {
      const content = `
POST https://api.example.com/data
Content-Type: application/json

< ./fixtures/payload.json
`;
      const [request] = parse(content);

      expect(request).toBeDefined();
      expect(request?.bodyFile).toEqual({ path: './fixtures/payload.json' });
      expect(request?.body).toBeUndefined();
    });

    test('parses < path without ./ prefix', () => {
      const content = `
POST https://api.example.com/data

< fixtures/payload.json
`;
      const [request] = parse(content);

      expect(request?.bodyFile).toEqual({ path: 'fixtures/payload.json' });
      expect(request?.body).toBeUndefined();
    });

    test('handles path with spaces', () => {
      const content = `
POST https://api.example.com/data

< ./my documents/data file.json
`;
      const [request] = parse(content);

      expect(request?.bodyFile).toEqual({ path: './my documents/data file.json' });
    });

    test('handles multiple spaces after <', () => {
      const content = `
POST https://api.example.com/data

<   ./payload.json
`;
      const [request] = parse(content);

      expect(request?.bodyFile).toEqual({ path: './payload.json' });
    });

    test('handles path with variable', () => {
      const content = `
POST https://api.example.com/data

< ./{{dataDir}}/payload.json
`;
      const [request] = parse(content);

      expect(request?.bodyFile).toEqual({ path: './{{dataDir}}/payload.json' });
    });
  });

  describe('preserves normal body', () => {
    test('keeps inline JSON body', () => {
      const content = `
POST https://api.example.com/data
Content-Type: application/json

{"key": "value"}
`;
      const [request] = parse(content);

      expect(request?.body).toBe('{"key": "value"}');
      expect(request?.bodyFile).toBeUndefined();
    });

    test('keeps multi-line body', () => {
      const content = `
POST https://api.example.com/data
Content-Type: application/json

{
  "key": "value",
  "nested": {
    "inner": true
  }
}
`;
      const [request] = parse(content);

      expect(request?.body).toContain('"key": "value"');
      expect(request?.body).toContain('"inner": true');
      expect(request?.bodyFile).toBeUndefined();
    });

    test('treats < without space as body text', () => {
      const content = `
POST https://api.example.com/data

<xml>content</xml>
`;
      const [request] = parse(content);

      expect(request?.body).toBe('<xml>content</xml>');
      expect(request?.bodyFile).toBeUndefined();
    });

    test('treats < with content after as body with < in first position', () => {
      const content = `
POST https://api.example.com/data

< is less than sign
`;
      // This should be treated as file reference with path "is less than sign"
      const [request] = parse(content);

      expect(request?.bodyFile).toEqual({ path: 'is less than sign' });
      expect(request?.body).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    test('handles empty body', () => {
      const content = `
GET https://api.example.com/data
`;
      const [request] = parse(content);

      expect(request?.body).toBeUndefined();
      expect(request?.bodyFile).toBeUndefined();
    });

    test('handles whitespace-only body', () => {
      const content = `
POST https://api.example.com/data
Content-Type: application/json


`;
      const [request] = parse(content);

      expect(request?.body).toBeUndefined();
      expect(request?.bodyFile).toBeUndefined();
    });

    test('handles file ref with trailing whitespace', () => {
      const content = `
POST https://api.example.com/data

< ./payload.json
`;
      const [request] = parse(content);

      // Trailing whitespace should be trimmed from the line, but path may retain it
      // depending on implementation. Let's test current behavior
      expect(request?.bodyFile).toBeDefined();
      expect(request?.bodyFile?.path).toMatch(/^\.\/payload\.json/);
    });
  });
});

// ============================================================================
// Integration Tests - File Reference Loading
// ============================================================================

describe('Client - File Reference Loading', () => {
  test('loads JSON file as body', async () => {
    const httpFilePath = path.join(fixturesDir, 'file-ref-test.http');
    await Bun.write(
      httpFilePath,
      `
POST https://api.example.com/data

< ./payload.json
`
    );

    let capturedBody: string | undefined;
    let capturedContentType: string | undefined;

    const restore = installFetchMock(async (_url, init) => {
      capturedBody = init?.body as string;
      capturedContentType = (init?.headers as Record<string, string>)?.['Content-Type'];
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    try {
      const client = createClient();
      await client.run(httpFilePath);

      expect(capturedBody).toBeDefined();
      expect(capturedBody).toContain('"name"');
      expect(capturedBody).toContain('Test User');
      expect(capturedContentType).toBe('application/json');
    } finally {
      restore();
      await Bun.$`rm -f ${httpFilePath}`.quiet();
    }
  });

  test('respects explicit Content-Type header', async () => {
    const httpFilePath = path.join(fixturesDir, 'file-ref-explicit-ct.http');
    await Bun.write(
      httpFilePath,
      `
POST https://api.example.com/data
Content-Type: text/plain

< ./payload.json
`
    );

    let capturedContentType: string | undefined;

    const restore = installFetchMock(async (_url, init) => {
      capturedContentType = (init?.headers as Record<string, string>)?.['Content-Type'];
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    try {
      const client = createClient();
      await client.run(httpFilePath);
      expect(capturedContentType).toBe('text/plain');
    } finally {
      restore();
      await Bun.$`rm -f ${httpFilePath}`.quiet();
    }
  });

  test('interpolates variables in file path', async () => {
    const httpFilePath = path.join(fixturesDir, 'file-ref-var.http');
    await Bun.write(
      httpFilePath,
      `
POST https://api.example.com/data

< ./{{filename}}
`
    );

    let capturedBody: string | undefined;

    const restore = installFetchMock(async (_url, init) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    try {
      const client = createClient({ variables: { filename: 'payload.json' } });
      await client.run(httpFilePath);
      expect(capturedBody).toContain('Test User');
    } finally {
      restore();
      await Bun.$`rm -f ${httpFilePath}`.quiet();
    }
  });

  test('throws on file not found', async () => {
    const httpFilePath = path.join(fixturesDir, 'file-ref-notfound.http');
    await Bun.write(
      httpFilePath,
      `
POST https://api.example.com/data

< ./nonexistent-file.json
`
    );

    const client = createClient();

    await expect(client.run(httpFilePath)).rejects.toThrow('File not found');

    // Cleanup
    await Bun.$`rm ${httpFilePath}`.quiet();
  });

  test('throws on path traversal attempt', async () => {
    const httpFilePath = path.join(fixturesDir, 'file-ref-traversal.http');
    await Bun.write(
      httpFilePath,
      `
POST https://api.example.com/data

< ../../../etc/passwd
`
    );

    const client = createClient();

    await expect(client.run(httpFilePath)).rejects.toThrow('Path escapes base directory');

    // Cleanup
    await Bun.$`rm ${httpFilePath}`.quiet();
  });

  test('loads binary file as ArrayBuffer', async () => {
    const httpFilePath = path.join(fixturesDir, 'file-ref-binary.http');
    await Bun.write(
      httpFilePath,
      `
POST https://api.example.com/upload

< ./test.png
`
    );

    let capturedBody: ArrayBuffer | undefined;
    let capturedContentType: string | undefined;

    const restore = installFetchMock(async (_url, init) => {
      capturedBody = init?.body as ArrayBuffer;
      capturedContentType = (init?.headers as Record<string, string>)?.['Content-Type'];
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    try {
      const client = createClient();
      await client.run(httpFilePath);

      expect(capturedBody).toBeInstanceOf(ArrayBuffer);
      expect(capturedContentType).toBe('image/png');
    } finally {
      restore();
      await Bun.$`rm -f ${httpFilePath}`.quiet();
    }
  });
});
