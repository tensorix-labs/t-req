import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { createClient } from '../src/client.ts';
import { buildFormData, buildUrlEncoded, hasFileFields } from '../src/form-data-builder.ts';
import { parse } from '../src/parser.ts';
import type { FormField } from '../src/types.ts';
import { installFetchMock } from './utils/fetch-mock.ts';

const fixturesDir = path.join(import.meta.dir, 'fixtures');

// ============================================================================
// Parser Tests - Form Body Detection
// ============================================================================

describe('Parser - Form Body Detection', () => {
  describe('detects form body', () => {
    test('parses single text field', () => {
      const content = `
POST https://api.example.com/login

username = john
`;
      const [request] = parse(content);

      expect(request).toBeDefined();
      expect(request?.formData).toBeDefined();
      expect(request?.formData).toHaveLength(1);
      expect(request?.formData?.[0]).toEqual({
        name: 'username',
        value: 'john',
        isFile: false
      });
      expect(request?.body).toBeUndefined();
    });

    test('parses multiple text fields', () => {
      const content = `
POST https://api.example.com/login

username = john
password = secret123
remember = true
`;
      const [request] = parse(content);

      expect(request?.formData).toHaveLength(3);
      expect(request?.formData?.[0]).toEqual({
        name: 'username',
        value: 'john',
        isFile: false
      });
      expect(request?.formData?.[1]).toEqual({
        name: 'password',
        value: 'secret123',
        isFile: false
      });
      expect(request?.formData?.[2]).toEqual({
        name: 'remember',
        value: 'true',
        isFile: false
      });
    });

    test('parses field=value without spaces', () => {
      const content = `
POST https://api.example.com/login

username=john
password=secret
`;
      const [request] = parse(content);

      expect(request?.formData).toHaveLength(2);
      expect(request?.formData?.[0]?.name).toBe('username');
      expect(request?.formData?.[0]?.value).toBe('john');
    });

    test('parses field = value with extra spaces', () => {
      const content = `
POST https://api.example.com/data

title   =   My Document Title
`;
      const [request] = parse(content);

      expect(request?.formData).toHaveLength(1);
      expect(request?.formData?.[0]?.name).toBe('title');
      expect(request?.formData?.[0]?.value).toBe('My Document Title');
    });

    test('parses file field with @./path', () => {
      const content = `
POST https://api.example.com/upload

document = @./reports/q4.pdf
`;
      const [request] = parse(content);

      expect(request?.formData).toHaveLength(1);
      expect(request?.formData?.[0]).toEqual({
        name: 'document',
        value: '',
        isFile: true,
        path: './reports/q4.pdf',
        filename: undefined
      });
    });

    test('parses file field with custom filename', () => {
      const content = `
POST https://api.example.com/upload

document = @./temp-12345.pdf | annual-report.pdf
`;
      const [request] = parse(content);

      expect(request?.formData).toHaveLength(1);
      expect(request?.formData?.[0]).toEqual({
        name: 'document',
        value: '',
        isFile: true,
        path: './temp-12345.pdf',
        filename: 'annual-report.pdf'
      });
    });

    test('parses mixed text and file fields', () => {
      const content = `
POST https://api.example.com/upload

title = Quarterly Report
description = Q4 2025 summary
document = @./reports/q4.pdf
`;
      const [request] = parse(content);

      expect(request?.formData).toHaveLength(3);
      expect(request?.formData?.[0]?.isFile).toBe(false);
      expect(request?.formData?.[1]?.isFile).toBe(false);
      expect(request?.formData?.[2]?.isFile).toBe(true);
    });

    test('parses variable in file path', () => {
      const content = `
POST https://api.example.com/upload

document = @{{dataDir}}/file.pdf
`;
      const [request] = parse(content);

      expect(request?.formData).toHaveLength(1);
      expect(request?.formData?.[0]?.isFile).toBe(true);
      expect(request?.formData?.[0]?.path).toBe('{{dataDir}}/file.pdf');
    });
  });

  describe('handles edge cases', () => {
    test('handles equals in value', () => {
      const content = `
POST https://api.example.com/data

equation = 1 + 1 = 2
`;
      const [request] = parse(content);

      expect(request?.formData).toHaveLength(1);
      expect(request?.formData?.[0]?.name).toBe('equation');
      expect(request?.formData?.[0]?.value).toBe('1 + 1 = 2');
    });

    test('handles empty value', () => {
      const content = `
POST https://api.example.com/data

optional =
`;
      const [request] = parse(content);

      expect(request?.formData).toHaveLength(1);
      expect(request?.formData?.[0]?.name).toBe('optional');
      expect(request?.formData?.[0]?.value).toBe('');
    });

    test('handles email (@ not followed by ./)', () => {
      const content = `
POST https://api.example.com/register

email = user@example.com
`;
      const [request] = parse(content);

      expect(request?.formData).toHaveLength(1);
      expect(request?.formData?.[0]?.isFile).toBe(false);
      expect(request?.formData?.[0]?.value).toBe('user@example.com');
    });

    test('handles file path with spaces', () => {
      const content = `
POST https://api.example.com/upload

document = @./my documents/report.pdf
`;
      const [request] = parse(content);

      expect(request?.formData?.[0]?.path).toBe('./my documents/report.pdf');
    });
  });

  describe('preserves non-form body', () => {
    test('keeps JSON body', () => {
      const content = `
POST https://api.example.com/data
Content-Type: application/json

{"key": "value"}
`;
      const [request] = parse(content);

      expect(request?.body).toBe('{"key": "value"}');
      expect(request?.formData).toBeUndefined();
    });

    test('keeps multi-line JSON body', () => {
      const content = `
POST https://api.example.com/data
Content-Type: application/json

{
  "key": "value"
}
`;
      const [request] = parse(content);

      expect(request?.body).toContain('"key"');
      expect(request?.formData).toBeUndefined();
    });

    test('respects explicit Content-Type', () => {
      const content = `
POST https://api.example.com/data
Content-Type: text/plain

field = value
`;
      const [request] = parse(content);

      // With explicit text/plain, should NOT be parsed as form
      expect(request?.body).toBe('field = value');
      expect(request?.formData).toBeUndefined();
    });

    test('empty body is not form', () => {
      const content = `
POST https://api.example.com/data
`;
      const [request] = parse(content);

      expect(request?.body).toBeUndefined();
      expect(request?.formData).toBeUndefined();
    });

    test('whitespace-only body is not form', () => {
      const content = `
POST https://api.example.com/data



`;
      const [request] = parse(content);

      expect(request?.body).toBeUndefined();
      expect(request?.formData).toBeUndefined();
    });
  });
});

