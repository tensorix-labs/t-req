import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { CookieJar } from '../cookies';

// ============================================================================
// Types
// ============================================================================

export type CookieJarData = {
  version: number;
  cookies: Array<{
    key: string;
    value: string;
    domain: string;
    path: string;
    expires?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: string;
  }>;
};

export type CookieJarManager = {
  load(): CookieJarData | null;
  save(jar: CookieJar): void;
  withLock<T>(fn: () => Promise<T>): Promise<T>;
};

// ============================================================================
// In-Process Mutex (per jarPath)
// ============================================================================

const locks = new Map<string, Promise<void>>();

async function withLock<T>(jarPath: string, fn: () => Promise<T>): Promise<T> {
  const resolvedPath = path.resolve(jarPath);

  // Promise-chain mutex: each call appends to the tail, ensuring FIFO exclusivity.
  const prev = locks.get(resolvedPath) ?? Promise.resolve();

  let release: (() => void) | undefined;
  const current = new Promise<void>((r) => {
    release = r;
  });

  const tail = prev.then(() => current);
  locks.set(resolvedPath, tail);

  try {
    await prev;
    return await fn();
  } finally {
    release?.();
    // Only delete if nobody queued behind us.
    if (locks.get(resolvedPath) === tail) {
      locks.delete(resolvedPath);
    }
  }
}

// ============================================================================
// Load / Save Functions
// ============================================================================

/**
 * Load cookie jar data from a file.
 * Returns null if the file doesn't exist.
 */
export function loadCookieJarData(jarPath: string): CookieJarData | null {
  const resolvedPath = path.resolve(jarPath);

  if (!existsSync(resolvedPath)) {
    return null;
  }

  try {
    const content = readFileSync(resolvedPath, 'utf-8');
    const data = JSON.parse(content) as CookieJarData;

    // Validate basic structure
    if (!data || typeof data !== 'object') {
      return null;
    }

    if (!Array.isArray(data.cookies)) {
      return null;
    }

    return data;
  } catch {
    // Invalid or corrupted file - return null to start fresh
    return null;
  }
}

/**
 * Save cookie jar data to a file.
 * Uses atomic write (write to temp file, then rename).
 */
export function saveCookieJarData(jarPath: string, data: CookieJarData): void {
  const resolvedPath = path.resolve(jarPath);

  // Ensure parent directory exists
  const dir = path.dirname(resolvedPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Write to temp file first (atomic write)
  const tempPath = `${resolvedPath}.tmp.${process.pid}`;
  const content = JSON.stringify(data, null, 2);

  try {
    writeFileSync(tempPath, content, 'utf-8');
    renameSync(tempPath, resolvedPath);
  } catch (err) {
    // Clean up temp file on error
    try {
      if (existsSync(tempPath)) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('node:fs').unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }
}

/**
 * Convert CookieJar to serializable data.
 */
export function cookieJarToData(jar: CookieJar): CookieJarData {
  const serialized = jar.toJSON();
  const cookies = (serialized?.cookies ?? []) as Array<{
    key?: string;
    value?: string;
    domain?: string;
    path?: string;
    expires?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: string;
  }>;

  return {
    version: 1,
    cookies: cookies.map((c) => {
      const cookie: CookieJarData['cookies'][number] = {
        key: c.key ?? '',
        value: c.value ?? '',
        domain: c.domain ?? '',
        path: c.path ?? '/'
      };
      // Only include optional fields if defined
      if (c.expires) cookie.expires = c.expires;
      if (c.secure !== undefined) cookie.secure = c.secure;
      if (c.httpOnly !== undefined) cookie.httpOnly = c.httpOnly;
      if (c.sameSite) cookie.sameSite = c.sameSite;
      return cookie;
    })
  };
}

// ============================================================================
// Cookie Jar Manager
// ============================================================================

/**
 * Create a cookie jar manager for a specific jar path.
 */
export function createCookieJarManager(jarPath: string): CookieJarManager {
  return {
    load(): CookieJarData | null {
      return loadCookieJarData(jarPath);
    },

    save(jar: CookieJar): void {
      const data = cookieJarToData(jar);
      saveCookieJarData(jarPath, data);
    },

    async withLock<T>(fn: () => Promise<T>): Promise<T> {
      return withLock(jarPath, fn);
    }
  };
}

// ============================================================================
// Debounced Save
// ============================================================================

const DEBOUNCE_INTERVAL_MS = 250;

type DebouncedSaveEntry = {
  timer: NodeJS.Timeout;
  jarPath: string;
  jar: CookieJar;
};

const debouncedSaveEntries = new Map<string, DebouncedSaveEntry>();

/**
 * Schedule a debounced save of the cookie jar.
 * Multiple saves within the debounce interval will be coalesced.
 */
export function scheduleCookieJarSave(jarPath: string, jar: CookieJar): void {
  const resolvedPath = path.resolve(jarPath);

  // Clear any existing timer
  const existing = debouncedSaveEntries.get(resolvedPath);
  if (existing) clearTimeout(existing.timer);

  // Schedule new save
  const timer = setTimeout(() => {
    debouncedSaveEntries.delete(resolvedPath);
    void withLock(jarPath, async () => {
      try {
        const data = cookieJarToData(jar);
        saveCookieJarData(jarPath, data);
      } catch {
        // Ignore save errors in debounced context
      }
      return;
    });
  }, DEBOUNCE_INTERVAL_MS);

  debouncedSaveEntries.set(resolvedPath, { timer, jarPath, jar });
}

/**
 * Flush all pending debounced saves immediately.
 * Used for graceful shutdown.
 */
export async function flushPendingCookieSaves(): Promise<void> {
  const entries = Array.from(debouncedSaveEntries.values());
  debouncedSaveEntries.clear();

  for (const entry of entries) {
    clearTimeout(entry.timer);
  }

  // Best-effort flush (keep going even if one fails).
  await Promise.all(
    entries.map(async (entry) => {
      await withLock(entry.jarPath, async () => {
        const data = cookieJarToData(entry.jar);
        saveCookieJarData(entry.jarPath, data);
        return;
      });
    })
  );
}
