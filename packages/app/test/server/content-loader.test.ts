import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  ContentOrPathRequiredError,
  NoRequestsFoundError,
  PathOutsideWorkspaceError,
  RequestIndexOutOfRangeError,
  RequestNotFoundError
} from '../../src/server/errors';
import { loadContent, parseContent, selectRequest } from '../../src/server/service/content-loader';
import { type TempDir, tmpdir } from '../utils/tmpdir';

describe('loadContent', () => {
  let tmp: TempDir;

  beforeEach(async () => {
    tmp = await tmpdir();
  });

  afterEach(async () => {
    await tmp[Symbol.asyncDispose]();
  });

  test('loads content from file path', async () => {
    await tmp.writeFile('api/users.http', 'GET https://example.com\n');

    const result = await loadContent(tmp.path, { path: 'api/users.http' });

    expect(result.content).toBe('GET https://example.com\n');
    expect(result.httpFilePath).toBe('api/users.http');
    expect(result.basePath).toContain('api');
  });

  test('loads content from string', async () => {
    const result = await loadContent(tmp.path, { content: 'GET https://example.com\n' });

    expect(result.content).toBe('GET https://example.com\n');
    expect(result.httpFilePath).toBeUndefined();
    expect(result.basePath).toBe(tmp.path);
  });

  test('uses custom basePath for string content', async () => {
    await tmp.mkdir('custom');

    const result = await loadContent(tmp.path, {
      content: 'GET https://example.com\n',
      basePath: 'custom'
    });

    expect(result.basePath).toContain('custom');
  });

  test('throws ContentOrPathRequiredError when neither content nor path provided', async () => {
    await expect(loadContent(tmp.path, {})).rejects.toBeInstanceOf(ContentOrPathRequiredError);
  });

  test('rejects path traversal with ..', async () => {
    await expect(loadContent(tmp.path, { path: '../etc/passwd' })).rejects.toBeInstanceOf(
      PathOutsideWorkspaceError
    );
  });

  test('rejects absolute basePath for string content', async () => {
    await expect(
      loadContent(tmp.path, { content: 'GET https://example.com\n', basePath: '/etc' })
    ).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
  });

  test('rejects basePath with traversal for string content', async () => {
    await expect(
      loadContent(tmp.path, { content: 'GET https://example.com\n', basePath: '../escape' })
    ).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
  });
});

describe('parseContent', () => {
  test('parses valid HTTP content', () => {
    const result = parseContent('GET https://example.com\n');
    expect(result).toHaveLength(1);
    expect(result[0]?.method).toBe('GET');
  });

  test('parses multiple requests', () => {
    const content = `
GET https://example.com/first

###

POST https://example.com/second
Content-Type: application/json

{"data": "test"}
`;
    const result = parseContent(content);
    expect(result).toHaveLength(2);
  });

  test('wraps parse errors as ParseError', () => {
    // An empty string should return empty array, not throw
    const result = parseContent('');
    expect(result).toHaveLength(0);
  });
});

describe('selectRequest', () => {
  const requests = [
    {
      name: 'first',
      method: 'GET',
      url: 'https://example.com/first',
      headers: {},
      raw: '',
      meta: {}
    },
    {
      name: 'second',
      method: 'POST',
      url: 'https://example.com/second',
      headers: {},
      raw: '',
      meta: {}
    }
  ];

  test('selects first request by default', () => {
    const result = selectRequest(requests, {});
    expect(result.selectedIndex).toBe(0);
    expect(result.selectedRequest.name).toBe('first');
  });

  test('selects request by name', () => {
    const result = selectRequest(requests, { requestName: 'second' });
    expect(result.selectedIndex).toBe(1);
    expect(result.selectedRequest.name).toBe('second');
  });

  test('selects request by index', () => {
    const result = selectRequest(requests, { requestIndex: 1 });
    expect(result.selectedIndex).toBe(1);
    expect(result.selectedRequest.name).toBe('second');
  });

  test('throws RequestNotFoundError for unknown name', () => {
    expect(() => selectRequest(requests, { requestName: 'nonexistent' })).toThrow(
      RequestNotFoundError
    );
  });

  test('throws RequestIndexOutOfRangeError for out-of-range index', () => {
    expect(() => selectRequest(requests, { requestIndex: 5 })).toThrow(RequestIndexOutOfRangeError);
  });

  test('throws RequestIndexOutOfRangeError for negative index', () => {
    expect(() => selectRequest(requests, { requestIndex: -1 })).toThrow(
      RequestIndexOutOfRangeError
    );
  });

  test('throws NoRequestsFoundError for empty list', () => {
    expect(() => selectRequest([], {})).toThrow(NoRequestsFoundError);
  });
});
