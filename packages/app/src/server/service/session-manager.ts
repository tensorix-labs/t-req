import { createCookieJar } from '@t-req/core/cookies';
import { createCookieStoreFromJar } from '../../utils';
import { SessionNotFoundError } from '../errors';
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  SessionState,
  UpdateVariablesRequest,
  UpdateVariablesResponse
} from '../schemas';
import type { ServiceContext, Session } from './types';
import { CLEANUP_INTERVAL_MS } from './types';
import { generateId, sanitizeVariables } from './utils';

export interface SessionManager {
  create(request: CreateSessionRequest): CreateSessionResponse;
  get(sessionId: string): SessionState;
  update(sessionId: string, request: UpdateVariablesRequest): Promise<UpdateVariablesResponse>;
  delete(sessionId: string): void;
  getInternal(sessionId: string): Session | undefined;
  has(sessionId: string): boolean;
  dispose(): void;
  /** For testing - get the internal sessions map */
  getSessions(): Map<string, Session>;
}

export function createSessionManager(context: ServiceContext): SessionManager {
  const sessions = new Map<string, Session>();

  const bumpTime = (prev: number): number => {
    const n = context.now();
    return n > prev ? n : prev + 1;
  };

  // Session cleanup interval
  const cleanupInterval = setInterval(() => {
    const now = context.now();
    for (const [id, session] of sessions) {
      if (now - session.lastUsedAt > context.sessionTtlMs) {
        sessions.delete(id);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Evict least recently used session when limit reached
  function evictLeastRecentlyUsed(): void {
    let oldest: Session | null = null;
    for (const session of sessions.values()) {
      if (!oldest || session.lastUsedAt < oldest.lastUsedAt) {
        oldest = session;
      }
    }
    if (oldest) {
      sessions.delete(oldest.id);
    }
  }

  async function withSessionLock<T>(session: Session, fn: () => Promise<T>): Promise<T> {
    // Simple per-session mutex: serialize all mutations + runs in a session.
    const prev = session.lock;
    let release: (() => void) | undefined;
    session.lock = new Promise<void>((r) => {
      release = r;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release?.();
    }
  }

  function create(request: CreateSessionRequest): CreateSessionResponse {
    // LRU eviction when limit reached (instead of hard error)
    if (sessions.size >= context.maxSessions) {
      evictLeastRecentlyUsed();
    }

    const sessionId = generateId();
    const now = context.now();
    const cookieJar = createCookieJar();

    sessions.set(sessionId, {
      id: sessionId,
      variables: request.variables ?? {},
      cookieJar,
      cookieStore: createCookieStoreFromJar(cookieJar),
      createdAt: now,
      lastUsedAt: now,
      snapshotVersion: 1,
      lock: Promise.resolve()
    });

    return { sessionId };
  }

  function get(sessionId: string): SessionState {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    const serialized = session.cookieJar.toJSON();
    const cookies = serialized?.cookies ?? [];

    return {
      sessionId: session.id,
      variables: sanitizeVariables(session.variables),
      cookieCount: cookies.length,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      snapshotVersion: session.snapshotVersion
    };
  }

  async function update(
    sessionId: string,
    request: UpdateVariablesRequest
  ): Promise<UpdateVariablesResponse> {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    const runId = `session-${generateId()}`;

    // Serialize variable updates with in-flight executes for this session.
    return await withSessionLock(session, async () => {
      if (request.mode === 'replace') {
        session.variables = request.variables;
      } else {
        session.variables = { ...session.variables, ...request.variables };
      }

      session.lastUsedAt = bumpTime(session.lastUsedAt);
      session.snapshotVersion++;

      context.onEvent?.(session.id, runId, {
        type: 'sessionUpdated',
        variablesChanged: true,
        cookiesChanged: false
      });

      return {
        sessionId,
        snapshotVersion: session.snapshotVersion
      };
    });
  }

  function deleteSession(sessionId: string): void {
    if (!sessions.has(sessionId)) {
      throw new SessionNotFoundError(sessionId);
    }
    sessions.delete(sessionId);
  }

  function getInternal(sessionId: string): Session | undefined {
    return sessions.get(sessionId);
  }

  function has(sessionId: string): boolean {
    return sessions.has(sessionId);
  }

  function dispose(): void {
    clearInterval(cleanupInterval);
    sessions.clear();
  }

  function getSessions(): Map<string, Session> {
    return sessions;
  }

  return {
    create,
    get,
    update,
    delete: deleteSession,
    getInternal,
    has,
    dispose,
    getSessions
  };
}

// Re-export withSessionLock for use by execution-engine
export async function withSessionLock<T>(session: Session, fn: () => Promise<T>): Promise<T> {
  const prev = session.lock;
  let release: (() => void) | undefined;
  session.lock = new Promise<void>((r) => {
    release = r;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release?.();
  }
}
