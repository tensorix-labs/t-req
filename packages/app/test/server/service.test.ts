import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  ContentOrPathRequiredError,
  FileNotFoundError,
  NoRequestsFoundError,
  PathOutsideWorkspaceError,
  RequestIndexOutOfRangeError,
  RequestNotFoundError,
  SessionNotFoundError,
  ValidationError
} from '../../src/server/errors';
import { createService, type Service } from '../../src/server/service';
import { installFetchMock, mockResponse } from '../utils/fetch-mock';
import { type TempDir, tmpdir } from '../utils/tmpdir';

describe('service.parse', () => {
  let tmp: TempDir;
  let service: Service;
  let restoreFetch: () => void;

  beforeEach(async () => {
    tmp = await tmpdir();
    service = createService({
      workspaceRoot: tmp.path,
      maxBodyBytes: 1024 * 1024,
      maxSessions: 10
    });
    restoreFetch = installFetchMock(async () => mockResponse({ success: true }));
  });

  afterEach(async () => {
    service.dispose();
    restoreFetch();
    await tmp[Symbol.asyncDispose]();
  });

  test('should parse content from string', async () => {
    const result = await service.parse({
      content: 'GET https://api.example.com/users\n',
      includeDiagnostics: false
    });

    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]?.request?.method).toBe('GET');
    expect(result.requests[0]?.request?.url).toBe('https://api.example.com/users');
    expect(result.requests[0]?.request?.index).toBe(0);
  });

  test('should parse content from file path', async () => {
    await tmp.writeFile(
      'api/users.http',
      'POST https://api.example.com/users\nContent-Type: application/json\n\n{"name": "test"}'
    );

    const result = await service.parse({ path: 'api/users.http', includeDiagnostics: false });

    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]?.request?.method).toBe('POST');
    expect(result.requests[0]?.request?.hasBody).toBe(true);
    expect(result.resolved.httpFilePath).toBe('api/users.http');
  });

  test('should reject when neither content nor path provided', async () => {
    await expect(service.parse({ includeDiagnostics: false })).rejects.toBeInstanceOf(
      ContentOrPathRequiredError
    );
  });

  test('should reject paths with .. traversal segments', async () => {
    await expect(
      service.parse({ path: '../etc/passwd', includeDiagnostics: false })
    ).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
  });

  test('should reject absolute paths', async () => {
    await expect(
      service.parse({ path: '/etc/passwd', includeDiagnostics: false })
    ).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
  });

  test('should parse multiple requests', async () => {
    const content = `
# @name first
GET https://api.example.com/first

###

# @name second
POST https://api.example.com/second
Content-Type: application/json

{"data": "test"}
`;
    const result = await service.parse({ content, includeDiagnostics: false });

    expect(result.requests).toHaveLength(2);
    expect(result.requests[0]?.request?.name).toBe('first');
    expect(result.requests[1]?.request?.name).toBe('second');
  });

  test('should detect form data presence', async () => {
    const content = `
POST https://api.example.com/upload
Content-Type: multipart/form-data; boundary=boundary

--boundary
Content-Disposition: form-data; name="file"; filename="test.txt"
Content-Type: text/plain

test content
--boundary--
`;
    const result = await service.parse({ content, includeDiagnostics: false });

    expect(result.requests[0]?.request?.hasFormData).toBe(true);
  });

  test('should include resolved paths in response', async () => {
    const result = await service.parse({
      content: 'GET https://example.com\n',
      includeDiagnostics: false
    });

    expect(result.resolved.workspaceRoot).toBe(tmp.path);
    expect(result.resolved.basePath).toBe(tmp.path);
  });
});

