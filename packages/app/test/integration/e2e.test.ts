import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createApp, type ServerConfig } from '../../src/server/app';
import type {
  CreateSessionResponse,
  ExecuteResponse,
  ParseResponse,
  SessionState,
  UpdateVariablesResponse
} from '../../src/server/schemas';
import { installFetchMock, mockResponse } from '../utils/fetch-mock';
import { createTestServer, type TestServer } from '../utils/test-server';
import { type TempDir, tmpdir } from '../utils/tmpdir';

/**
 * End-to-end workflow tests that simulate real usage patterns.
 */

function createTestConfig(workspaceRoot: string): ServerConfig {
  return {
    workspace: workspaceRoot,
    port: 3000,
    host: 'localhost',
    maxBodyBytes: 1024 * 1024,
    maxSessions: 10
  };
}

describe('E2E: Server session workflow', () => {
  let tmp: TempDir;
  let server: TestServer;
  let restoreFetch: () => void;
  let requestLog: Array<{ method: string; url: string; headers: Record<string, string> }>;

  beforeEach(async () => {
    tmp = await tmpdir();
    requestLog = [];

    // Create sample HTTP files
    await tmp.writeFile(
      'api/auth/login.http',
      `# @name login
POST {{baseUrl}}/auth/login
Content-Type: application/json

{"email": "{{email}}", "password": "{{password}}"}
`
    );

    await tmp.writeFile(
      'api/users/list.http',
      `# @name listUsers
GET {{baseUrl}}/users
Authorization: Bearer {{token}}
Accept: application/json
`
    );

    await tmp.writeFile(
      'api/users/create.http',
      `# @name createUser
POST {{baseUrl}}/users
Authorization: Bearer {{token}}
Content-Type: application/json

{"name": "{{name}}", "email": "{{userEmail}}"}
`
    );

    const { app } = createApp(createTestConfig(tmp.path));
    server = createTestServer(app);

    restoreFetch = installFetchMock(async (url, init) => {
      const urlStr = url.toString();
      const method = init?.method ?? 'GET';
      const headers: Record<string, string> = {};

      if (init?.headers) {
        // Bun's `Headers` typings may omit methods like `forEach`, so normalize via runtime behavior.
        const h = new Headers(init.headers);
        const maybeForEach = (h as unknown as { forEach?: unknown }).forEach;
        if (typeof maybeForEach === 'function') {
          (
            h as unknown as { forEach: (cb: (value: string, name: string) => void) => void }
          ).forEach((v, k) => {
            headers[k] = v;
          });
        } else {
          const maybeEntries = (h as unknown as { entries?: unknown }).entries;
          if (typeof maybeEntries === 'function') {
            for (const [k, v] of (
              h as unknown as { entries: () => IterableIterator<[string, string]> }
            ).entries()) {
              headers[k] = v;
            }
          }
        }
      }

      requestLog.push({ method, url: urlStr, headers });

      // Simulate different API responses
      if (urlStr.includes('/auth/login')) {
        return mockResponse(
          { token: 'jwt-token-123', userId: 42 },
          {
            status: 200,
            setCookies: ['session=abc123; Path=/; HttpOnly']
          }
        );
      }

      if (urlStr.includes('/users') && method === 'GET') {
        return mockResponse(
          [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' }
          ],
          { status: 200 }
        );
      }

      if (urlStr.includes('/users') && method === 'POST') {
        return mockResponse({ id: 3, name: 'New User' }, { status: 201 });
      }

      return mockResponse({ error: 'Not found' }, { status: 404 });
    });
  });

  afterEach(async () => {
    restoreFetch();
    await tmp[Symbol.asyncDispose]();
  });

  test('should complete full API workflow with session persistence', async () => {
    // Step 1: Create a session with initial variables
    const { data: sessionData } = await server.post<CreateSessionResponse>('/session', {
      variables: {
        baseUrl: 'https://api.example.com'
      }
    });
    const { sessionId } = sessionData;
    expect(sessionId).toBeDefined();

    // Step 2: Login to get a token
    const { data: loginResult } = await server.post<ExecuteResponse>('/execute', {
      path: 'api/auth/login.http',
      sessionId,
      variables: {
        email: 'test@example.com',
        password: 'secret123'
      }
    });

    expect(loginResult.response.status).toBe(200);
    expect(loginResult.session?.sessionId).toBe(sessionId);

    // Parse the login response to get the token
    const loginBody = JSON.parse(loginResult.response.body ?? '{}');
    expect(loginBody.token).toBe('jwt-token-123');

    // Step 3: Update session with the token
    await server.put<UpdateVariablesResponse>(`/session/${sessionId}/variables`, {
      variables: { token: loginBody.token },
      mode: 'merge'
    });

    // Verify session state
    const { data: sessionState } = await server.get<SessionState>(`/session/${sessionId}`);
    expect(sessionState.variables.token).toBe('jwt-token-123');
    expect(sessionState.variables.baseUrl).toBe('https://api.example.com');

    // Step 4: List users using the token from session
    const { data: listResult } = await server.post<ExecuteResponse>('/execute', {
      path: 'api/users/list.http',
      sessionId
    });

    expect(listResult.response.status).toBe(200);

    // Verify the request included the auth header
    const listRequest = requestLog.find((r) => r.url.includes('/users') && r.method === 'GET');
    expect(listRequest?.headers.authorization).toBe('Bearer jwt-token-123');

    // Step 5: Create a new user
    const { data: createResult } = await server.post<ExecuteResponse>('/execute', {
      path: 'api/users/create.http',
      sessionId,
      variables: {
        name: 'Charlie',
        userEmail: 'charlie@example.com'
      }
    });

    expect(createResult.response.status).toBe(201);

    // Verify the create request also had auth
    const createRequest = requestLog.find((r) => r.url.includes('/users') && r.method === 'POST');
    expect(createRequest?.headers.authorization).toBe('Bearer jwt-token-123');

    // Step 6: Clean up - delete session
    const { status: deleteStatus } = await server.delete(`/session/${sessionId}`);
    expect(deleteStatus).toBe(204);
  });

  test('should isolate variables between sessions', async () => {
    // Create two sessions with different credentials
    const { data: session1 } = await server.post<CreateSessionResponse>('/session', {
      variables: {
        baseUrl: 'https://api.example.com',
        token: 'user1-token'
      }
    });

    const { data: session2 } = await server.post<CreateSessionResponse>('/session', {
      variables: {
        baseUrl: 'https://api.example.com',
        token: 'user2-token'
      }
    });

    // Execute with session 1
    await server.post<ExecuteResponse>('/execute', {
      path: 'api/users/list.http',
      sessionId: session1.sessionId
    });

    // Execute with session 2
    await server.post<ExecuteResponse>('/execute', {
      path: 'api/users/list.http',
      sessionId: session2.sessionId
    });

    // Verify each request used the correct token
    expect(requestLog[0]?.headers.authorization).toBe('Bearer user1-token');
    expect(requestLog[1]?.headers.authorization).toBe('Bearer user2-token');
  });
});

