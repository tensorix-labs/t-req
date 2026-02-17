import { randomUUID } from 'node:crypto';
import { WsReplayGapError, WsSessionLimitReachedError, WsSessionNotFoundError } from '../errors';
import type { WsPayloadEncoding, WsPayloadType, WsSessionServerEnvelope } from '../schemas';

export type WsReadyState = 'connecting' | 'open' | 'closing' | 'closed';

export interface WsUpstreamSocket {
  readonly readyState: WsReadyState;
  readonly subprotocol?: string;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface OpenWsSessionRequest {
  upstreamUrl: string;
  upstream: WsUpstreamSocket;
  flowId?: string;
  reqExecId?: string;
  idleTimeoutMs?: number;
  replayBufferSize?: number;
  maxFrameBytes?: number;
}

export interface WsSessionState {
  wsSessionId: string;
  upstreamUrl: string;
  flowId?: string;
  reqExecId?: string;
  subprotocol?: string;
  createdAt: number;
  lastActivityAt: number;
  readyState: WsReadyState;
  idleTimeoutMs: number;
  replayBufferSize: number;
  maxFrameBytes: number;
  lastSeq: number;
}

export interface WsSession extends WsSessionState {
  upstream: WsUpstreamSocket;
  replayBuffer: WsSessionServerEnvelope[];
}

export interface WsSessionManagerConfig {
  maxWsSessions: number;
  defaultIdleTimeoutMs?: number;
  defaultReplayBufferSize?: number;
  defaultMaxFrameBytes?: number;
  cleanupIntervalMs?: number;
  now?: () => number;
}

export interface WsSessionManager {
  open(request: OpenWsSessionRequest): WsSessionState;
  get(wsSessionId: string): WsSessionState;
  getOrThrow(wsSessionId: string): WsSession;
  touch(wsSessionId: string): WsSessionState;
  send(wsSessionId: string, payloadType: WsPayloadType, payload: unknown): WsSessionServerEnvelope;
  recordInbound(
    wsSessionId: string,
    payloadType: WsPayloadType,
    payload: unknown
  ): WsSessionServerEnvelope;
  recordError(wsSessionId: string, code: string, message: string): WsSessionServerEnvelope;
  close(wsSessionId: string, code?: number, reason?: string): WsSessionServerEnvelope;
  replay(wsSessionId: string, afterSeq?: number): WsSessionServerEnvelope[];
  hasCapacity(): boolean;
  remove(wsSessionId: string): void;
  dispose(): void;
  getSessions(): ReadonlyMap<string, WsSession>;
}

export const DEFAULT_WS_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const DEFAULT_WS_REPLAY_BUFFER_SIZE = 500;
export const DEFAULT_WS_MAX_FRAME_BYTES = 256 * 1024;
export const DEFAULT_WS_CLEANUP_INTERVAL_MS = 60 * 1000;

type MutableEnvelopeFields = {
  type: string;
  payloadType?: WsPayloadType;
  encoding?: WsPayloadEncoding;
  byteLength?: number;
  payload?: unknown;
  error?: { code: string; message: string };
};

function generateWsSessionId(): string {
  return `ws_${randomUUID()}`;
}

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function toState(session: WsSession): WsSessionState {
  return {
    wsSessionId: session.wsSessionId,
    upstreamUrl: session.upstreamUrl,
    flowId: session.flowId,
    reqExecId: session.reqExecId,
    subprotocol: session.subprotocol,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    readyState: session.upstream.readyState,
    idleTimeoutMs: session.idleTimeoutMs,
    replayBufferSize: session.replayBufferSize,
    maxFrameBytes: session.maxFrameBytes,
    lastSeq: session.lastSeq
  };
}

function appendToReplayBuffer(session: WsSession, envelope: WsSessionServerEnvelope): void {
  session.replayBuffer.push(envelope);
  if (session.replayBuffer.length > session.replayBufferSize) {
    session.replayBuffer.shift();
  }
}

export function createWsSessionManager(config: WsSessionManagerConfig): WsSessionManager {
  const sessions = new Map<string, WsSession>();
  const now = config.now ?? Date.now;
  const defaultIdleTimeoutMs = config.defaultIdleTimeoutMs ?? DEFAULT_WS_IDLE_TIMEOUT_MS;
  const defaultReplayBufferSize = config.defaultReplayBufferSize ?? DEFAULT_WS_REPLAY_BUFFER_SIZE;
  const defaultMaxFrameBytes = config.defaultMaxFrameBytes ?? DEFAULT_WS_MAX_FRAME_BYTES;
  const cleanupIntervalMs = config.cleanupIntervalMs ?? DEFAULT_WS_CLEANUP_INTERVAL_MS;

  function requireSession(wsSessionId: string): WsSession {
    const session = sessions.get(wsSessionId);
    if (!session) {
      throw new WsSessionNotFoundError(wsSessionId);
    }
    return session;
  }

  function emitEnvelope(
    session: WsSession,
    fields: MutableEnvelopeFields,
    persistInReplay = true
  ): WsSessionServerEnvelope {
    const ts = now();
    session.lastSeq++;
    session.lastActivityAt = ts;

    const envelope: WsSessionServerEnvelope = {
      type: fields.type as WsSessionServerEnvelope['type'],
      ts,
      seq: session.lastSeq,
      wsSessionId: session.wsSessionId,
      flowId: session.flowId,
      reqExecId: session.reqExecId,
      payloadType: fields.payloadType,
      encoding: fields.encoding,
      byteLength: fields.byteLength,
      payload: fields.payload,
      error: fields.error
    };

    if (persistInReplay) {
      appendToReplayBuffer(session, envelope);
    }

    return envelope;
  }

  function emitErrorEnvelope(
    session: WsSession,
    code: string,
    message: string,
    payload?: unknown,
    persistInReplay = true
  ): WsSessionServerEnvelope {
    return emitEnvelope(
      session,
      {
        type: 'session.error',
        payload,
        error: { code, message }
      },
      persistInReplay
    );
  }

  function enforceFrameLimit(
    session: WsSession,
    byteLength: number,
    direction: 'inbound' | 'outbound'
  ): WsSessionServerEnvelope | undefined {
    if (byteLength <= session.maxFrameBytes) {
      return undefined;
    }

    return emitErrorEnvelope(
      session,
      'WS_FRAME_TOO_LARGE',
      `WebSocket ${direction} frame exceeds maxFrameBytes (${session.maxFrameBytes})`,
      {
        direction,
        byteLength,
        maxFrameBytes: session.maxFrameBytes
      }
    );
  }

  function closeInternal(
    session: WsSession,
    code: number,
    reason: string,
    wasClean: boolean,
    removeSession = true
  ): WsSessionServerEnvelope {
    try {
      session.upstream.close(code, reason);
    } catch {
      // no-op: closing is best-effort during teardown
    }

    const envelope = emitEnvelope(session, {
      type: 'session.closed',
      payload: { code, reason, wasClean }
    });

    if (removeSession) {
      sessions.delete(session.wsSessionId);
    }

    return envelope;
  }

  const cleanupInterval = setInterval(() => {
    const t = now();
    for (const session of sessions.values()) {
      if (t - session.lastActivityAt > session.idleTimeoutMs) {
        closeInternal(session, 1001, 'Idle timeout', true, true);
      }
    }
  }, cleanupIntervalMs);

  function open(request: OpenWsSessionRequest): WsSessionState {
    if (sessions.size >= config.maxWsSessions) {
      try {
        request.upstream.close(1013, 'Server at capacity');
      } catch {
        // no-op
      }
      throw new WsSessionLimitReachedError(config.maxWsSessions);
    }

    const timestamp = now();
    const wsSessionId = generateWsSessionId();

    const session: WsSession = {
      wsSessionId,
      upstreamUrl: request.upstreamUrl,
      flowId: request.flowId,
      reqExecId: request.reqExecId,
      subprotocol: request.upstream.subprotocol,
      createdAt: timestamp,
      lastActivityAt: timestamp,
      readyState: request.upstream.readyState,
      idleTimeoutMs: request.idleTimeoutMs ?? defaultIdleTimeoutMs,
      replayBufferSize: request.replayBufferSize ?? defaultReplayBufferSize,
      maxFrameBytes: request.maxFrameBytes ?? defaultMaxFrameBytes,
      lastSeq: 0,
      upstream: request.upstream,
      replayBuffer: []
    };

    sessions.set(wsSessionId, session);
    emitEnvelope(session, {
      type: 'session.opened',
      payload: {
        upstreamUrl: request.upstreamUrl,
        subprotocol: session.subprotocol
      }
    });

    return toState(session);
  }

  function get(wsSessionId: string): WsSessionState {
    return toState(requireSession(wsSessionId));
  }

  function getOrThrow(wsSessionId: string): WsSession {
    return requireSession(wsSessionId);
  }

  function touch(wsSessionId: string): WsSessionState {
    const session = requireSession(wsSessionId);
    session.lastActivityAt = now();
    return toState(session);
  }

  function send(
    wsSessionId: string,
    payloadType: WsPayloadType,
    payload: unknown
  ): WsSessionServerEnvelope {
    const session = requireSession(wsSessionId);

    if (payloadType === 'binary') {
      return emitErrorEnvelope(
        session,
        'WS_BINARY_UNSUPPORTED',
        'Binary WebSocket frames are not supported in protocol v1.1',
        { direction: 'outbound' }
      );
    }

    let wirePayload: string;
    let parsedPayload: unknown = payload;

    if (payloadType === 'json') {
      if (typeof payload === 'string') {
        wirePayload = payload;
        try {
          parsedPayload = JSON.parse(payload);
        } catch {
          parsedPayload = payload;
        }
      } else {
        try {
          wirePayload = JSON.stringify(payload);
        } catch {
          return emitErrorEnvelope(
            session,
            'WS_INVALID_JSON',
            'Could not serialize JSON payload for outbound WebSocket message',
            { direction: 'outbound' }
          );
        }
      }
    } else {
      wirePayload = typeof payload === 'string' ? payload : String(payload);
      parsedPayload = wirePayload;
    }

    const byteLength = utf8ByteLength(wirePayload);
    const frameError = enforceFrameLimit(session, byteLength, 'outbound');
    if (frameError) return frameError;

    if (session.upstream.readyState !== 'open') {
      return emitErrorEnvelope(
        session,
        'WS_UPSTREAM_NOT_OPEN',
        `Cannot send WebSocket message while upstream is ${session.upstream.readyState}`,
        { direction: 'outbound' }
      );
    }

    try {
      session.upstream.send(wirePayload);
    } catch (err) {
      return emitErrorEnvelope(
        session,
        'WS_SEND_FAILED',
        err instanceof Error ? err.message : 'Failed to send WebSocket message',
        { direction: 'outbound' }
      );
    }

    return emitEnvelope(session, {
      type: 'session.outbound',
      payloadType,
      encoding: 'utf-8',
      byteLength,
      payload: parsedPayload
    });
  }

  function recordInbound(
    wsSessionId: string,
    payloadType: WsPayloadType,
    payload: unknown
  ): WsSessionServerEnvelope {
    const session = requireSession(wsSessionId);

    if (payloadType === 'binary') {
      return emitErrorEnvelope(
        session,
        'WS_BINARY_UNSUPPORTED',
        'Binary WebSocket frames are not supported in protocol v1.1',
        { direction: 'inbound' }
      );
    }

    let parsedPayload: unknown = payload;
    let wirePayload: string;

    if (payloadType === 'json') {
      if (typeof payload === 'string') {
        wirePayload = payload;
        try {
          parsedPayload = JSON.parse(payload);
        } catch {
          parsedPayload = payload;
        }
      } else {
        try {
          wirePayload = JSON.stringify(payload);
        } catch {
          return emitErrorEnvelope(
            session,
            'WS_INVALID_JSON',
            'Could not serialize JSON payload for inbound WebSocket message',
            { direction: 'inbound' }
          );
        }
      }
    } else {
      wirePayload = typeof payload === 'string' ? payload : String(payload);
      parsedPayload = wirePayload;
    }

    const byteLength = utf8ByteLength(wirePayload);
    const frameError = enforceFrameLimit(session, byteLength, 'inbound');
    if (frameError) return frameError;

    return emitEnvelope(session, {
      type: 'session.inbound',
      payloadType,
      encoding: 'utf-8',
      byteLength,
      payload: parsedPayload
    });
  }

  function recordError(
    wsSessionId: string,
    code: string,
    message: string
  ): WsSessionServerEnvelope {
    const session = requireSession(wsSessionId);
    return emitErrorEnvelope(session, code, message);
  }

  function close(wsSessionId: string, code = 1000, reason = ''): WsSessionServerEnvelope {
    const session = requireSession(wsSessionId);
    return closeInternal(session, code, reason, true, true);
  }

  function replay(wsSessionId: string, afterSeq = 0): WsSessionServerEnvelope[] {
    const session = requireSession(wsSessionId);
    const oldestSeq = session.replayBuffer[0]?.seq;

    if (oldestSeq !== undefined && afterSeq + 1 < oldestSeq) {
      const replayGapError = new WsReplayGapError(wsSessionId, afterSeq, oldestSeq);
      const errorEnvelope = emitErrorEnvelope(
        session,
        replayGapError.code,
        replayGapError.message,
        {
          afterSeq,
          oldestAvailableSeq: oldestSeq
        },
        false
      );
      const replayEnd = emitEnvelope(
        session,
        {
          type: 'session.replay.end',
          payload: {
            afterSeq,
            replayed: 0,
            gap: true
          }
        },
        false
      );
      return [errorEnvelope, replayEnd];
    }

    const replayedEvents = session.replayBuffer.filter((event) => event.seq > afterSeq);
    const replayEnd = emitEnvelope(
      session,
      {
        type: 'session.replay.end',
        payload: {
          afterSeq,
          replayed: replayedEvents.length,
          gap: false
        }
      },
      false
    );

    return [...replayedEvents, replayEnd];
  }

  function hasCapacity(): boolean {
    return sessions.size < config.maxWsSessions;
  }

  function remove(wsSessionId: string): void {
    sessions.delete(wsSessionId);
  }

  function dispose(): void {
    clearInterval(cleanupInterval);
    for (const session of sessions.values()) {
      try {
        session.upstream.close(1001, 'Server shutting down');
      } catch {
        // no-op
      }
    }
    sessions.clear();
  }

  function getSessions(): ReadonlyMap<string, WsSession> {
    return sessions;
  }

  return {
    open,
    get,
    getOrThrow,
    touch,
    send,
    recordInbound,
    recordError,
    close,
    replay,
    hasCapacity,
    remove,
    dispose,
    getSessions
  };
}
