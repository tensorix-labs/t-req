import type { Context } from 'hono';
import { Hono } from 'hono';
import {
  createWebSession,
  deleteSessionCookie,
  deleteWebSession,
  getSessionCookie,
  isValidSession,
  setSessionCookie
} from './auth';

/** Production URL for the hosted web UI */
export const WEB_UI_PROXY_URL = 'https://app-dev.t-req.io';

export interface WebConfig {
  /** Whether web UI is enabled */
  enabled: boolean;
}

function securityHeaders(): Record<string, string> {
  return {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // CSP: Allow self for all resource types
    // 'unsafe-inline' for styles needed for most UI frameworks
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "font-src 'self'",
      "frame-ancestors 'none'"
    ].join('; ')
  };
}

/**
 * Build response headers, merging upstream headers with security headers.
 */
function buildResponseHeaders(
  response: Response,
  overrideContentType?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type':
      overrideContentType ?? response.headers.get('Content-Type') ?? 'application/octet-stream',
    ...securityHeaders()
  };

  // Preserve caching headers if present
  const etag = response.headers.get('ETag');
  if (etag) headers['ETag'] = etag;

  const cacheControl = response.headers.get('Cache-Control');
  headers['Cache-Control'] = cacheControl ?? 'no-cache';

  return headers;
}

// ============================================================================
// Proxy Handler
// ============================================================================

/**
 * Create a proxy handler that forwards requests to a remote URL.
 */
function createProxyHandler(targetBase: string) {
  return async (c: Context): Promise<Response> => {
    const pathname = new URL(c.req.url).pathname;
    const targetUrl = `${targetBase}${pathname}`;

    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          Accept: c.req.header('Accept') ?? '*/*',
          'Accept-Encoding': c.req.header('Accept-Encoding') ?? 'gzip, deflate'
        }
      });

      // SPA fallback for routes without file extensions
      if (response.status === 404 && !pathname.includes('.')) {
        const indexResponse = await fetch(`${targetBase}/index.html`);
        if (indexResponse.ok) {
          return new Response(indexResponse.body, {
            status: 200,
            headers: buildResponseHeaders(indexResponse, 'text/html; charset=utf-8')
          });
        }
      }

      return new Response(response.body, {
        status: response.status,
        headers: buildResponseHeaders(response)
      });
    } catch (err) {
      console.error('Web UI proxy error:', err);
      const errorHtml = `
<!DOCTYPE html>
<html>
<head><title>Proxy Error</title></head>
<body>
  <h1>Unable to load UI</h1>
  <p>Could not connect to ${targetBase}</p>
  <p>Please check your network connection and try again.</p>
</body>
</html>`;
      return new Response(errorHtml, {
        status: 502,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          ...securityHeaders()
        }
      });
    }
  };
}

export function createWebRoutes() {
  const app = new Hono();

  app.get('/auth/init', (c) => {
    const existing = getSessionCookie(c);

    if (!existing || !isValidSession(existing)) {
      const sessionId = createWebSession();
      setSessionCookie(c, sessionId);
    }

    return c.redirect('/');
  });

  app.post('/auth/logout', (c) => {
    const sessionId = getSessionCookie(c);
    if (sessionId) {
      deleteWebSession(sessionId);
      deleteSessionCookie(c);
    }
    return c.json({ ok: true });
  });

  app.get('/auth/status', (c) => {
    const sessionId = getSessionCookie(c);
    const valid = sessionId ? isValidSession(sessionId) : false;
    return c.json({ authenticated: valid });
  });

  // Always proxy to the production UI URL
  app.get('*', createProxyHandler(WEB_UI_PROXY_URL));

  return app;
}

const API_PATHS = new Set([
  '/health',
  '/capabilities',
  '/config',
  '/parse',
  '/execute',
  '/session',
  '/flows',
  '/workspace',
  '/script',
  '/test',
  '/event',
  '/doc'
]);

export function isApiPath(pathname: string): boolean {
  if (API_PATHS.has(pathname)) return true;
  for (const apiPath of API_PATHS) {
    if (pathname.startsWith(`${apiPath}/`)) return true;
  }
  if (pathname.startsWith('/auth/')) return false;
  return false;
}

export { securityHeaders };