describe('service.execute', () => {
  let tmp: TempDir;
  let service: Service;
  let restoreFetch: () => void;
  let fetchCalls: Array<{ url: string; init?: RequestInit }>;

  beforeEach(async () => {
    tmp = await tmpdir();
    fetchCalls = [];
    service = createService({
      workspaceRoot: tmp.path,
      maxBodyBytes: 1024 * 1024,
      maxSessions: 10
    });
    restoreFetch = installFetchMock(async (url, init) => {
      fetchCalls.push({ url: url.toString(), init });
      return mockResponse({ id: 1, name: 'Test User' }, { status: 200 });
    });
  });

  afterEach(async () => {
    service.dispose();
    restoreFetch();
    await tmp[Symbol.asyncDispose]();
  });

  test('should execute request from content', async () => {
    const result = await service.execute({
      content: 'GET https://api.example.com/users/1\n'
    });

    expect(result.response.status).toBe(200);
    expect(result.request.method).toBe('GET');
    expect(result.request.url).toBe('https://api.example.com/users/1');
    expect(fetchCalls).toHaveLength(1);
  });

  test('should execute request from file path', async () => {
    await tmp.writeFile('users.http', 'GET https://api.example.com/users\n');

    const result = await service.execute({ path: 'users.http' });

    expect(result.response.status).toBe(200);
    expect(result.resolved.httpFilePath).toBe('users.http');
  });

  test('should reject when neither content nor path provided', async () => {
    await expect(service.execute({})).rejects.toBeInstanceOf(ContentOrPathRequiredError);
  });

  test('should reject paths with traversal', async () => {
    await expect(service.execute({ path: '../secret.http' })).rejects.toBeInstanceOf(
      PathOutsideWorkspaceError
    );
  });

  test('should reject absolute basePath', async () => {
    await expect(
      service.execute({
        content: 'GET https://example.com\n',
        basePath: '/etc'
      })
    ).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
  });

  test('should reject basePath with traversal', async () => {
    await expect(
      service.execute({
        content: 'GET https://example.com\n',
        basePath: '../outside'
      })
    ).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
  });

  test('should select request by name', async () => {
    const content = `
# @name first
GET https://api.example.com/first

###

# @name second
GET https://api.example.com/second
`;
    const result = await service.execute({
      content,
      requestName: 'second'
    });

    expect(result.request.name).toBe('second');
    expect(result.request.index).toBe(1);
  });

  test('should select request by index', async () => {
    const content = `
GET https://api.example.com/first

###

GET https://api.example.com/second
`;
    const result = await service.execute({
      content,
      requestIndex: 1
    });

    expect(result.request.index).toBe(1);
    expect(result.request.url).toBe('https://api.example.com/second');
  });

  test('should throw when request name not found', async () => {
    const content = `
# @name first
GET https://api.example.com/first
`;
    await expect(
      service.execute({
        content,
        requestName: 'nonexistent'
      })
    ).rejects.toBeInstanceOf(RequestNotFoundError);
  });

  test('should throw when request index out of range', async () => {
    const content = 'GET https://api.example.com/first\n';

    await expect(
      service.execute({
        content,
        requestIndex: 5
      })
    ).rejects.toBeInstanceOf(RequestIndexOutOfRangeError);
  });

  test('should throw when no requests found', async () => {
    await expect(
      service.execute({
        content: '# Just a comment\n'
      })
    ).rejects.toBeInstanceOf(NoRequestsFoundError);
  });

  test('should interpolate variables', async () => {
    const content = 'GET {{baseUrl}}/users/{{userId}}\n';

    await service.execute({
      content,
      variables: {
        baseUrl: 'https://api.example.com',
        userId: '42'
      }
    });

    expect(fetchCalls[0]?.url).toBe('https://api.example.com/users/42');
  });

  test('should return timing information', async () => {
    const result = await service.execute({
      content: 'GET https://api.example.com\n'
    });

    expect(result.timing.startTime).toBeDefined();
    expect(result.timing.endTime).toBeDefined();
    expect(result.timing.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('should include response body', async () => {
    const result = await service.execute({
      content: 'GET https://api.example.com\n'
    });

    expect(result.response.body).toBeDefined();
    expect(result.response.bodyMode).toBe('buffered');
    expect(result.response.encoding).toBe('utf-8');
  });

  test('should generate unique runId', async () => {
    const result1 = await service.execute({ content: 'GET https://example.com\n' });
    const result2 = await service.execute({ content: 'GET https://example.com\n' });

    expect(result1.runId).toBeDefined();
    expect(result2.runId).toBeDefined();
    expect(result1.runId).not.toBe(result2.runId);
  });
});

describe('service session CRUD', () => {
  let tmp: TempDir;
  let service: Service;
  let restoreFetch: () => void;

  beforeEach(async () => {
    tmp = await tmpdir();
    service = createService({
      workspaceRoot: tmp.path,
      maxBodyBytes: 1024 * 1024,
      maxSessions: 10
    });
    restoreFetch = installFetchMock(async () => mockResponse({ success: true }));
  });

  afterEach(async () => {
    service.dispose();
    restoreFetch();
    await tmp[Symbol.asyncDispose]();
  });

  test('should create session with unique ID', () => {
    const result1 = service.createSession({});
    const result2 = service.createSession({});

    expect(result1.sessionId).toBeDefined();
    expect(result2.sessionId).toBeDefined();
    expect(result1.sessionId).not.toBe(result2.sessionId);
  });

  test('should create session with initial variables', () => {
    const { sessionId } = service.createSession({
      variables: { token: 'abc123', userId: 1 }
    });

    const state = service.getSession(sessionId);
    // Note: 'token' is redacted for security, non-sensitive keys returned as-is
    expect(state.variables).toEqual({ token: '[REDACTED]', userId: 1 });
  });

  test('should redact sensitive keys inside arrays of objects', () => {
    const { sessionId } = service.createSession({
      variables: {
        users: [
          { name: 'Alice', apiToken: 'secret-token-123' },
          { name: 'Bob', password: 'my-password' }
        ]
      }
    });

    const state = service.getSession(sessionId);
    expect(state.variables).toEqual({
      users: [
        { name: 'Alice', apiToken: '[REDACTED]' },
        { name: 'Bob', password: '[REDACTED]' }
      ]
    });
  });

  test('should handle deeply nested arrays with sensitive keys', () => {
    const { sessionId } = service.createSession({
      variables: {
        config: {
          servers: [{ host: 'example.com', connection: { apiKey: 'key-123' } }]
        }
      }
    });

    const state = service.getSession(sessionId);
    expect(state.variables).toEqual({
      config: {
        servers: [{ host: 'example.com', connection: { apiKey: '[REDACTED]' } }]
      }
    });
  });

  test('should handle nested arrays of arrays containing objects', () => {
    const { sessionId } = service.createSession({
      variables: {
        matrix: [[{ name: 'nested', apiToken: 'secret' }], [{ password: 'p' }]]
      }
    });

    const state = service.getSession(sessionId);
    expect(state.variables).toEqual({
      matrix: [[{ name: 'nested', apiToken: '[REDACTED]' }], [{ password: '[REDACTED]' }]]
    });
  });

  test('should preserve primitive array values', () => {
    const { sessionId } = service.createSession({
      variables: { tags: ['a', 'b', 'c'], counts: [1, 2, 3] }
    });

    const state = service.getSession(sessionId);
    expect(state.variables).toEqual({ tags: ['a', 'b', 'c'], counts: [1, 2, 3] });
  });

  test('should get session state', () => {
    const { sessionId } = service.createSession({ variables: { foo: 'bar' } });

    const state = service.getSession(sessionId);

    expect(state.sessionId).toBe(sessionId);
    expect(state.variables).toEqual({ foo: 'bar' });
    expect(state.cookieCount).toBe(0);
    expect(state.snapshotVersion).toBe(1);
    expect(state.createdAt).toBeDefined();
    expect(state.lastUsedAt).toBeDefined();
  });

  test('should throw when getting nonexistent session', () => {
    expect(() => service.getSession('nonexistent')).toThrow(SessionNotFoundError);
  });

  test('should update session variables with merge mode', async () => {
    const { sessionId } = service.createSession({
      variables: { a: 1, b: 2 }
    });

    const result = await service.updateSessionVariables(sessionId, {
      variables: { b: 3, c: 4 },
      mode: 'merge'
    });

    const state = service.getSession(sessionId);
    expect(state.variables).toEqual({ a: 1, b: 3, c: 4 });
    expect(result.snapshotVersion).toBe(2);
  });

  test('should update session variables with replace mode', async () => {
    const { sessionId } = service.createSession({
      variables: { a: 1, b: 2 }
    });

    await service.updateSessionVariables(sessionId, {
      variables: { c: 3 },
      mode: 'replace'
    });

    const state = service.getSession(sessionId);
    expect(state.variables).toEqual({ c: 3 });
  });

  test('should throw when updating nonexistent session', async () => {
    await expect(
      service.updateSessionVariables('nonexistent', {
        variables: { a: 1 },
        mode: 'merge'
      })
    ).rejects.toThrow(SessionNotFoundError);
  });

  test('should delete session', () => {
    const { sessionId } = service.createSession({});

    service.deleteSession(sessionId);

    expect(() => service.getSession(sessionId)).toThrow(SessionNotFoundError);
  });

  test('should throw when deleting nonexistent session', () => {
    expect(() => service.deleteSession('nonexistent')).toThrow(SessionNotFoundError);
  });

  test('should execute with session and merge variables', async () => {
    const { sessionId } = service.createSession({
      variables: { baseUrl: 'https://api.example.com', token: 'session-token' }
    });

    const result = await service.execute({
      content: 'GET {{baseUrl}}/users\nAuthorization: Bearer {{token}}\n',
      sessionId,
      variables: { token: 'override-token' }
    });

    expect(result.session?.sessionId).toBe(sessionId);
    expect(result.session?.snapshotVersion).toBeGreaterThanOrEqual(1);
  });

  test('should throw when executing with nonexistent session', async () => {
    await expect(
      service.execute({
        content: 'GET https://example.com\n',
        sessionId: 'nonexistent'
      })
    ).rejects.toThrow(SessionNotFoundError);
  });
});

describe('service file CRUD', () => {
  let tmp: TempDir;
  let service: Service;

  beforeEach(async () => {
    tmp = await tmpdir();
    service = createService({
      workspaceRoot: tmp.path,
      maxBodyBytes: 1024 * 1024,
      maxSessions: 10
    });
  });

  afterEach(async () => {
    service.dispose();
    await tmp[Symbol.asyncDispose]();
  });

  describe('getFileContent', () => {
    test('should return file content and metadata', async () => {
      await tmp.writeFile('test.http', 'GET https://example.com');

      const result = await service.getFileContent('test.http');

      expect(result.path).toBe('test.http');
      expect(result.content).toBe('GET https://example.com');
      expect(result.lastModified).toBeGreaterThan(0);
    });

    test('should throw FileNotFoundError for non-existent file', async () => {
      await expect(service.getFileContent('nonexistent.http')).rejects.toBeInstanceOf(
        FileNotFoundError
      );
    });

    test('should throw PathOutsideWorkspaceError for traversal attempt', async () => {
      await expect(service.getFileContent('../outside.http')).rejects.toBeInstanceOf(
        PathOutsideWorkspaceError
      );
    });
  });

  describe('createFile', () => {
    test('should create a new empty .http file', async () => {
      const result = await service.createFile({ path: 'new.http' });

      expect(result.path).toBe('new.http');
      expect(result.content).toBe('');
      expect(result.lastModified).toBeGreaterThan(0);

      // Verify file exists
      const content = await service.getFileContent('new.http');
      expect(content.content).toBe('');
    });

    test('should create file with initial content', async () => {
      const result = await service.createFile({
        path: 'with-content.http',
        content: 'GET https://api.example.com'
      });

      expect(result.content).toBe('GET https://api.example.com');
    });

    test('should reject unsupported file types', async () => {
      await expect(service.createFile({ path: 'test.txt' })).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    test('should allow script files', async () => {
      const result = await service.createFile({
        path: 'script.ts',
        content: 'console.log("test")'
      });
      expect(result.path).toBe('script.ts');
      expect(result.content).toBe('console.log("test")');
    });

    test('should reject if file already exists', async () => {
      await service.createFile({ path: 'exists.http' });

      await expect(service.createFile({ path: 'exists.http' })).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    test('should create nested directories', async () => {
      // First create the parent directory structure using tmp
      await tmp.writeFile('api/v1/.gitkeep', '');

      const result = await service.createFile({ path: 'api/v1/users.http' });

      expect(result.path).toBe('api/v1/users.http');

      // Verify file exists
      const content = await service.getFileContent('api/v1/users.http');
      expect(content.content).toBe('');
    });
  });

  describe('updateFile', () => {
    test('should update existing file content', async () => {
      await service.createFile({ path: 'update.http', content: 'GET /old' });

      await service.updateFile({ path: 'update.http', content: 'GET /new' });

      const result = await service.getFileContent('update.http');
      expect(result.content).toBe('GET /new');
    });

    test('should throw FileNotFoundError for non-existent file', async () => {
      await expect(
        service.updateFile({
          path: 'nonexistent.http',
          content: 'GET /'
        })
      ).rejects.toBeInstanceOf(FileNotFoundError);
    });

    test('should reject unsupported file types', async () => {
      await tmp.writeFile('test.txt', 'content');

      await expect(
        service.updateFile({
          path: 'test.txt',
          content: 'GET /'
        })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    test('should allow updating script files', async () => {
      await service.createFile({ path: 'script.ts', content: 'old' });

      await service.updateFile({ path: 'script.ts', content: 'new' });

      const result = await service.getFileContent('script.ts');
      expect(result.content).toBe('new');
    });

    test('should reject paths with traversal', async () => {
      await expect(
        service.updateFile({
          path: '../etc/passwd',
          content: 'GET /'
        })
      ).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
    });
  });

  describe('deleteFile', () => {
    test('should delete existing file', async () => {
      await service.createFile({ path: 'delete.http' });

      await service.deleteFile('delete.http');

      await expect(service.getFileContent('delete.http')).rejects.toBeInstanceOf(FileNotFoundError);
    });

    test('should throw FileNotFoundError for non-existent file', async () => {
      await expect(service.deleteFile('nonexistent.http')).rejects.toBeInstanceOf(
        FileNotFoundError
      );
    });

    test('should reject unsupported file types', async () => {
      await tmp.writeFile('test.txt', 'content');

      await expect(service.deleteFile('test.txt')).rejects.toBeInstanceOf(ValidationError);
    });

    test('should allow deleting script files', async () => {
      await service.createFile({ path: 'script.ts', content: 'content' });

      await service.deleteFile('script.ts');

      await expect(service.getFileContent('script.ts')).rejects.toBeInstanceOf(FileNotFoundError);
    });

    test('should reject paths with traversal', async () => {
      await expect(service.deleteFile('../etc/passwd')).rejects.toBeInstanceOf(
        PathOutsideWorkspaceError
      );
    });
  });
});
