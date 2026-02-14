import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../src/server/app';
import type { Service } from '../../src/server/service';
import { type TempDir, tmpdir } from '../utils/tmpdir';

describe('OpenAPI /doc endpoint', () => {
  let tmp: TempDir;
  let app: ReturnType<typeof createApp>['app'];
  let service: Service;

  beforeEach(async () => {
    tmp = await tmpdir();
    const result = createApp({
      workspace: tmp.path,
      port: 3000,
      host: 'localhost',
      maxBodyBytes: 1024 * 1024,
      maxSessions: 10
    });
    app = result.app;
    service = result.service;
  });

  afterEach(async () => {
    service.dispose();
    await tmp[Symbol.asyncDispose]();
  });

  test('should return valid OpenAPI 3.0 spec', async () => {
    const res = await app.request('/doc');
    expect(res.status).toBe(200);

    const spec = await res.json();
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info).toBeDefined();
    expect(spec.paths).toBeDefined();
  });

  test('should include server info', async () => {
    const res = await app.request('/doc');
    const spec = await res.json();

    expect(spec.info).toMatchObject({
      title: 't-req Server API',
      description: expect.any(String),
      version: expect.any(String)
    });
  });

  test('should include server URL', async () => {
    const res = await app.request('/doc');
    const spec = await res.json();
    const servers = spec.servers as Array<{ url: string }>;

    expect(servers).toHaveLength(1);
    expect(servers[0]?.url).toBe('http://localhost:3000');
  });

  test('should define all required paths', async () => {
    const res = await app.request('/doc');
    const spec = await res.json();
    const paths = spec.paths as Record<string, unknown>;

    // System endpoints
    expect(paths['/health']).toBeDefined();
    expect(paths['/capabilities']).toBeDefined();

    // Request endpoints
    expect(paths['/parse']).toBeDefined();
    expect(paths['/execute']).toBeDefined();

    // Session endpoints
    expect(paths['/session']).toBeDefined();
    expect(paths['/session/{id}']).toBeDefined();
    expect(paths['/session/{id}/variables']).toBeDefined();

    // Event endpoint
    expect(paths['/event']).toBeDefined();

    // Import endpoints
    expect(paths['/import/{source}/preview']).toBeDefined();
    expect(paths['/import/{source}/apply']).toBeDefined();
  });

  test('should define health endpoint correctly', async () => {
    const res = await app.request('/doc');
    const spec = await res.json();
    const paths = spec.paths as Record<string, Record<string, unknown>>;
    const health = paths['/health']?.get as Record<string, unknown>;

    expect(health).toBeDefined();
    expect(health.summary).toBe('Health check');
    expect(health.tags).toContain('System');
    expect(health.responses).toBeDefined();
  });

  test('should define parse endpoint with request body', async () => {
    const res = await app.request('/doc');
    const spec = await res.json();
    const paths = spec.paths as Record<string, Record<string, unknown>>;
    const parse = paths['/parse']?.post as Record<string, unknown>;

    expect(parse).toBeDefined();
    expect(parse.summary).toBe('Parse .http file content');
    expect(parse.tags).toContain('Requests');
    expect(parse.requestBody).toBeDefined();
    expect(parse.responses).toBeDefined();
  });

  test('should define execute endpoint with request body', async () => {
    const res = await app.request('/doc');
    const spec = await res.json();
    const paths = spec.paths as Record<string, Record<string, unknown>>;
    const execute = paths['/execute']?.post as Record<string, unknown>;

    expect(execute).toBeDefined();
    expect(execute.summary).toBe('Execute HTTP request');
    expect(execute.tags).toContain('Requests');
    expect(execute.requestBody).toBeDefined();
  });

  test('should define session CRUD endpoints', async () => {
    const res = await app.request('/doc');
    const spec = await res.json();
    const paths = spec.paths as Record<string, Record<string, unknown>>;

    // POST /session
    const createSession = paths['/session']?.post as Record<string, unknown>;
    expect(createSession).toBeDefined();
    expect(createSession.tags).toContain('Sessions');

    // GET /session/{id}
    const getSession = paths['/session/{id}']?.get as Record<string, unknown>;
    expect(getSession).toBeDefined();
    expect(getSession.tags).toContain('Sessions');

    // DELETE /session/{id}
    const deleteSession = paths['/session/{id}']?.delete as Record<string, unknown>;
    expect(deleteSession).toBeDefined();
    expect(deleteSession.tags).toContain('Sessions');

    // PUT /session/{id}/variables
    const updateVars = paths['/session/{id}/variables']?.put as Record<string, unknown>;
    expect(updateVars).toBeDefined();
    expect(updateVars.tags).toContain('Sessions');
  });

  test('should define event SSE endpoint', async () => {
    const res = await app.request('/doc');
    const spec = await res.json();
    const paths = spec.paths as Record<string, Record<string, unknown>>;
    const event = paths['/event']?.get as Record<string, unknown>;

    expect(event).toBeDefined();
    expect(event.summary).toBe('Event stream (SSE)');
    expect(event.tags).toContain('Events');
  });

  test('should include tags with descriptions', async () => {
    const res = await app.request('/doc');
    const spec = await res.json();
    const tags = spec.tags as Array<{ name: string; description: string }>;

    expect(tags).toBeInstanceOf(Array);
    expect(tags.length).toBeGreaterThan(0);

    const tagNames = tags.map((t) => t.name);
    expect(tagNames).toContain('System');
    expect(tagNames).toContain('Requests');
    expect(tagNames).toContain('Sessions');
    expect(tagNames).toContain('Events');
    expect(tagNames).toContain('Import');
  });

  test('should define import endpoint operationIds', async () => {
    const res = await app.request('/doc');
    const spec = await res.json();
    const paths = spec.paths as Record<string, Record<string, { operationId?: string }>>;

    expect(paths['/import/{source}/preview']?.post?.operationId).toBe('importPreview');
    expect(paths['/import/{source}/apply']?.post?.operationId).toBe('importApply');
  });

  test('should include external docs link', async () => {
    const res = await app.request('/doc');
    const spec = await res.json();
    const externalDocs = spec.externalDocs as { url: string };

    expect(externalDocs).toBeDefined();
    expect(externalDocs.url).toContain('github.com/tensorix-labs/t-req');
  });
});

