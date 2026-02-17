import { describe, expect, test } from 'bun:test';
import type { TreqClient } from '../src/gen/sdk.gen';
import {
  connectObserverWs,
  connectRequestWsSession,
  executeAndConnectRequestWs,
  type ObserverWsEventEnvelope,
  type WebSocketFactory,
  type WsSessionServerEnvelope
} from '../src/ws';

type Listener = (event: Event) => void;

class MockWebSocket {
  readonly url: string;
  readonly init?: unknown;
  binaryType: BinaryType = 'blob';
  sentFrames: string[] = [];
  isClosed = false;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(url: string, init?: unknown) {
    this.url = url;
    this.init = init;

    queueMicrotask(() => {
      this.dispatch('open', new Event('open'));
    });
  }

  addEventListener(type: string, listener: Listener) {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener) {
    const set = this.listeners.get(type);
    if (!set) return;
    set.delete(listener);
  }

  send(data: string) {
    this.sentFrames.push(data);
  }

  close(code = 1000, reason = '') {
    this.isClosed = true;
    this.dispatch('close', new CloseEvent('close', { code, reason, wasClean: true }));
  }

  emitMessage(data: unknown) {
    this.dispatch('message', new MessageEvent('message', { data }));
  }

  emitError() {
    this.dispatch('error', new Event('error'));
  }

  private dispatch(type: string, event: Event) {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const listener of set) {
      listener(event);
    }
  }
}

function createMockFactory() {
  const instances: MockWebSocket[] = [];
  const inits: Array<unknown> = [];

  const webSocketFactory: WebSocketFactory = (url, init) => {
    const socket = new MockWebSocket(url, init);
    instances.push(socket);
    inits.push(init);
    return socket as unknown as WebSocket;
  };

  return { webSocketFactory, instances, inits };
}

describe('observer websocket helpers', () => {
  test('connectObserverWs builds URL, forwards auth header, and yields envelopes', async () => {
    const factory = createMockFactory();
    const connection = await connectObserverWs({
      baseUrl: 'http://localhost:4097/api',
      sessionId: 'session-1',
      flowId: 'flow-1',
      afterSeq: 7,
      token: 'secret',
      webSocketFactory: factory.webSocketFactory
    });

    expect(factory.instances).toHaveLength(1);
    expect(factory.instances[0]?.url).toBe(
      'ws://localhost:4097/api/event/ws?sessionId=session-1&flowId=flow-1&afterSeq=7'
    );
    expect(factory.inits[0]).toEqual({ headers: { Authorization: 'Bearer secret' } });

    const stream = connection[Symbol.asyncIterator]();
    const eventEnvelope: ObserverWsEventEnvelope = {
      type: 'fetchStarted',
      ts: Date.now(),
      runId: 'run-1',
      seq: 1,
      payload: { method: 'GET', url: 'https://example.com' }
    };
    factory.instances[0]?.emitMessage(JSON.stringify(eventEnvelope));

    const next = await stream.next();
    expect(next.done).toBe(false);
    expect(next.value).toEqual(eventEnvelope);

    connection.close(1000, 'done');
  });

  test('observer reconnect supports afterSeq overrides', async () => {
    const factory = createMockFactory();
    const connection = await connectObserverWs({
      baseUrl: 'http://localhost:4097',
      flowId: 'flow-1',
      afterSeq: 2,
      webSocketFactory: factory.webSocketFactory
    });

    const reconnected = await connection.reconnect(42);

    expect(factory.instances).toHaveLength(2);
    expect(factory.instances[1]?.url).toBe(
      'ws://localhost:4097/event/ws?flowId=flow-1&afterSeq=42'
    );

    reconnected.close(1000, 'done');
  });
});

describe('request session websocket helpers', () => {
  test('connectRequestWsSession sends typed control envelopes', async () => {
    const factory = createMockFactory();
    const connection = await connectRequestWsSession('ws_abc', {
      baseUrl: 'https://api.example.com',
      afterSeq: 5,
      webSocketFactory: factory.webSocketFactory
    });

    expect(factory.instances).toHaveLength(1);
    expect(factory.instances[0]?.url).toBe('wss://api.example.com/ws/session/ws_abc?afterSeq=5');

    connection.sendText('hello');
    connection.sendJson({ ok: true });
    connection.ping();
    connection.close(1000, 'finished');

    const sent = factory.instances[0]?.sentFrames.map((item) => JSON.parse(item));
    expect(sent?.[0]).toEqual({ type: 'session.send', payloadType: 'text', payload: 'hello' });
    expect(sent?.[1]).toEqual({ type: 'session.send', payloadType: 'json', payload: { ok: true } });
    expect(sent?.[2]).toEqual({ type: 'session.ping' });
    expect(sent?.[3]).toEqual({ type: 'session.close', code: 1000, reason: 'finished' });

    const stream = connection[Symbol.asyncIterator]();
    const inboundEnvelope: WsSessionServerEnvelope = {
      type: 'session.inbound',
      ts: Date.now(),
      seq: 6,
      wsSessionId: 'ws_abc',
      payloadType: 'text',
      encoding: 'utf-8',
      payload: 'hello'
    };
    factory.instances[0]?.emitMessage(JSON.stringify(inboundEnvelope));

    const next = await stream.next();
    expect(next.done).toBe(false);
    expect(next.value).toEqual(inboundEnvelope);

    connection.disconnect(1000, 'done');
    expect(factory.instances[0]?.isClosed).toBe(true);
  });

  test('executeAndConnectRequestWs uses postExecuteWs and opens downstream socket', async () => {
    const factory = createMockFactory();
    const postExecuteWsCalls: unknown[] = [];

    const fakeClient = {
      postExecuteWs: (options?: unknown) => {
        postExecuteWsCalls.push(options);
        return Promise.resolve({
          data: {
            runId: 'run-1',
            request: { index: 0, method: 'GET', url: 'ws://upstream.example/socket' },
            resolved: {
              workspaceRoot: '/workspace',
              projectRoot: '/workspace',
              basePath: '/workspace'
            },
            ws: {
              wsSessionId: 'ws_generated',
              downstreamPath: '/ws/session/ws_generated',
              upstreamUrl: 'ws://upstream.example/socket',
              replayBufferSize: 500,
              lastSeq: 1
            }
          },
          error: undefined,
          response: new Response('{}', { status: 200 })
        });
      }
    } as unknown as TreqClient;

    const result = await executeAndConnectRequestWs({
      client: fakeClient,
      request: { content: '# @ws\nGET ws://upstream.example/socket\n' },
      baseUrl: 'http://localhost:4097',
      webSocketFactory: factory.webSocketFactory
    });

    expect(postExecuteWsCalls).toHaveLength(1);
    expect(result.execute.ws.wsSessionId).toBe('ws_generated');
    expect(result.connection.wsSessionId).toBe('ws_generated');
    expect(factory.instances[0]?.url).toBe('ws://localhost:4097/ws/session/ws_generated');

    result.connection.disconnect(1000, 'done');
  });
});
