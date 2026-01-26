/**
 * Auth module for t-req server.
 *
 * Provides dual authentication support:
 * - Bearer token: For TUI and external clients
 * - Cookie session: For web UI (HttpOnly, SameSite=Strict)
 *
 * Web sessions are used for browser authentication only.
 * They are separate from API sessions which store execution state.
 */

import type { Context, Next } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';

export interface WebSession {
  id: string;
  createdAt: number;
  lastAccessedAt: number;
}

export interface AuthConfig {
  token?: string;
  /** Allow cookie-based authentication (default: true). Set to false for expose mode. */
  allowCookieAuth?: boolean;
  sessionTtlMs?: number;
}

export type AuthMethod = 'bearer' | 'cookie' | 'none';

declare module 'hono' {
  interface ContextVariableMap {
    authMethod: AuthMethod;
    webSessionId?: string;
  }
}

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SESSION_CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
const SESSION_COOKIE_NAME = 'treq_session';

const webSessions = new Map<string, WebSession>();
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Create a new web session and return its ID.
 */
export function createWebSession(): string {
  const id = crypto.randomUUID();
  const now = Date.now();
  webSessions.set(id, { id, createdAt: now, lastAccessedAt: now });
  return id;
}

/**
 * Check if a web session is valid (exists and not expired).
 */
export function isValidSession(id: string, ttlMs: number = DEFAULT_SESSION_TTL_MS): boolean {
  const session = webSessions.get(id);
  if (!session) return false;
  return Date.now() - session.lastAccessedAt < ttlMs;
}

/**
 * Update the lastAccessedAt timestamp of a session (sliding expiry).
 */
export function touchSession(id: string): void {
  const session = webSessions.get(id);
  if (session) {
    session.lastAccessedAt = Date.now();
  }
}

/**
 * Delete a web session.
 */
export function deleteWebSession(id: string): void {
  webSessions.delete(id);
}

/**
 * Get the number of active web sessions.
 */
export function getWebSessionCount(): number {
  return webSessions.size;
}

/**
 * Start the session cleanup interval.
 * Removes expired sessions every minute.
 */
export function startSessionCleanup(ttlMs: number = DEFAULT_SESSION_TTL_MS): void {
  if (cleanupIntervalId) return; // Already running

  cleanupIntervalId = setInterval(() => {
    const now = Date.now();
    for (const [id, session] of webSessions) {
      if (now - session.lastAccessedAt > ttlMs) {
        webSessions.delete(id);
      }
    }
  }, SESSION_CLEANUP_INTERVAL_MS);
}

/**
 * Stop the session cleanup interval.
 */
export function stopSessionCleanup(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

/**
 * Clear all web sessions (for testing or shutdown).
 */
export function clearAllWebSessions(): void {
  webSessions.clear();
}

// ============================================================================
// Auth Middleware
// ============================================================================

/**
 * Create authentication middleware.
 *
 * This middleware supports both bearer token and cookie-based authentication.
 * The behavior depends on allowCookieAuth and whether a token is configured.
 *
 * Priority:
 * 1. Bearer token (if present and valid)
 * 2. Cookie session (if allowCookieAuth and session valid)
 * 3. No auth (if no token configured)
 * 4. 401 Unauthorized (if auth required but not provided)
 */
export function createAuthMiddleware(config: AuthConfig) {
  const ttlMs = config.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const allowCookieAuth = config.allowCookieAuth ?? true;

  return async (c: Context, next: Next) => {
    // 1. Check bearer token
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);

      // If token is configured, validate it
      if (config.token) {
        if (token === config.token) {
          c.set('authMethod', 'bearer');
          return next();
        }
        // Invalid token - reject immediately
        throw new HTTPException(401, { message: 'Invalid token' });
      }

      // Token provided but not configured (shouldn't happen in practice)
      // Just proceed since auth isn't required
    }

    // 2. Check cookie session (if cookie auth is allowed)
    if (allowCookieAuth) {
      const sessionId = getCookie(c, SESSION_COOKIE_NAME);
      if (sessionId && isValidSession(sessionId, ttlMs)) {
        touchSession(sessionId); // Update lastAccessedAt (sliding expiry)
        c.set('authMethod', 'cookie');
        c.set('webSessionId', sessionId);
        return next();
      }
    }

    // 3. No auth required if no token configured
    if (!config.token) {
      c.set('authMethod', 'none');
      return next();
    }

    // 4. Auth required but not provided
    throw new HTTPException(401, { message: 'Unauthorized' });
  };
}

export function setSessionCookie(c: Context, sessionId: string): void {
  setCookie(c, SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: 30 * 60 // 30 minutes (matches session TTL)
    // Note: No 'secure' flag - localhost doesn't use HTTPS
  });
}

export function deleteSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: '/'
  });
}

export function getSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE_NAME);
}

export { SESSION_COOKIE_NAME };