// ============================================================================
// Form Data Builder Tests
// ============================================================================

describe('Form Data Builder', () => {
  describe('hasFileFields', () => {
    test('returns true when file fields present', () => {
      const fields: FormField[] = [
        { name: 'title', value: 'Test', isFile: false },
        { name: 'doc', value: '', isFile: true, path: './file.pdf' }
      ];
      expect(hasFileFields(fields)).toBe(true);
    });

    test('returns false when no file fields', () => {
      const fields: FormField[] = [
        { name: 'username', value: 'john', isFile: false },
        { name: 'password', value: 'secret', isFile: false }
      ];
      expect(hasFileFields(fields)).toBe(false);
    });

    test('returns false for empty array', () => {
      expect(hasFileFields([])).toBe(false);
    });
  });

  describe('buildUrlEncoded', () => {
    test('builds URLSearchParams from text fields', () => {
      const fields: FormField[] = [
        { name: 'username', value: 'john', isFile: false },
        { name: 'password', value: 'secret', isFile: false }
      ];
      const params = buildUrlEncoded(fields);

      expect(params.get('username')).toBe('john');
      expect(params.get('password')).toBe('secret');
      expect(params.toString()).toBe('username=john&password=secret');
    });

    test('handles empty values', () => {
      const fields: FormField[] = [{ name: 'optional', value: '', isFile: false }];
      const params = buildUrlEncoded(fields);

      expect(params.get('optional')).toBe('');
    });

    test('handles special characters', () => {
      const fields: FormField[] = [
        { name: 'query', value: 'hello world', isFile: false },
        { name: 'special', value: 'a=b&c=d', isFile: false }
      ];
      const params = buildUrlEncoded(fields);

      expect(params.get('query')).toBe('hello world');
      expect(params.get('special')).toBe('a=b&c=d');
    });

    test('skips file fields', () => {
      const fields: FormField[] = [
        { name: 'text', value: 'hello', isFile: false },
        { name: 'file', value: '', isFile: true, path: './test.pdf' }
      ];
      const params = buildUrlEncoded(fields);

      expect(params.get('text')).toBe('hello');
      expect(params.get('file')).toBeNull();
    });
  });

  describe('buildFormData', () => {
    test('builds FormData with text fields', async () => {
      const fields: FormField[] = [
        { name: 'title', value: 'Test Title', isFile: false },
        { name: 'description', value: 'A description', isFile: false }
      ];
      const formData = await buildFormData(fields);

      expect(formData.get('title')).toBe('Test Title');
      expect(formData.get('description')).toBe('A description');
    });

    test('builds FormData with file upload', async () => {
      const fields: FormField[] = [
        { name: 'document', value: '', isFile: true, path: './payload.json' }
      ];
      const formData = await buildFormData(fields, { basePath: fixturesDir });

      const file = formData.get('document') as Blob;
      expect(file).toBeInstanceOf(Blob);
      expect(file.type).toContain('application/json');

      // Read the content
      const content = await file.text();
      expect(content).toContain('Test User');
    });

    test('uses custom filename when provided', async () => {
      const fields: FormField[] = [
        {
          name: 'document',
          value: '',
          isFile: true,
          path: './payload.json',
          filename: 'custom-name.json'
        }
      ];
      const formData = await buildFormData(fields, { basePath: fixturesDir });

      // The filename should be custom-name.json
      // We can verify this by checking the formData entries
      const entries = Array.from(formData.entries());
      expect(entries).toHaveLength(1);
      expect(entries[0]?.[0]).toBe('document');
    });

    test('builds FormData with mixed fields', async () => {
      const fields: FormField[] = [
        { name: 'title', value: 'Report', isFile: false },
        { name: 'document', value: '', isFile: true, path: './sample.txt' }
      ];
      const formData = await buildFormData(fields, { basePath: fixturesDir });

      expect(formData.get('title')).toBe('Report');
      const file = formData.get('document') as Blob;
      expect(file).toBeInstanceOf(Blob);
    });

    test('throws on file not found', async () => {
      const fields: FormField[] = [
        { name: 'document', value: '', isFile: true, path: './nonexistent.pdf' }
      ];

      await expect(buildFormData(fields, { basePath: fixturesDir })).rejects.toThrow(
        'File not found'
      );
    });

    test('throws on path traversal', async () => {
      const fields: FormField[] = [
        { name: 'document', value: '', isFile: true, path: '../../../etc/passwd' }
      ];

      await expect(buildFormData(fields, { basePath: fixturesDir })).rejects.toThrow(
        'Path escapes base directory'
      );
    });
  });
});

