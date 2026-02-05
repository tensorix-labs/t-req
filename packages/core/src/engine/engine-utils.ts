import type { EngineEvent, EventSink, IO } from '../runtime/types';

export function emit(onEvent: EventSink | undefined, event: EngineEvent): void {
  onEvent?.(event);
}

export function firstOrThrow<T>(arr: T[], ctx: string): T {
  const first = arr[0];
  if (!first) {
    throw new Error(ctx);
  }
  return first;
}

export function dirnameFromPath(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  if (idx === -1) return '.';
  return idx === 0 ? p.slice(0, 1) : p.slice(0, idx);
}

export function isAbsolutePath(p: string): boolean {
  if (p.startsWith('/') || p.startsWith('\\')) return true;
  if (/^[A-Za-z]:[\\/]/.test(p)) return true;
  if (p.startsWith('\\\\')) return true;
  return false;
}

export function joinWithSep(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  const sep = a.includes('\\') ? '\\' : '/';
  const aTrim = a.endsWith('/') || a.endsWith('\\') ? a.slice(0, -1) : a;
  const bTrim = b.startsWith('/') || b.startsWith('\\') ? b.slice(1) : b;
  return `${aTrim}${sep}${bTrim}`;
}

export function getFileBasePath(filePath: string, io?: IO): string {
  if (io) {
    return io.path.dirname(io.path.resolve(filePath));
  }

  const cwd =
    (globalThis as unknown as { process?: { cwd?: () => string } }).process?.cwd?.() ?? '.';
  const absolute = isAbsolutePath(filePath) ? filePath : joinWithSep(cwd, filePath);
  return dirnameFromPath(absolute);
}

export function withCookieHeader(
  headers: Record<string, string>,
  cookie: string | undefined
): Record<string, string> {
  if (!cookie) return headers;
  const existing = headers['Cookie'] || headers['cookie'] || '';
  return {
    ...headers,
    Cookie: existing ? `${existing}; ${cookie}` : cookie
  };
}

/**
 * Delay for retry.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
