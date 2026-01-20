import type { CookieJar } from '@t-req/core/cookies';
import type { CookieStore } from '@t-req/core/runtime';

/**
 * Create a CookieStore wrapper around tough-cookie's CookieJar.
 * Uses runtime check instead of unsafe type assertion.
 */
export function createCookieStoreFromJar(jar: CookieJar): CookieStore {
  return {
    getCookieHeader: (url: string) => {
      return jar.getCookieStringSync(url) || undefined;
    },
    setFromResponse: (url: string, response: Response) => {
      // Runtime check instead of unsafe type assertion
      const headers = response.headers as unknown as Record<string, unknown>;
      const setCookies =
        typeof headers.getSetCookie === 'function'
          ? (headers.getSetCookie as () => string[])()
          : [];
      for (const cookie of setCookies) {
        jar.setCookieSync(cookie, url);
      }
    }
  };
}
