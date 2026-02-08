export const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 4097;
export const HEALTH_CHECK_MAX_RETRIES = 10;
export const HEALTH_CHECK_BACKOFF_MS = 100;

/**
 * Generate a cryptographically random token for defense-in-depth.
 * Prevents other local processes from accidentally hitting the server.
 */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Check if the given host is a loopback address.
 */
export function isLoopbackAddress(host: string): boolean {
  return LOOPBACK_ADDRESSES.has(host.toLowerCase());
}

/**
 * Wait for the server to become healthy with retry and backoff.
 */
export async function waitForHealthWithRetry(
  serverUrl: string,
  token: string,
  options: {
    maxRetries: number;
    backoffMs: number;
    onError?: (err: Error) => void;
  }
): Promise<void> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`
  };

  for (let attempt = 0; attempt < options.maxRetries; attempt++) {
    try {
      const response = await fetch(`${serverUrl}/health`, { headers });
      if (response.ok) {
        return;
      }
    } catch (err) {
      if (attempt === options.maxRetries - 1) {
        const error = err instanceof Error ? err : new Error(String(err));
        options.onError?.(error);
        throw error;
      }
    }

    // Exponential backoff
    await new Promise((resolve) => setTimeout(resolve, options.backoffMs * (attempt + 1)));
  }

  throw new Error('Server failed to start: health check timeout');
}

export function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    Bun.spawn([cmd, url]);
  } catch {
    console.warn(`Could not open browser. Please open manually: ${url}`);
  }
}