describe('OpenAPI spec structure validation', () => {
  let tmp: TempDir;
  let app: ReturnType<typeof createApp>['app'];
  let service: Service;

  beforeEach(async () => {
    tmp = await tmpdir();
    const result = createApp({
      workspace: tmp.path,
      port: 3000,
      host: 'localhost',
      maxBodyBytes: 1024 * 1024,
      maxSessions: 10
    });
    app = result.app;
    service = result.service;
  });

  afterEach(async () => {
    service.dispose();
    await tmp[Symbol.asyncDispose]();
  });

  test('should have valid response definitions', async () => {
    const res = await app.request('/doc');
    const spec = await res.json();
    const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;

    // Check /health has 200 response
    expect(paths['/health']?.get?.responses?.['200']).toBeDefined();

    // Check /parse has 200 and 400 responses
    expect(paths['/parse']?.post?.responses?.['200']).toBeDefined();
    expect(paths['/parse']?.post?.responses?.['400']).toBeDefined();

    // Check /session POST has 201 response
    expect(paths['/session']?.post?.responses?.['201']).toBeDefined();

    // Check /session/{id} DELETE has 204 response
    expect(paths['/session/{id}']?.delete?.responses?.['204']).toBeDefined();
  });

  test('should have valid request body content types', async () => {
    const res = await app.request('/doc');
    const spec = await res.json();
    const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;

    const parseBody = paths['/parse']?.post?.requestBody as {
      content: Record<string, unknown>;
    };
    expect(parseBody?.content?.['application/json']).toBeDefined();

    const executeBody = paths['/execute']?.post?.requestBody as {
      content: Record<string, unknown>;
    };
    expect(executeBody?.content?.['application/json']).toBeDefined();
  });
});
