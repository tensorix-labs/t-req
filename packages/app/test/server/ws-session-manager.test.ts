import { describe, expect, test } from 'bun:test';
import {
  WsReplayGapError,
  WsSessionLimitReachedError,
  WsSessionNotFoundError
} from '../../src/server/errors';
import {
  createWsSessionManager,
  type WsReadyState,
  type WsUpstreamSocket
} from '../../src/server/service/ws-session-manager';

class FakeUpstreamSocket implements WsUpstreamSocket {
  readyState: WsReadyState = 'open';
  subprotocol?: string;
  sent: string[] = [];
  closeCalls: Array<{ code?: number; reason?: string }> = [];

  constructor(subprotocol?: string) {
    this.subprotocol = subprotocol;
  }

  send(data: string): void {
    if (this.readyState !== 'open') {
      throw new Error(`Socket is ${this.readyState}`);
    }
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
    this.readyState = 'closed';
  }
}

describe('ws-session-manager lifecycle', () => {
  let now = 1_000;

  const createManager = () =>
    createWsSessionManager({
      maxWsSessions: 10,
      now: () => now,
      cleanupIntervalMs: 10
    });

  test('open/send/inbound/close lifecycle', () => {
    const manager = createManager();
    const socket = new FakeUpstreamSocket('chat');

    const opened = manager.open({
      upstreamUrl: 'wss://example.com/ws',
      upstream: socket,
      flowId: 'flow_1',
      reqExecId: 'exec_1'
    });

    expect(opened.wsSessionId.startsWith('ws_')).toBe(true);
    expect(opened.subprotocol).toBe('chat');
    expect(opened.lastSeq).toBe(1);

    const outbound = manager.send(opened.wsSessionId, 'text', 'hello');
    expect(outbound.type).toBe('session.outbound');
    expect(outbound.payload).toBe('hello');
    expect(socket.sent).toEqual(['hello']);

    const inbound = manager.recordInbound(opened.wsSessionId, 'json', { ok: true });
    expect(inbound.type).toBe('session.inbound');
    expect(inbound.payload).toEqual({ ok: true });

    const closed = manager.close(opened.wsSessionId, 1000, 'done');
    expect(closed.type).toBe('session.closed');
    expect(closed.payload).toMatchObject({ code: 1000, reason: 'done', wasClean: true });
    expect(socket.closeCalls[0]).toEqual({ code: 1000, reason: 'done' });
    expect(() => manager.get(opened.wsSessionId)).toThrow(WsSessionNotFoundError);

    manager.dispose();
  });

  test('binary frames emit protocol error envelopes without crashing session', () => {
    const manager = createManager();
    const socket = new FakeUpstreamSocket();
    const opened = manager.open({
      upstreamUrl: 'wss://example.com/ws',
      upstream: socket
    });

    const outboundError = manager.send(opened.wsSessionId, 'binary', new Uint8Array([1, 2, 3]));
    expect(outboundError.type).toBe('session.error');
    expect(outboundError.error?.code).toBe('WS_BINARY_UNSUPPORTED');

    const inboundError = manager.recordInbound(
      opened.wsSessionId,
      'binary',
      new Uint8Array([4, 5, 6])
    );
    expect(inboundError.type).toBe('session.error');
    expect(inboundError.error?.code).toBe('WS_BINARY_UNSUPPORTED');

    expect(manager.get(opened.wsSessionId).wsSessionId).toBe(opened.wsSessionId);
    manager.dispose();
  });

  test('replay window returns bounded history and replay end marker', () => {
    const manager = createManager();
    const socket = new FakeUpstreamSocket();
    const opened = manager.open({
      upstreamUrl: 'wss://example.com/ws',
      upstream: socket,
      replayBufferSize: 3
    });

    manager.recordInbound(opened.wsSessionId, 'text', 'a');
    manager.recordInbound(opened.wsSessionId, 'text', 'b');
    manager.recordInbound(opened.wsSessionId, 'text', 'c');
    manager.recordInbound(opened.wsSessionId, 'text', 'd');

    const replay = manager.replay(opened.wsSessionId, 2);
    expect(replay.map((e) => e.type)).toEqual([
      'session.inbound',
      'session.inbound',
      'session.inbound',
      'session.replay.end'
    ]);
    expect(replay[0]?.payload).toBe('b');
    expect(replay[1]?.payload).toBe('c');
    expect(replay[2]?.payload).toBe('d');

    manager.dispose();
  });

  test('replay gap returns explicit session.error envelope', () => {
    const manager = createManager();
    const socket = new FakeUpstreamSocket();
    const opened = manager.open({
      upstreamUrl: 'wss://example.com/ws',
      upstream: socket,
      replayBufferSize: 2
    });

    manager.recordInbound(opened.wsSessionId, 'text', 'm1');
    manager.recordInbound(opened.wsSessionId, 'text', 'm2');
    manager.recordInbound(opened.wsSessionId, 'text', 'm3');

    const replay = manager.replay(opened.wsSessionId, 0);
    expect(replay).toHaveLength(2);
    expect(replay[0]?.type).toBe('session.error');
    expect(replay[0]?.error?.code).toBe(new WsReplayGapError(opened.wsSessionId, 0, 3).code);
    expect(replay[1]?.type).toBe('session.replay.end');

    manager.dispose();
  });

  test('idle sessions are closed and evicted by cleanup', async () => {
    const manager = createWsSessionManager({
      maxWsSessions: 10,
      now: () => now,
      cleanupIntervalMs: 5
    });
    const socket = new FakeUpstreamSocket();
    const opened = manager.open({
      upstreamUrl: 'wss://example.com/ws',
      upstream: socket,
      idleTimeoutMs: 20
    });

    now += 50;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(socket.closeCalls.length).toBeGreaterThan(0);
    expect(socket.closeCalls[0]?.code).toBe(1001);
    expect(() => manager.get(opened.wsSessionId)).toThrow(WsSessionNotFoundError);

    manager.dispose();
  });

  test('session cap is enforced', () => {
    const manager = createWsSessionManager({
      maxWsSessions: 1,
      now: () => now,
      cleanupIntervalMs: 10
    });
    const socket1 = new FakeUpstreamSocket();
    manager.open({
      upstreamUrl: 'wss://example.com/one',
      upstream: socket1
    });

    const socket2 = new FakeUpstreamSocket();
    expect(() =>
      manager.open({
        upstreamUrl: 'wss://example.com/two',
        upstream: socket2
      })
    ).toThrow(WsSessionLimitReachedError);
    expect(socket2.closeCalls[0]).toEqual({ code: 1013, reason: 'Server at capacity' });

    manager.dispose();
  });

  test('touch refreshes lastActivityAt for keepalive use-cases', () => {
    const manager = createManager();
    const socket = new FakeUpstreamSocket();
    const opened = manager.open({
      upstreamUrl: 'wss://example.com/ws',
      upstream: socket
    });

    const original = manager.get(opened.wsSessionId).lastActivityAt;
    now += 25;

    const touched = manager.touch(opened.wsSessionId);
    expect(touched.lastActivityAt).toBeGreaterThan(original);
    expect(touched.lastActivityAt).toBe(now);

    manager.dispose();
  });
});
