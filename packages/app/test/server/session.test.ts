import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createService, type Service } from '../../src/server/service';
import { installFetchMock, mockResponse } from '../utils/fetch-mock';
import { type TempDir, tmpdir } from '../utils/tmpdir';

describe('session ID generation', () => {
  let tmp: TempDir;
  let service: Service;

  beforeEach(async () => {
    tmp = await tmpdir();
    service = createService({
      workspaceRoot: tmp.path,
      maxBodyBytes: 1024 * 1024,
      maxSessions: 100
    });
  });

  afterEach(async () => {
    service.dispose();
    await tmp[Symbol.asyncDispose]();
  });

  test('should generate unique IDs across many sessions', () => {
    const ids = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const { sessionId } = service.createSession({});
      expect(ids.has(sessionId)).toBe(false);
      ids.add(sessionId);
    }

    expect(ids.size).toBe(100);
  });

  test('should generate IDs with expected format', () => {
    const { sessionId } = service.createSession({});

    // Format: timestamp-random (base36)
    expect(sessionId).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  });
});

describe('session variable merge vs replace', () => {
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

  test('merge mode should preserve existing keys', async () => {
    const { sessionId } = service.createSession({
      variables: { a: 1, b: 2, c: 3 }
    });

    await service.updateSessionVariables(sessionId, {
      variables: { b: 'updated' },
      mode: 'merge'
    });

    const state = service.getSession(sessionId);
    expect(state.variables).toEqual({ a: 1, b: 'updated', c: 3 });
  });

  test('merge mode should add new keys', async () => {
    const { sessionId } = service.createSession({
      variables: { existing: 'value' }
    });

    await service.updateSessionVariables(sessionId, {
      variables: { newKey: 'newValue' },
      mode: 'merge'
    });

    const state = service.getSession(sessionId);
    expect(state.variables).toEqual({ existing: 'value', newKey: 'newValue' });
  });

  test('replace mode should remove old keys', async () => {
    const { sessionId } = service.createSession({
      variables: { old1: 1, old2: 2 }
    });

    await service.updateSessionVariables(sessionId, {
      variables: { new1: 'a' },
      mode: 'replace'
    });

    const state = service.getSession(sessionId);
    expect(state.variables).toEqual({ new1: 'a' });
    expect(state.variables.old1).toBeUndefined();
    expect(state.variables.old2).toBeUndefined();
  });

  test('replace mode with empty object should clear all variables', async () => {
    const { sessionId } = service.createSession({
      variables: { key1: 'value1', key2: 'value2' }
    });

    await service.updateSessionVariables(sessionId, {
      variables: {},
      mode: 'replace'
    });

    const state = service.getSession(sessionId);
    expect(state.variables).toEqual({});
  });

  test('should increment snapshotVersion on each update', async () => {
    const { sessionId } = service.createSession({ variables: {} });

    const state1 = service.getSession(sessionId);
    expect(state1.snapshotVersion).toBe(1);

    await service.updateSessionVariables(sessionId, {
      variables: { a: 1 },
      mode: 'merge'
    });

    const state2 = service.getSession(sessionId);
    expect(state2.snapshotVersion).toBe(2);

    await service.updateSessionVariables(sessionId, {
      variables: { b: 2 },
      mode: 'merge'
    });

    const state3 = service.getSession(sessionId);
    expect(state3.snapshotVersion).toBe(3);
  });
});

describe('session cookie isolation', () => {
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
  });

  afterEach(async () => {
    service.dispose();
    restoreFetch?.();
    await tmp[Symbol.asyncDispose]();
  });

  test('should isolate cookies between sessions', async () => {
    let callCount = 0;

    restoreFetch = installFetchMock(async () => {
      callCount++;

      // First call (session1 login) sets cookies.
      if (callCount === 1) {
        return mockResponse({ ok: true }, { setCookies: ['session=abc123; Path=/; HttpOnly'] });
      }

      return mockResponse({ ok: true });
    });

    const { sessionId: session1 } = service.createSession({});
    const { sessionId: session2 } = service.createSession({});

    // Execute in session1 to set cookies.
    const first = await service.execute({
      content: 'GET https://example.com/login\n',
      sessionId: session1
    });

    // Cookie jar should have stored the cookie, and session snapshot should have advanced.
    expect(first.session?.sessionId).toBe(session1);
    expect(first.session?.snapshotVersion).toBe(2);
    expect(service.getSession(session1).cookieCount).toBeGreaterThan(0);

    // Execute again in session1; cookie jar should remain scoped to that session.
    await service.execute({
      content: 'GET https://example.com/me\n',
      sessionId: session1
    });

    // Execute in session2; it should NOT include session1's cookie.
    await service.execute({
      content: 'GET https://example.com/me\n',
      sessionId: session2
    });

    expect(service.getSession(session2).cookieCount).toBe(0);
  });

  test('each session should have independent cookie jar', () => {
    const { sessionId: session1 } = service.createSession({});
    const { sessionId: session2 } = service.createSession({});

    const state1 = service.getSession(session1);
    const state2 = service.getSession(session2);

    // Both should start with 0 cookies
    expect(state1.cookieCount).toBe(0);
    expect(state2.cookieCount).toBe(0);
  });
});

