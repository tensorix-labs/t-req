import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import {
  convertPostmanCollection,
  createPostmanImporter,
  type PostmanConvertOptions
} from '../../src/import/postman.ts';
import type { ImportResult } from '../../src/import/types.ts';
import type { SerializableRequest } from '../../src/serializer.ts';

const fixturesDir = path.join(import.meta.dir, '../fixtures/postman');

async function readFixture(name: string): Promise<string> {
  return await Bun.file(path.join(fixturesDir, name)).text();
}

function flattenRequests(result: ImportResult): SerializableRequest[] {
  return result.files.flatMap((file) => file.document.requests);
}

function getRequest(result: ImportResult, name: string): SerializableRequest | undefined {
  return flattenRequests(result).find((request) => request.name === name);
}

async function convertFixture(
  name: string,
  options?: PostmanConvertOptions
): Promise<ImportResult> {
  return convertPostmanCollection(await readFixture(name), options);
}

describe('convertPostmanCollection', () => {
  test('converts a basic collection with default request-per-file strategy', async () => {
    const result = await convertFixture('basic.json');

    expect(result.name).toBe('Basic Collection');
    expect(result.variables).toEqual({
      baseUrl: 'api.example.com',
      apiVersion: 'v1'
    });
    expect(result.stats.requestCount).toBe(2);
    expect(result.stats.fileCount).toBe(2);
    expect(result.files.map((file) => file.relativePath)).toEqual([
      'users-api/list-users.http',
      'users-api/create-user.http'
    ]);

    const listUsers = getRequest(result, 'List Users');
    expect(listUsers?.method).toBe('GET');
    expect(listUsers?.name).toBe('List Users');
    expect(listUsers?.url).toBe('https://{{baseUrl}}/{{apiVersion}}/users');
    expect(listUsers?.description).toBe('Fetch all users');

    const createUser = getRequest(result, 'Create User');
    expect(createUser?.body).toBe('{"name":"Ada"}');
    expect(createUser?.headers?.['Content-Type']).toBe('application/json');
    expect(result.diagnostics).toHaveLength(0);
  });

  test('converts all supported body modes', async () => {
    const result = await convertFixture('body-modes.json');

    const raw = getRequest(result, 'Raw JSON');
    expect(raw?.body).toBe('{"hello":"world"}');
    expect(raw?.headers?.['Content-Type']).toBe('application/json');

    const urlencoded = getRequest(result, 'Urlencoded Form');
    expect(urlencoded?.formData).toEqual([
      { name: 'username', value: 'john', isFile: false },
      { name: 'password', value: 'secret', isFile: false }
    ]);

    const formData = getRequest(result, 'Multipart Form');
    expect(formData?.formData).toEqual([
      { name: 'title', value: 'Quarterly Report', isFile: false },
      {
        name: 'document',
        value: '',
        isFile: true,
        path: './uploads/report.pdf'
      }
    ]);

    const graphql = getRequest(result, 'GraphQL Query');
    expect(graphql?.headers?.['Content-Type']).toBe('application/json');
    expect(JSON.parse(graphql?.body ?? '{}')).toEqual({
      query: 'query Users($limit: Int!) { users(limit: $limit) { id name } }',
      variables: { limit: 10 }
    });

    const fileUpload = getRequest(result, 'File Upload');
    expect(fileUpload?.bodyFile).toEqual({ path: './payload.bin' });

    const fileMissing = getRequest(result, 'File Missing');
    expect(fileMissing?.bodyFile).toEqual({ path: './file' });
    expect(result.diagnostics.some((diag) => diag.code === 'missing-file')).toBe(true);
  });

  test('applies auth cascade and auth conversions', async () => {
    const result = await convertFixture('auth-cascade.json');

    expect(getRequest(result, 'Root Inherited')?.headers?.['Authorization']).toBe(
      'Bearer collectionToken'
    );
    expect(getRequest(result, 'Folder Inherited')?.headers?.['X-Folder-Key']).toBe('folderValue');
    expect(getRequest(result, 'Basic Override')?.headers?.['Authorization']).toBe(
      'Basic dXNlcjpwYXNz'
    );
    expect(getRequest(result, 'Templated Basic')?.headers?.['Authorization']).toBeUndefined();
    expect(getRequest(result, 'No Auth')?.headers?.['X-Folder-Key']).toBeUndefined();
    expect(getRequest(result, 'ApiKey Query')?.url).toBe(
      'https://api.example.com/query?api_key=k123'
    );
    expect(getRequest(result, 'Unsupported Auth')?.headers?.['Authorization']).toBeUndefined();

    const codes = result.diagnostics.map((diag) => diag.code);
    expect(codes).toContain('templated-basic-auth');
    expect(codes).toContain('unsupported-auth');
  });

  test('supports nested folder conversion with request-per-file strategy', async () => {
    const result = await convertFixture('nested-folders.json');

    expect(result.stats.requestCount).toBe(5);
    expect(result.files.map((file) => file.relativePath)).toEqual([
      'root-request.http',
      'level-one/one-request.http',
      'level-one/level-two/two-request.http',
      'level-one/level-two/level-three/deep-one.http',
      'level-one/level-two/level-three/deep-two.http'
    ]);
  });

  test('supports nested folder conversion with folder-per-file strategy', async () => {
    const result = await convertFixture('nested-folders.json', {
      fileStrategy: 'folder-per-file'
    });

    expect(result.stats.requestCount).toBe(5);
    expect(result.stats.fileCount).toBe(4);
    expect(result.files.map((file) => file.relativePath)).toEqual([
      'nested-folders.http',
      'level-one.http',
      'level-one/level-two.http',
      'level-one/level-two/level-three.http'
    ]);
    expect(result.files.map((file) => file.document.requests.length)).toEqual([1, 1, 1, 2]);
  });

  test('extracts variables and reports ignored scripts', async () => {
    const result = await convertFixture('variables-and-scripts.json');

    expect(result.variables).toEqual({
      host: 'api.example.com',
      token: 'abc123'
    });

    const scriptDiagnostics = result.diagnostics.filter((diag) => diag.code === 'script-ignored');
    expect(scriptDiagnostics).toHaveLength(4);
    expect(scriptDiagnostics.every((diag) => diag.severity === 'info')).toBe(true);
  });

  test('skips disabled items by default and reports when reportDisabled is true', async () => {
    const defaultResult = await convertFixture('disabled-items.json');
    expect(defaultResult.stats.requestCount).toBe(1);
    expect(defaultResult.diagnostics.some((diag) => diag.code === 'disabled-item')).toBe(false);

    const activeDefault = getRequest(defaultResult, 'Active Request');
    expect(activeDefault?.headers?.['X-Disabled']).toBeUndefined();
    expect(activeDefault?.url).toBe('https://api.example.com/users?enabled=1');
    expect(activeDefault?.formData).toEqual([{ name: 'active', value: 'yes', isFile: false }]);

    const reportResult = await convertFixture('disabled-items.json', { reportDisabled: true });
    const disabledDiagnostics = reportResult.diagnostics.filter(
      (diag) => diag.code === 'disabled-item'
    );
    expect(disabledDiagnostics).toHaveLength(4);
  });

  test('converts Postman :path variables to {{path}} placeholders', async () => {
    const result = await convertFixture('path-variables.json');

    expect(getRequest(result, 'Object Path Variables')?.url).toBe(
      'https://api.example.com/users/{{userId}}/posts/{{postId}}?expand=comments'
    );
    expect(getRequest(result, 'Raw Path Variables')?.url).toBe(
      'https://api.example.com/orgs/{{orgId}}/members/{{memberId}}'
    );
  });

  test('returns error diagnostic for invalid JSON input', () => {
    const result = convertPostmanCollection('{ invalid json');
    expect(result.files).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('invalid-json');
    expect(result.diagnostics[0]?.severity).toBe('error');
  });

  test('creates importer instances with postman source', () => {
    const importerA = createPostmanImporter();
    const importerB = createPostmanImporter();

    expect(importerA.source).toBe('postman');
    expect(importerA.convert).toBe(convertPostmanCollection);
    expect(importerA).not.toBe(importerB);
  });
});