describe('E2E: Parse and execute workflow', () => {
  let tmp: TempDir;
  let server: TestServer;
  let restoreFetch: () => void;

  beforeEach(async () => {
    tmp = await tmpdir();

    await tmp.writeFile(
      'multi-request.http',
      `# @name getHealth
GET {{baseUrl}}/health

###

# @name getStatus
GET {{baseUrl}}/status
Accept: application/json

###

# @name postData
POST {{baseUrl}}/data
Content-Type: application/json

{"value": "{{value}}"}
`
    );

    const { app } = createApp(createTestConfig(tmp.path));
    server = createTestServer(app);

    restoreFetch = installFetchMock(async () => mockResponse({ ok: true }));
  });

  afterEach(async () => {
    restoreFetch();
    await tmp[Symbol.asyncDispose]();
  });

  test('should parse file and then execute specific request by name', async () => {
    // First, parse the file to see available requests
    const { data: parseResult } = await server.post<ParseResponse>('/parse', {
      path: 'multi-request.http'
    });

    expect(parseResult.requests).toHaveLength(3);
    expect(parseResult.requests[0]?.request?.name).toBe('getHealth');
    expect(parseResult.requests[1]?.request?.name).toBe('getStatus');
    expect(parseResult.requests[2]?.request?.name).toBe('postData');

    // Execute a specific request by name
    const { data: execResult } = await server.post<ExecuteResponse>('/execute', {
      path: 'multi-request.http',
      requestName: 'getStatus',
      variables: { baseUrl: 'https://api.example.com' }
    });

    expect(execResult.request.name).toBe('getStatus');
    expect(execResult.request.index).toBe(1);
  });

  test('should parse content and execute with variables', async () => {
    const content = `
GET {{host}}/api/v{{version}}/users/{{userId}}
X-API-Key: {{apiKey}}
`;

    // Parse to validate
    const { data: parseResult } = await server.post<ParseResponse>('/parse', {
      content
    });

    expect(parseResult.requests).toHaveLength(1);

    // Execute with all variables filled
    const { data: execResult } = await server.post<ExecuteResponse>('/execute', {
      content,
      variables: {
        host: 'https://api.example.com',
        version: '2',
        userId: '123',
        apiKey: 'secret-key'
      }
    });

    // The request.url in response is the template; the actual fetch is interpolated
    expect(execResult.request.url).toBe('{{host}}/api/v{{version}}/users/{{userId}}');
    expect(execResult.response.status).toBe(200);
  });
});

