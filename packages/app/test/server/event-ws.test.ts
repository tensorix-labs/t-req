import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type ServerConfig } from '../../src/server/app';
import type { EventEnvelope, EventManager } from '../../src/server/events';

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

function createEnvelopeCollector(ws: WebSocket) {
  const queue: EventEnvelope[] = [];
  const waiters: Array<{
    predicate: (event: EventEnvelope) => boolean;
    resolve: (event: EventEnvelope) => void;
  }> = [];

  ws.addEventListener('message', (event) => {
    const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
    const envelope = JSON.parse(raw) as EventEnvelope;

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

  const next = (
    predicate: (event: EventEnvelope) => boolean,
    timeoutMs = 2000
  ): Promise<EventEnvelope> => {
    const queuedIdx = queue.findIndex((event) => predicate(event));
    if (queuedIdx !== -1) {
      const queued = queue.splice(queuedIdx, 1)[0];
      if (queued) return Promise.resolve(queued);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const queued = queue.map((event) => `${event.runId}:${event.seq}:${event.type}`).join(', ');
        reject(
          new Error(
            `Timed out waiting for event envelope after ${timeoutMs}ms (queued: ${
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

describe('GET /event/ws', () => {
  let workspaceRoot = '';
  let appServer: Bun.Server | undefined;
  let cleanup:
    | {
        service: { dispose: () => Promise<void> | void };
        eventManager: EventManager;
        dispose: () => void;
      }
    | undefined;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'treq-event-ws-'));

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
  });

  afterEach(async () => {
    appServer?.stop(true);

    if (cleanup) {
      cleanup.eventManager.closeAll();
      await cleanup.service.dispose();
      cleanup.dispose();
    }

    if (workspaceRoot) {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('replays from afterSeq and streams live filtered events', async () => {
    const appPort = appServer?.port;
    if (!appPort || !cleanup) {
      throw new Error('Expected app server to be running');
    }

    cleanup.eventManager.emit('session-1', 'run-1', { type: 'flowStarted', flowId: 'flow-1' });
    cleanup.eventManager.emit('session-1', 'run-1', { type: 'requestQueued', flowId: 'flow-1' });
    cleanup.eventManager.emit('session-2', 'run-2', { type: 'flowStarted', flowId: 'flow-2' });

    const ws = await openWebSocket(
      `ws://127.0.0.1:${appPort}/event/ws?sessionId=session-1&flowId=flow-1&afterSeq=1`
    );
    const envelopes = createEnvelopeCollector(ws);

    const replayed = await envelopes.next((event) => event.type === 'requestQueued');
    expect(replayed.seq).toBe(2);
    expect(replayed.sessionId).toBe('session-1');
    expect(replayed.flowId).toBe('flow-1');

    cleanup.eventManager.emit('session-1', 'run-1', { type: 'fetchStarted', flowId: 'flow-1' });
    const live = await envelopes.next((event) => event.type === 'fetchStarted');
    expect(live.seq).toBe(3);
    expect(live.sessionId).toBe('session-1');
    expect(live.flowId).toBe('flow-1');

    ws.close(1000, 'done');
  });
});
