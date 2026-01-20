import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createApp, type ServerConfig } from '../../src/server/app';
import type {
  CreateSessionResponse,
  ErrorResponse,
  ExecuteResponse,
  HealthResponse,
  ParseResponse,
  SessionState,
  UpdateVariablesResponse
} from '../../src/server/schemas';
import { installFetchMock, mockResponse } from '../utils/fetch-mock';
import { createTestServer, type TestServer } from '../utils/test-server';
import { type TempDir, tmpdir } from '../utils/tmpdir';

function createTestConfig(workspaceRoot: string, overrides?: Partial<ServerConfig>): ServerConfig {
  return {
    workspace: workspaceRoot,
    port: 3000,
    host: 'localhost',
    maxBodyBytes: 1024 * 1024,
    maxSessions: 10,
    ...overrides
  };
}

describe('GET /health', () => {
  let tmp: TempDir;
  let server: TestServer;

  beforeEach(async () => {
    tmp = await tmpdir();
    const { app } = createApp(createTestConfig(tmp.path));
    server = createTestServer(app);
  });

  afterEach(async () => {
    await tmp[Symbol.asyncDispose]();
  });

  test('should return healthy status', async () => {
    const { status, data } = await server.get<HealthResponse>('/health');

    expect(status).toBe(200);
    expect(data.healthy).toBe(true);
    expect(data.version).toBeDefined();
  });
});

describe('GET /capabilities', () => {
  let tmp: TempDir;
  let server: TestServer;

  beforeEach(async () => {
    tmp = await tmpdir();
    const { app } = createApp(createTestConfig(tmp.path));
    server = createTestServer(app);
  });

  afterEach(async () => {
    await tmp[Symbol.asyncDispose]();
  });

  test('should return server capabilities', async () => {
    const { status, data } = await server.get<{
      protocolVersion: string;
      version: string;
      features: Record<string, boolean>;
    }>('/capabilities');

    expect(status).toBe(200);
    expect(data.protocolVersion).toBeDefined();
    expect(data.version).toBeDefined();
    expect(data.features.sessions).toBe(true);
  });
});