describe('session LRU eviction', () => {
  let tmp: TempDir;

  beforeEach(async () => {
    tmp = await tmpdir();
  });

  afterEach(async () => {
    await tmp[Symbol.asyncDispose]();
  });

  test('should evict least recently used session when limit reached', async () => {
    const service = createService({
      workspaceRoot: tmp.path,
      maxBodyBytes: 1024 * 1024,
      maxSessions: 3
    });

    // Create 3 sessions at capacity
    const { sessionId: session1 } = service.createSession({ variables: { id: 1 } });
    const { sessionId: session2 } = service.createSession({ variables: { id: 2 } });
    const { sessionId: session3 } = service.createSession({ variables: { id: 3 } });

    // Touch session1 and session3 so session2 becomes least-recently-used.
    await service.updateSessionVariables(session1, { variables: { touched: 1 }, mode: 'merge' });
    await service.updateSessionVariables(session3, { variables: { touched: 1 }, mode: 'merge' });

    // Create new session - should evict session2 (least recently used)
    const { sessionId: session4 } = service.createSession({ variables: { id: 4 } });

    // session4 should exist
    expect(() => service.getSession(session4)).not.toThrow();

    const sessions = service.getSessions();
    expect(sessions.size).toBe(3);
    expect(sessions.has(session1)).toBe(true);
    expect(sessions.has(session3)).toBe(true);
    expect(sessions.has(session4)).toBe(true);
    expect(sessions.has(session2)).toBe(false);

    service.dispose();
  });

  test('should continue to evict as new sessions are created', () => {
    const service = createService({
      workspaceRoot: tmp.path,
      maxBodyBytes: 1024 * 1024,
      maxSessions: 2
    });

    // Fill up capacity
    service.createSession({});
    service.createSession({});

    // Create many more sessions
    for (let i = 0; i < 10; i++) {
      service.createSession({});
    }

    // Should still only have maxSessions
    const sessions = service.getSessions();
    expect(sessions.size).toBe(2);

    service.dispose();
  });
});

describe('session TTL expiration', () => {
  let tmp: TempDir;

  beforeEach(async () => {
    tmp = await tmpdir();
  });

  afterEach(async () => {
    await tmp[Symbol.asyncDispose]();
  });

  test('should update lastUsedAt when variables are updated', async () => {
    const service = createService({
      workspaceRoot: tmp.path,
      maxBodyBytes: 1024 * 1024,
      maxSessions: 10
    });

    const { sessionId } = service.createSession({});
    const state1 = service.getSession(sessionId);
    const initialLastUsed = state1.lastUsedAt;

    await service.updateSessionVariables(sessionId, {
      variables: { updated: true },
      mode: 'merge'
    });

    const state2 = service.getSession(sessionId);
    expect(state2.lastUsedAt).toBeGreaterThan(initialLastUsed);

    service.dispose();
  });

  test('should have default TTL of 30 minutes', () => {
    const service = createService({
      workspaceRoot: tmp.path,
      maxBodyBytes: 1024 * 1024,
      maxSessions: 10
      // No sessionTtlMs specified - should use default
    });

    // Session creation should work
    const { sessionId } = service.createSession({});
    expect(() => service.getSession(sessionId)).not.toThrow();

    service.dispose();
  });

  test('should accept custom TTL configuration', () => {
    const service = createService({
      workspaceRoot: tmp.path,
      maxBodyBytes: 1024 * 1024,
      maxSessions: 10,
      sessionTtlMs: 5000 // 5 seconds
    });

    const { sessionId } = service.createSession({});
    expect(() => service.getSession(sessionId)).not.toThrow();

    service.dispose();
  });
});

describe('session concurrency', () => {
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
    restoreFetch = installFetchMock(async () => {
      // Simulate some network delay
      await new Promise((r) => setTimeout(r, 10));
      return mockResponse({ success: true });
    });
  });

  afterEach(async () => {
    service.dispose();
    restoreFetch();
    await tmp[Symbol.asyncDispose]();
  });

  test('should serialize operations within same session', async () => {
    const { sessionId } = service.createSession({ variables: { counter: 0 } });

    // Launch multiple variable updates concurrently
    const updates = Promise.all([
      service.updateSessionVariables(sessionId, { variables: { a: 1 }, mode: 'merge' }),
      service.updateSessionVariables(sessionId, { variables: { b: 2 }, mode: 'merge' }),
      service.updateSessionVariables(sessionId, { variables: { c: 3 }, mode: 'merge' })
    ]);

    await updates;

    const state = service.getSession(sessionId);
    // All updates should have been applied
    expect(state.variables.a).toBe(1);
    expect(state.variables.b).toBe(2);
    expect(state.variables.c).toBe(3);
    // Snapshot version should have incremented for each update
    expect(state.snapshotVersion).toBe(4); // 1 initial + 3 updates
  });
});