describe('E2E: Error handling workflow', () => {
  let tmp: TempDir;
  let server: TestServer;
  let restoreFetch: () => void;

  beforeEach(async () => {
    tmp = await tmpdir();
    const { app } = createApp(createTestConfig(tmp.path));
    server = createTestServer(app);
    restoreFetch = installFetchMock(async () => mockResponse({ ok: true }));
  });

  afterEach(async () => {
    restoreFetch();
    await tmp[Symbol.asyncDispose]();
  });

  test('should handle file not found gracefully', async () => {
    // Create the directory so path is valid but file doesn't exist
    await tmp.mkdir('nonexistent');

    const { status } = await server.post('/execute', {
      path: 'nonexistent/file.http'
    });

    // Should return an error status (file doesn't exist)
    expect(status).toBeGreaterThanOrEqual(400);
  });

  test('should handle path traversal attempts', async () => {
    const { status } = await server.post('/execute', {
      path: '../../../etc/passwd'
    });

    expect(status).toBe(403);
  });

  test('should handle session not found in execute', async () => {
    await tmp.writeFile('test.http', 'GET https://example.com\n');

    const { status } = await server.post('/execute', {
      path: 'test.http',
      sessionId: 'nonexistent-session-id'
    });

    expect(status).toBe(404);
  });

  test('should handle request name not found', async () => {
    await tmp.writeFile(
      'named.http',
      `# @name existingRequest
GET https://example.com
`
    );

    const { status } = await server.post('/execute', {
      path: 'named.http',
      requestName: 'nonexistentRequest'
    });

    expect(status).toBe(404);
  });
});

describe('E2E: Concurrent request handling', () => {
  let tmp: TempDir;
  let server: TestServer;
  let restoreFetch: () => void;
  let requestCount: number;

  beforeEach(async () => {
    tmp = await tmpdir();
    requestCount = 0;

    await tmp.writeFile('test.http', 'GET https://api.example.com/data\n');

    const { app } = createApp(createTestConfig(tmp.path));
    server = createTestServer(app);

    restoreFetch = installFetchMock(async () => {
      requestCount++;
      // Simulate some processing time
      await new Promise((r) => setTimeout(r, 10));
      return mockResponse({ count: requestCount });
    });
  });

  afterEach(async () => {
    restoreFetch();
    await tmp[Symbol.asyncDispose]();
  });

  test('should handle concurrent requests', async () => {
    // Create a session
    const { data: sessionData } = await server.post<CreateSessionResponse>('/session', {});
    const { sessionId } = sessionData;

    // Execute multiple requests concurrently
    const results = await Promise.all([
      server.post<ExecuteResponse>('/execute', { path: 'test.http', sessionId }),
      server.post<ExecuteResponse>('/execute', { path: 'test.http', sessionId }),
      server.post<ExecuteResponse>('/execute', { path: 'test.http', sessionId })
    ]);

    // All should succeed
    for (const result of results) {
      expect(result.status).toBe(200);
      expect(result.data.response.status).toBe(200);
    }

    // All requests should have been made
    expect(requestCount).toBe(3);
  });

  test('should serialize session variable updates', async () => {
    const { data: sessionData } = await server.post<CreateSessionResponse>('/session', {
      variables: { counter: 0 }
    });
    const { sessionId } = sessionData;

    // Update variables concurrently
    await Promise.all([
      server.put(`/session/${sessionId}/variables`, { variables: { a: 1 }, mode: 'merge' }),
      server.put(`/session/${sessionId}/variables`, { variables: { b: 2 }, mode: 'merge' }),
      server.put(`/session/${sessionId}/variables`, { variables: { c: 3 }, mode: 'merge' })
    ]);

    // All variables should be present
    const { data: state } = await server.get<SessionState>(`/session/${sessionId}`);
    expect(state.variables.a).toBe(1);
    expect(state.variables.b).toBe(2);
    expect(state.variables.c).toBe(3);
  });
});

describe('E2E: Response body handling', () => {
  let tmp: TempDir;
  let server: TestServer;
  let restoreFetch: () => void;

  beforeEach(async () => {
    tmp = await tmpdir();
    await tmp.writeFile('test.http', 'GET https://api.example.com/data\n');

    const { app } = createApp(createTestConfig(tmp.path));
    server = createTestServer(app);
  });

  afterEach(async () => {
    restoreFetch?.();
    await tmp[Symbol.asyncDispose]();
  });

  test('should handle JSON response bodies', async () => {
    restoreFetch = installFetchMock(async () =>
      mockResponse(
        {
          users: [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' }
          ],
          total: 2
        },
        { status: 200 }
      )
    );

    const { data } = await server.post<ExecuteResponse>('/execute', {
      path: 'test.http'
    });

    expect(data.response.status).toBe(200);
    expect(data.response.body).toBeDefined();

    const body = JSON.parse(data.response.body ?? '{}');
    expect(body.users).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  test('should handle plain text response bodies', async () => {
    restoreFetch = installFetchMock(
      async () =>
        new Response('Hello, World!', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        })
    );

    const { data } = await server.post<ExecuteResponse>('/execute', {
      path: 'test.http'
    });

    expect(data.response.body).toBe('Hello, World!');
    expect(data.response.encoding).toBe('utf-8');
  });

  test('should handle empty response bodies', async () => {
    restoreFetch = installFetchMock(async () => new Response(null, { status: 204 }));

    const { data } = await server.post<ExecuteResponse>('/execute', {
      path: 'test.http'
    });

    expect(data.response.status).toBe(204);
    expect(data.response.bodyMode).toBe('none');
  });
});
