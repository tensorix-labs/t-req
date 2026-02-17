import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type ServerConfig } from '../../src/server/app';
import type { ExecuteWSResponse } from '../../src/server/schemas';

type Envelope = { type: string; seq: number; payload?: unknown };

function createTestConfig(workspaceRoot: string): ServerConfig {
  return {
    workspace: workspaceRoot,
    port: 0,
    host: '127.0.0.1',
    maxBodyBytes: 1024 * 1024,
    maxSessions: 10
  };
}

function openWebSocket(url: string, timeoutMs = 1500): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);

    const timeout = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // no-op
      }
      reject(new Error(`Timed out opening WebSocket: ${url}`));
    }, timeoutMs);

    ws.addEventListener(
      'open',
      () => {
        clearTimeout(timeout);
        resolve(ws);
      },
      { once: true }
    );
    ws.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        reject(new Error(`Failed to open WebSocket: ${url}`));
      },
      { once: true }
    );
  });
}

async function waitForWebSocketReady(url: string, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const probe = await openWebSocket(url, 300);
      probe.close(1000, 'probe');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  throw new Error(`WebSocket endpoint did not become ready: ${url}`);
}

function createEnvelopeCollector(ws: WebSocket) {
  const queue: Envelope[] = [];
  const waiters: Array<{
    predicate: (event: Envelope) => boolean;
    resolve: (event: Envelope) => void;
  }> = [];

  ws.addEventListener('message', (event) => {
    const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
    const envelope = JSON.parse(raw) as Envelope;

    const waiterIdx = waiters.findIndex((waiter) => waiter.predicate(envelope));
    if (waiterIdx !== -1) {
      const waiter = waiters[waiterIdx];
      if (waiter) {
        waiters.splice(waiterIdx, 1);
        waiter.resolve(envelope);
      }
      return;
    }

    queue.push(envelope);
  });

  const next = (predicate: (event: Envelope) => boolean, timeoutMs = 2000): Promise<Envelope> => {
    const queuedIdx = queue.findIndex((event) => predicate(event));
    if (queuedIdx !== -1) {
      const queued = queue.splice(queuedIdx, 1)[0];
      if (queued) return Promise.resolve(queued);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const queued = queue.map((event) => `${event.seq}:${event.type}`).join(', ');
        reject(
          new Error(
            `Timed out waiting for WebSocket envelope after ${timeoutMs}ms (queued: ${
              queued || '<empty>'
            })`
          )
        );
      }, timeoutMs);

      waiters.push({
        predicate,
        resolve: (event) => {
          clearTimeout(timeout);
          resolve(event);
        }
      });
    });
  };

  return { next };
}

describe('GET /ws/session/{wsSessionId}', () => {
  let workspaceRoot = '';
  let appServer: Bun.Server | undefined;
  let upstreamServer: Bun.Server | undefined;
  let cleanup:
    | {
        service: { dispose: () => Promise<void> | void };
        eventManager: { closeAll: () => void };
        dispose: () => void;
      }
    | undefined;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'treq-ws-'));

    const appResult = createApp(createTestConfig(workspaceRoot));
    cleanup = {
      service: appResult.service,
      eventManager: appResult.eventManager,
      dispose: appResult.dispose
    };

    appServer = Bun.serve({
      fetch: appResult.app.fetch,
      websocket: appResult.websocket,
      port: 0,
      hostname: '127.0.0.1'
    });

    upstreamServer = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch(req, server) {
        if (server.upgrade(req)) return;
        return new Response('Upgrade required', { status: 400 });
      },
      websocket: {
        message(ws, message) {
          ws.send(message);
        }
      }
    });
  });

  afterEach(async () => {
    appServer?.stop(true);
    upstreamServer?.stop(true);

    if (cleanup) {
      cleanup.eventManager.closeAll();
      await cleanup.service.dispose();
      cleanup.dispose();
    }

    if (workspaceRoot) {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('connect/send/receive/close lifecycle works over downstream control socket', async () => {
    const appPort = appServer?.port;
    const upstreamPort = upstreamServer?.port;
    if (!appPort || !upstreamPort) {
      throw new Error('Expected test servers to be running');
    }

    await waitForWebSocketReady(`ws://127.0.0.1:${upstreamPort}/echo`);

    const executeRes = await fetch(`http://127.0.0.1:${appPort}/execute/ws`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `# @ws\nGET ws://127.0.0.1:${upstreamPort}/echo\n`
      })
    });

    const executeRaw = await executeRes.text();
    if (executeRes.status !== 200) {
      throw new Error(`POST /execute/ws failed (${executeRes.status}): ${executeRaw}`);
    }

    const executeData = JSON.parse(executeRaw) as ExecuteWSResponse;
    if (!executeData || typeof executeData !== 'object' || !('ws' in executeData)) {
      throw new Error(`POST /execute/ws returned unexpected 200 payload: ${executeRaw}`);
    }
    expect(executeData.ws.wsSessionId).toBeDefined();

    const controlWs = new WebSocket(`ws://127.0.0.1:${appPort}${executeData.ws.downstreamPath}`);
    const envelopes = createEnvelopeCollector(controlWs);
    await new Promise<void>((resolve, reject) => {
      controlWs.addEventListener('open', () => resolve(), { once: true });
      controlWs.addEventListener(
        'error',
        () => reject(new Error('Failed to open downstream control socket')),
        { once: true }
      );
    });

    const replayEnd = await envelopes.next((event) => event.type === 'session.replay.end');
    expect(replayEnd.type).toBe('session.replay.end');

    controlWs.send(
      JSON.stringify({
        type: 'session.send',
        payloadType: 'text',
        payload: 'hello from client'
      })
    );

    const outbound = await envelopes.next((event) => event.type === 'session.outbound');
    expect(outbound.payload).toBe('hello from client');

    const inbound = await envelopes.next((event) => event.type === 'session.inbound');
    expect(inbound.payload).toBe('hello from client');

    controlWs.send(
      JSON.stringify({
        type: 'session.close',
        code: 1000,
        reason: 'done'
      })
    );

    const closed = await envelopes.next((event) => event.type === 'session.closed');
    const closedPayload = closed.payload as { code: number; reason: string; wasClean: boolean };
    expect(closedPayload.code).toBe(1000);
    expect(closedPayload.reason).toBe('done');
  });
});
