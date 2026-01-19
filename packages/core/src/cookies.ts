import { Cookie, CookieJar } from 'tough-cookie';

export interface CreateCookieJarOptions {
  /**
   * Whether to reject cookies for public suffixes (e.g. `.com`, `.co.uk`).
   *
   * You almost always want this enabled for correctness and security.
   * Disable only if you have a specific compatibility reason.
   *
   * @default true
   */
  rejectPublicSuffixes?: boolean;
}

/**
 * Create a cookie jar powered by `tough-cookie`.
 *
 * This jar is used by the client to automatically attach `Cookie` headers
 * and persist `Set-Cookie` responses across requests.
 */
export function createCookieJar(options: CreateCookieJarOptions = {}): CookieJar {
  const rejectPublicSuffixes = options.rejectPublicSuffixes ?? true;
  return new CookieJar(undefined, { rejectPublicSuffixes });
}

export { Cookie, CookieJar };
