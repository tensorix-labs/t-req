/**
 * Auth module for t-req server.
 *
 * Provides dual authentication support:
 * - Bearer token: For TUI and external clients
 * - Cookie session: For web UI (HttpOnly, SameSite=Strict)
 * - Script token: For server-spawned scripts (scoped, short-lived, revocable)
 *
 * Web sessions are used for browser authentication only.
 * They are separate from API sessions which store execution state.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
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

export type AuthMethod = 'bearer' | 'cookie' | 'script' | 'none';

/**
 * Payload embedded in script tokens.
 * Contains scoping information for authorization enforcement.
 */
export interface ScriptTokenPayload {
  /** Unique token ID for revocation */
  jti: string;
  /** Script's flow context */
  flowId: string;
  /** Pre-created session ID */
  sessionId: string;
  /** Token creation timestamp */
  createdAt: number;
  /** Expiration timestamp */
  expiresAt: number;
}

/**
 * Result from generateScriptToken containing the token and metadata.
 */
export interface GeneratedScriptToken {
  /** The full token string (script.<payload>.<signature>) */
  token: string;
  /** Token ID for revocation tracking */
  jti: string;
  /** The decoded payload */
  payload: ScriptTokenPayload;
}

declare module 'hono' {
  interface ContextVariableMap {
    authMethod: AuthMethod;
    webSessionId?: string;
    /** Script token payload when authenticated via script token */
    scriptTokenPayload?: ScriptTokenPayload;
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
// Script Token Management
// ============================================================================

/**
 * In-memory tracking of active script tokens for revocation.
 * Maps jti -> expiration timestamp.
 */
const activeScriptTokens = new Map<string, { expiresAt: number }>();

/** Interval handle for script token cleanup */
let scriptTokenCleanupIntervalId: ReturnType<typeof setInterval> | null = null;

/** Script token cleanup interval (1 minute) */
const SCRIPT_TOKEN_CLEANUP_INTERVAL_MS = 60 * 1000;

/** Default script token TTL (15 minutes) */
const DEFAULT_SCRIPT_TOKEN_TTL_MS = 15 * 60 * 1000;

/**
 * Start the script token cleanup interval.
 * Removes expired tokens every minute.
 */
export function startScriptTokenCleanup(): void {
  if (scriptTokenCleanupIntervalId) return; // Already running

  scriptTokenCleanupIntervalId = setInterval(() => {
    const now = Date.now();
    for (const [jti, data] of activeScriptTokens) {
      if (now > data.expiresAt) {
        activeScriptTokens.delete(jti);
      }
    }
  }, SCRIPT_TOKEN_CLEANUP_INTERVAL_MS);
}

/**
 * Stop the script token cleanup interval.
 */
export function stopScriptTokenCleanup(): void {
  if (scriptTokenCleanupIntervalId) {
    clearInterval(scriptTokenCleanupIntervalId);
    scriptTokenCleanupIntervalId = null;
  }
}

/**
 * Generate a scoped script token.
 *
 * Token format: script.<base64url-payload>.<hmac-signature>
 * Legacy format: script_<base64url-payload>_<hmac-signature>
 *
 * Security properties:
 * - HMAC-SHA256 signed using server's main token as secret
 * - Scoped to specific flowId and sessionId
 * - Short TTL (default 15 minutes)
 * - Revocable via jti tracking
 *
 * @param serverToken The server's main authentication token (used as HMAC secret)
 * @param flowId The flow ID to scope the token to
 * @param sessionId The session ID to scope the token to
 * @param ttlMs Token time-to-live in milliseconds (default: 15 minutes)
 */
export function generateScriptToken(
  serverToken: string,
  flowId: string,
  sessionId: string,
  ttlMs: number = DEFAULT_SCRIPT_TOKEN_TTL_MS
): GeneratedScriptToken {
  const jti = randomUUID();
  const now = Date.now();
  const payload: ScriptTokenPayload = {
    jti,
    flowId,
    sessionId,
    createdAt: now,
    expiresAt: now + ttlMs
  };

  // Track for revocation
  activeScriptTokens.set(jti, { expiresAt: payload.expiresAt });

  // Encode payload as base64url
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  // Sign with HMAC-SHA256
  const signature = createHmac('sha256', serverToken).update(encodedPayload).digest('base64url');

  return {
    token: `script.${encodedPayload}.${signature}`,
    jti,
    payload
  };
}

/**
 * Validate a script token.
 *
 * Checks:
 * 1. Token format (script.<payload>.<signature>, legacy script_<payload>_<signature>)
 * 2. HMAC signature validity (timing-safe)
 * 3. Token not expired
 * 4. Token not revoked (jti still tracked)
 *
 * @param serverToken The server's main authentication token
 * @param token The script token to validate
 * @returns The decoded payload if valid, null otherwise
 */
export function validateScriptToken(serverToken: string, token: string): ScriptTokenPayload | null {
  // Check prefix (current and legacy)
  const isDotFormat = token.startsWith('script.');
  const isLegacyUnderscore = token.startsWith('script_');
  if (!isDotFormat && !isLegacyUnderscore) return null;

  const tokenBody = token.slice(7);
  let encodedPayload = '';
  let signature = '';

  if (isDotFormat) {
    const parts = tokenBody.split('.');
    if (parts.length !== 2) return null;
    [encodedPayload, signature] = parts;
  } else {
    // Legacy format: script_<payload>_<signature> (signature is fixed-length base64url)
    const signatureLength = 43; // base64url length for SHA-256 (32 bytes, no padding)
    if (tokenBody.length <= signatureLength + 1) return null;
    const separatorIndex = tokenBody.length - signatureLength - 1;
    if (tokenBody[separatorIndex] !== '_') return null;
    encodedPayload = tokenBody.slice(0, separatorIndex);
    signature = tokenBody.slice(separatorIndex + 1);
  }

  if (!encodedPayload || !signature) return null;

  // Verify signature with timing-safe comparison
  const expectedSignature = createHmac('sha256', serverToken)
    .update(encodedPayload)
    .digest('base64url');

  const sigBuffer = new Uint8Array(Buffer.from(signature, 'base64url'));
  const expectedBuffer = new Uint8Array(Buffer.from(expectedSignature, 'base64url'));

  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  // Decode and parse payload
  let payload: ScriptTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as ScriptTokenPayload;
  } catch {
    return null;
  }