describe('POST /parse', () => {
  let tmp: TempDir;
  let server: TestServer;

  beforeEach(async () => {
    tmp = await tmpdir();
    const { app } = createApp(createTestConfig(tmp.path));
    server = createTestServer(app);
  });

  afterEach(async () => {
    await tmp[Symbol.asyncDispose]();
  });

  test('should parse content from string', async () => {
    const { status, data } = await server.post<ParseResponse>('/parse', {
      content: 'GET https://api.example.com/users\n'
    });

    expect(status).toBe(200);
    expect(data.requests).toHaveLength(1);
    expect(data.requests[0]?.request?.method).toBe('GET');
  });

  test('should parse content from file path', async () => {
    await tmp.writeFile('test.http', 'POST https://api.example.com/users\n');

    const { status, data } = await server.post<ParseResponse>('/parse', {
      path: 'test.http'
    });

    expect(status).toBe(200);
    expect(data.requests).toHaveLength(1);
    expect(data.requests[0]?.request?.method).toBe('POST');
  });

  test('should return 400 when neither content nor path provided', async () => {
    const { status, data } = await server.post<ErrorResponse>('/parse', {});

    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  test('should return 403 for path traversal attempt', async () => {
    const { status, data } = await server.post<ErrorResponse>('/parse', {
      path: '../etc/passwd'
    });

    expect(status).toBe(403);
    expect(data.error.code).toBe('PATH_OUTSIDE_WORKSPACE');
  });
});

describe('POST /execute', () => {
  let tmp: TempDir;
  let server: TestServer;
  let restoreFetch: () => void;

  beforeEach(async () => {
    tmp = await tmpdir();
    const { app } = createApp(createTestConfig(tmp.path));
    server = createTestServer(app);
    restoreFetch = installFetchMock(async () =>
      mockResponse({ id: 1, name: 'Test' }, { status: 200 })
    );
  });

  afterEach(async () => {
    restoreFetch();
    await tmp[Symbol.asyncDispose]();
  });

  test('should execute request from content', async () => {
    const { status, data } = await server.post<ExecuteResponse>('/execute', {
      content: 'GET https://api.example.com/users/1\n'
    });

    expect(status).toBe(200);
    expect(data.response.status).toBe(200);
    expect(data.request.method).toBe('GET');
    expect(data.runId).toBeDefined();
  });

  test('should execute request from file path', async () => {
    await tmp.writeFile('users.http', 'GET https://api.example.com/users\n');

    const { status, data } = await server.post<ExecuteResponse>('/execute', {
      path: 'users.http'
    });

    expect(status).toBe(200);
    expect(data.response.status).toBe(200);
    expect(data.resolved.httpFilePath).toBe('users.http');
  });

  test('should execute with session', async () => {
    // Create session first
    const createResult = await server.post<CreateSessionResponse>('/session', {
      variables: { token: 'test-token' }
    });
    const { sessionId } = createResult.data;

    // Execute with session
    const { status, data } = await server.post<ExecuteResponse>('/execute', {
      content: 'GET https://api.example.com/users\n',
      sessionId
    });

    expect(status).toBe(200);
    expect(data.session?.sessionId).toBe(sessionId);
  });

  test('should execute with variable interpolation', async () => {
    const { status, data } = await server.post<ExecuteResponse>('/execute', {
      content: 'GET {{baseUrl}}/users/{{userId}}\n',
      variables: {
        baseUrl: 'https://api.example.com',
        userId: '42'
      }
    });

    expect(status).toBe(200);
    // The request.url in response is the template; the actual fetch URL is interpolated
    expect(data.request.url).toBe('{{baseUrl}}/users/{{userId}}');
    expect(data.response.status).toBe(200);
  });

  test('should select request by name', async () => {
    const content = `
# @name first
GET https://api.example.com/first

###

# @name second
GET https://api.example.com/second
`;
    const { status, data } = await server.post<ExecuteResponse>('/execute', {
      content,
      requestName: 'second'
    });

    expect(status).toBe(200);
    expect(data.request.name).toBe('second');
    expect(data.request.index).toBe(1);
  });

  test('should select request by index', async () => {
    const content = `
GET https://api.example.com/first

###

GET https://api.example.com/second
`;
    const { status, data } = await server.post<ExecuteResponse>('/execute', {
      content,
      requestIndex: 1
    });

    expect(status).toBe(200);
    expect(data.request.index).toBe(1);
  });

  test('should return 404 for nonexistent request name', async () => {
    const { status, data } = await server.post<ErrorResponse>('/execute', {
      content: '# @name first\nGET https://example.com\n',
      requestName: 'nonexistent'
    });

    expect(status).toBe(404);
    expect(data.error.code).toBe('REQUEST_NOT_FOUND');
  });

  test('should return 400 for request index out of range', async () => {
    const { status, data } = await server.post<ErrorResponse>('/execute', {
      content: 'GET https://example.com\n',
      requestIndex: 5
    });

    expect(status).toBe(400);
    expect(data.error.code).toBe('REQUEST_INDEX_OUT_OF_RANGE');
  });

  test('should return 404 for nonexistent session', async () => {
    const { status, data } = await server.post<ErrorResponse>('/execute', {
      content: 'GET https://example.com\n',
      sessionId: 'nonexistent'
    });

    expect(status).toBe(404);
    expect(data.error.code).toBe('SESSION_NOT_FOUND');
  });

  test('should include timing information', async () => {
    const { data } = await server.post<ExecuteResponse>('/execute', {
      content: 'GET https://api.example.com\n'
    });

    expect(data.timing.startTime).toBeDefined();
    expect(data.timing.endTime).toBeDefined();
    expect(data.timing.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('session endpoints', () => {
  let tmp: TempDir;
  let server: TestServer;

  beforeEach(async () => {
    tmp = await tmpdir();
    const { app } = createApp(createTestConfig(tmp.path));
    server = createTestServer(app);
  });

  afterEach(async () => {
    await tmp[Symbol.asyncDispose]();
  });

  describe('POST /session', () => {
    test('should create session with 201 status', async () => {
      const { status, data } = await server.post<CreateSessionResponse>('/session', {});

      expect(status).toBe(201);
      expect(data.sessionId).toBeDefined();
    });

    test('should create session with initial variables', async () => {
      const { data: createData } = await server.post<CreateSessionResponse>('/session', {
        variables: { token: 'abc123', userId: 42 }
      });

      const { data: getState } = await server.get<SessionState>(`/session/${createData.sessionId}`);

      expect(getState.variables).toEqual({ token: 'abc123', userId: 42 });
    });
  });

  describe('GET /session/:id', () => {
    test('should get session state', async () => {
      const { data: createData } = await server.post<CreateSessionResponse>('/session', {
        variables: { foo: 'bar' }
      });

      const { status, data } = await server.get<SessionState>(`/session/${createData.sessionId}`);

      expect(status).toBe(200);
      expect(data.sessionId).toBe(createData.sessionId);
      expect(data.variables).toEqual({ foo: 'bar' });
      expect(data.cookieCount).toBe(0);
      expect(data.snapshotVersion).toBe(1);
    });

    test('should return 404 for nonexistent session', async () => {
      const { status, data } = await server.get<ErrorResponse>('/session/nonexistent');

      expect(status).toBe(404);
      expect(data.error.code).toBe('SESSION_NOT_FOUND');
    });
  });

  describe('PUT /session/:id/variables', () => {
    test('should update variables with merge mode', async () => {
      const { data: createData } = await server.post<CreateSessionResponse>('/session', {
        variables: { a: 1, b: 2 }
      });

      const { status, data } = await server.put<UpdateVariablesResponse>(
        `/session/${createData.sessionId}/variables`,
        { variables: { b: 3, c: 4 }, mode: 'merge' }
      );

      expect(status).toBe(200);
      expect(data.snapshotVersion).toBe(2);

      const { data: state } = await server.get<SessionState>(`/session/${createData.sessionId}`);
      expect(state.variables).toEqual({ a: 1, b: 3, c: 4 });
    });

    test('should update variables with replace mode', async () => {
      const { data: createData } = await server.post<CreateSessionResponse>('/session', {
        variables: { a: 1, b: 2 }
      });

      await server.put<UpdateVariablesResponse>(`/session/${createData.sessionId}/variables`, {
        variables: { c: 3 },
        mode: 'replace'
      });

      const { data: state } = await server.get<SessionState>(`/session/${createData.sessionId}`);
      expect(state.variables).toEqual({ c: 3 });
    });

    test('should return 404 for nonexistent session', async () => {
      const { status, data } = await server.put<ErrorResponse>('/session/nonexistent/variables', {
        variables: { a: 1 },
        mode: 'merge'
      });

      expect(status).toBe(404);
      expect(data.error.code).toBe('SESSION_NOT_FOUND');
    });
  });

  describe('DELETE /session/:id', () => {
    test('should delete session with 204 status', async () => {
      const { data: createData } = await server.post<CreateSessionResponse>('/session', {});

      const { status } = await server.delete(`/session/${createData.sessionId}`);

      expect(status).toBe(204);

      // Verify session is gone
      const { status: getStatus } = await server.get<ErrorResponse>(
        `/session/${createData.sessionId}`
      );
      expect(getStatus).toBe(404);
    });

    test('should return 404 for nonexistent session', async () => {
      const { status } = await server.delete('/session/nonexistent');

      expect(status).toBe(404);
    });
  });
});

describe('middleware', () => {
  describe('bearer auth', () => {
    let tmp: TempDir;

    beforeEach(async () => {
      tmp = await tmpdir();
    });

    afterEach(async () => {
      await tmp[Symbol.asyncDispose]();
    });

    test('should require auth when token is configured', async () => {
      const { app } = createApp(createTestConfig(tmp.path, { token: 'secret-token' }));
      const server = createTestServer(app);

      // Use raw request to get actual response without JSON parsing
      const response = (await server.request('/health')) as { status: number };

      // Hono's bearerAuth returns 401 for missing token
      expect(response.status).toBe(401);
    });

    test('should allow access with valid token', async () => {
      const { app } = createApp(createTestConfig(tmp.path, { token: 'secret-token' }));
      const server = createTestServer(app);

      const response = (await server.request('/health', {
        headers: { Authorization: 'Bearer secret-token' }
      })) as { status: number };

      expect(response.status).toBe(200);
    });

    test('should reject invalid token', async () => {
      const { app } = createApp(createTestConfig(tmp.path, { token: 'secret-token' }));
      const server = createTestServer(app);

      const response = (await server.request('/health', {
        headers: { Authorization: 'Bearer wrong-token' }
      })) as { status: number };

      // Hono's bearerAuth returns 401 for invalid token
      expect(response.status).toBe(401);
    });
  });

  describe('error handling', () => {
    let tmp: TempDir;
    let server: TestServer;

    beforeEach(async () => {
      tmp = await tmpdir();
      const { app } = createApp(createTestConfig(tmp.path));
      server = createTestServer(app);
    });

    afterEach(async () => {
      await tmp[Symbol.asyncDispose]();
    });

    test('should return structured error for TreqError', async () => {
      const { status, data } = await server.post<ErrorResponse>('/execute', {
        path: '../escape.http'
      });

      expect(status).toBe(403);
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('PATH_OUTSIDE_WORKSPACE');
      expect(data.error.message).toBeDefined();
    });

    test('should return 400 for validation errors', async () => {
      // Send invalid JSON body type (non-object)
      const response = (await server.request('/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify('invalid')
      })) as { status: number };

      expect(response.status).toBe(400);
    });
  });
});

describe('GET /doc', () => {
  let tmp: TempDir;
  let server: TestServer;

  beforeEach(async () => {
    tmp = await tmpdir();
    const { app } = createApp(createTestConfig(tmp.path));
    server = createTestServer(app);
  });

  afterEach(async () => {
    await tmp[Symbol.asyncDispose]();
  });

  test('should return OpenAPI schema', async () => {
    const { status, data } = await server.get<{ openapi: string; info: { title: string } }>('/doc');

    expect(status).toBe(200);
    expect(data.openapi).toBe('3.0.3');
    expect(data.info.title).toContain('t-req');
  });
});
