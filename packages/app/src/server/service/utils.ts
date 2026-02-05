import type { CookieJar } from '@t-req/core/cookies';
import type { loadCookieJarData } from '@t-req/core/cookies/persistence';
import type { ResponseHeader } from '../schemas';
import { SENSITIVE_HEADER_PATTERNS, SENSITIVE_KEY_PATTERNS } from './types';

// ============================================================================
// Internal Types for Fetch Response Processing
// ============================================================================

export type ByteStreamReader = {
  read: () => Promise<{ done: boolean; value?: Uint8Array }>;
  cancel: () => Promise<void>;
};

export type ByteStream = { getReader: () => ByteStreamReader };

export interface FetchResponse {
  status: number;
  statusText: string;
  headers: {
    forEach(callback: (value: string, name: string) => void): void;
    get(name: string): string | null;
    getSetCookie?(): string[];
  };
  body: ByteStream | null;
  text(): Promise<string>;
  clone(): FetchResponse;
  arrayBuffer(): Promise<ArrayBuffer>;
}

// ============================================================================
// ID Generation
// ============================================================================

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export function generateFlowId(): string {
  return `flow_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export function generateReqExecId(): string {
  return `exec_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

// ============================================================================
// Binary Content Detection
// ============================================================================

export function isBinaryContent(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  // Check first 8192 bytes for null bytes or non-UTF8 sequences
  const checkLength = Math.min(bytes.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    const byte = bytes[i];
    if (byte === undefined) continue;
    // Null byte indicates binary
    if (byte === 0) return true;
    // Check for invalid UTF-8 sequences
    if (byte >= 0x80) {
      // UTF-8 continuation byte validation
      if ((byte & 0xc0) === 0x80 && (i === 0 || ((bytes[i - 1] ?? 0) & 0x80) === 0)) {
        return true;
      }
    }
  }
  return false;
}

// ============================================================================
// Buffer Utilities
// ============================================================================

export function concatUint8(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const out = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

// ============================================================================
// Sanitization Utilities
// ============================================================================

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function isSensitiveHeader(name: string): boolean {
  return SENSITIVE_HEADER_PATTERNS.some((pattern) => pattern.test(name));
}

export function sanitizeVariables(variables: Record<string, unknown>): Record<string, unknown> {
  const seen = new WeakSet<object>();

  const sanitizeValue = (value: unknown): unknown => {
    if (value === null) return null;
    if (typeof value !== 'object') return value;

    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((v) => sanitizeValue(v));
    }

    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = isSensitiveKey(k) ? '[REDACTED]' : sanitizeValue(v);
    }
    return out;
  };

  return sanitizeValue(variables) as Record<string, unknown>;
}

export function sanitizeHeaders(headers: ResponseHeader[]): ResponseHeader[] {
  return headers.map((h) => ({
    name: h.name,
    value: isSensitiveHeader(h.name) ? '[REDACTED]' : h.value
  }));
}

// ============================================================================
// Content Type Utilities
// ============================================================================

export function contentTypeIndicatesFormData(headers: unknown): boolean {
  // Core parser currently exposes headers in a few shapes; support common ones.
  if (!headers) return false;

  const hasMultipart = (value: string): boolean =>
    value.toLowerCase().includes('multipart/form-data');

  // Array of [name, value]
  if (Array.isArray(headers)) {
    for (const pair of headers) {
      const name = pair?.[0];
      const value = pair?.[1];
      if (
        typeof name === 'string' &&
        name.toLowerCase() === 'content-type' &&
        typeof value === 'string'
      ) {
        return hasMultipart(value);
      }
    }
    return false;
  }

  // Record<string, string>
  if (typeof headers === 'object') {
    const rec = headers as Record<string, unknown>;
    const value = rec['content-type'] ?? rec['Content-Type'];
    return typeof value === 'string' ? hasMultipart(value) : false;
  }

  return false;
}

// ============================================================================
// Cookie Utilities
// ============================================================================

export function restoreCookieJarFromData(
  jar: CookieJar,
  jarData: ReturnType<typeof loadCookieJarData>
): void {
  if (!jarData) return;
  for (const cookie of jarData.cookies) {
    try {
      const domain = cookie.domain || '';
      const cookieStr = `${cookie.key}=${cookie.value}; Domain=${domain}; Path=${cookie.path}`;
      // NOTE: tough-cookie requires a URL; scheme doesn't matter for host/path matching here.
      jar.setCookieSync(cookieStr, `https://${domain}${cookie.path}`);
    } catch {
      // Ignore invalid cookies
    }
  }
}