// ============================================================================
// Client Integration Tests
// ============================================================================

describe('Client - Form Data Handling', () => {
  test('submits URL-encoded form', async () => {
    const httpFilePath = path.join(fixturesDir, 'form-urlencoded.http');
    await Bun.write(
      httpFilePath,
      `
POST https://api.example.com/login

username = john
password = secret123
`
    );

    let capturedBody: URLSearchParams | undefined;
    let capturedContentType: string | undefined;

    const restore = installFetchMock(async (_url, init) => {
      capturedBody = init?.body as URLSearchParams;
      capturedContentType = (init?.headers as Record<string, string>)?.['Content-Type'];
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    try {
      const client = createClient();
      await client.run(httpFilePath);

      expect(capturedBody).toBeInstanceOf(URLSearchParams);
      expect(capturedBody?.get('username')).toBe('john');
      expect(capturedBody?.get('password')).toBe('secret123');
      expect(capturedContentType).toBe('application/x-www-form-urlencoded');
    } finally {
      restore();
      await Bun.$`rm -f ${httpFilePath}`.quiet();
    }
  });

  test('submits multipart form with file', async () => {
    const httpFilePath = path.join(fixturesDir, 'form-multipart.http');
    await Bun.write(
      httpFilePath,
      `
POST https://api.example.com/upload

title = Test Document
document = @./payload.json
`
    );

    let capturedBody: FormData | undefined;
    let capturedContentType: string | undefined;

    const restore = installFetchMock(async (_url, init) => {
      capturedBody = init?.body as FormData;
      capturedContentType = (init?.headers as Record<string, string>)?.['Content-Type'];
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    try {
      const client = createClient();
      await client.run(httpFilePath);

      expect(capturedBody).toBeInstanceOf(FormData);
      expect(capturedBody?.get('title')).toBe('Test Document');

      const file = capturedBody?.get('document') as Blob;
      expect(file).toBeInstanceOf(Blob);

      // Content-Type should be removed to let fetch set boundary
      expect(capturedContentType).toBeUndefined();
    } finally {
      restore();
      await Bun.$`rm -f ${httpFilePath}`.quiet();
    }
  });

  test('interpolates variables in form fields', async () => {
    const httpFilePath = path.join(fixturesDir, 'form-vars.http');
    await Bun.write(
      httpFilePath,
      `
POST https://api.example.com/login

username = {{user}}
password = {{pass}}
`
    );

    let capturedBody: URLSearchParams | undefined;

    const restore = installFetchMock(async (_url, init) => {
      capturedBody = init?.body as URLSearchParams;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    try {
      const client = createClient({
        variables: { user: 'alice', pass: 'password123' }
      });
      await client.run(httpFilePath);

      expect(capturedBody?.get('username')).toBe('alice');
      expect(capturedBody?.get('password')).toBe('password123');
    } finally {
      restore();
      await Bun.$`rm -f ${httpFilePath}`.quiet();
    }
  });

  test('interpolates variable in file path', async () => {
    const httpFilePath = path.join(fixturesDir, 'form-file-var.http');
    await Bun.write(
      httpFilePath,
      `
POST https://api.example.com/upload

document = @./{{filename}}
`
    );

    let capturedBody: FormData | undefined;

    const restore = installFetchMock(async (_url, init) => {
      capturedBody = init?.body as FormData;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    try {
      const client = createClient({
        variables: { filename: 'payload.json' }
      });
      await client.run(httpFilePath);

      const file = capturedBody?.get('document') as Blob;
      expect(file).toBeInstanceOf(Blob);
      const content = await file.text();
      expect(content).toContain('Test User');
    } finally {
      restore();
      await Bun.$`rm -f ${httpFilePath}`.quiet();
    }
  });

  test('interpolates variable in custom filename', async () => {
    const httpFilePath = path.join(fixturesDir, 'form-custom-filename-var.http');
    await Bun.write(
      httpFilePath,
      `
POST https://api.example.com/upload

document = @./payload.json | {{customName}}.json
`
    );

    let capturedBody: FormData | undefined;

    const restore = installFetchMock(async (_url, init) => {
      capturedBody = init?.body as FormData;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    try {
      const client = createClient({
        variables: { customName: 'user-data' }
      });
      await client.run(httpFilePath);

      expect(capturedBody).toBeInstanceOf(FormData);
    } finally {
      restore();
      await Bun.$`rm -f ${httpFilePath}`.quiet();
    }
  });

  test('throws on file not found in form', async () => {
    const httpFilePath = path.join(fixturesDir, 'form-notfound.http');
    await Bun.write(
      httpFilePath,
      `
POST https://api.example.com/upload

document = @./nonexistent.pdf
`
    );

    try {
      const client = createClient();
      await expect(client.run(httpFilePath)).rejects.toThrow('File not found');
    } finally {
      await Bun.$`rm -f ${httpFilePath}`.quiet();
    }
  });

  test('throws on path traversal in form file', async () => {
    const httpFilePath = path.join(fixturesDir, 'form-traversal.http');
    await Bun.write(
      httpFilePath,
      `
POST https://api.example.com/upload

document = @./../../etc/passwd
`
    );

    try {
      const client = createClient();
      await expect(client.run(httpFilePath)).rejects.toThrow('Path escapes base directory');
    } finally {
      await Bun.$`rm -f ${httpFilePath}`.quiet();
    }
  });
});