  // Check expiration
  if (Date.now() > payload.expiresAt) return null;

  // Check revocation (jti must still be tracked)
  if (!activeScriptTokens.has(payload.jti)) return null;

  return payload;
}

/**
 * Revoke a script token immediately.
 * Called when a script exits or is cancelled.
 *
 * @param jti The token ID to revoke
 */
export function revokeScriptToken(jti: string): void {
  activeScriptTokens.delete(jti);
}

/**
 * Clear all script tokens (for testing or shutdown).
 */
export function clearAllScriptTokens(): void {
  activeScriptTokens.clear();
}

/**
 * Get the number of active script tokens.
 */
export function getScriptTokenCount(): number {
  return activeScriptTokens.size;
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
        // Check for script token FIRST (script.<payload>.<signature>)
        if (token.startsWith('script.') || token.startsWith('script_')) {
          const payload = validateScriptToken(config.token, token);
          if (!payload) {
            throw new HTTPException(401, { message: 'Invalid or expired script token' });
          }
          c.set('authMethod', 'script');
          c.set('scriptTokenPayload', payload);
          return next();
        }

        // Check main server token
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
  // Detect if running behind HTTPS (via proxy or direct)
  const isSecure =
    c.req.header('x-forwarded-proto') === 'https' || new URL(c.req.url).protocol === 'https:';

  setCookie(c, SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: 30 * 60, // 30 minutes (matches session TTL)
    secure: isSecure
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
