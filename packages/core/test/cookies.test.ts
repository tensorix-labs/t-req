import { describe, expect, test } from 'bun:test';
import { Cookie, createCookieJar } from '../src/cookies';

describe('createCookieJar', () => {
  test('sets and gets cookies', () => {
    const jar = createCookieJar();

    jar.setCookieSync('session=abc123; Path=/', 'https://example.com/');

    const cookies = jar.getCookiesSync('https://example.com/');
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.key).toBe('session');
    expect(cookies[0]?.value).toBe('abc123');
  });

  test('sets creation time automatically', () => {
    const jar = createCookieJar();
    const before = new Date();

    jar.setCookieSync('session=abc123; Path=/', 'https://example.com/');

    const cookies = jar.getCookiesSync('https://example.com/');
    const creation = cookies[0]?.creation;
    expect(creation).toBeInstanceOf(Date);
    expect((creation as Date).getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  test('matches subdomain cookies', () => {
    const jar = createCookieJar();

    jar.setCookieSync('session=abc123; Domain=example.com; Path=/', 'https://example.com/');

    const cookies = jar.getCookiesSync('https://api.example.com/');
    expect(cookies).toHaveLength(1);
  });

  test('matches path cookies', () => {
    const jar = createCookieJar();

    jar.setCookieSync('session=abc123; Path=/api', 'https://example.com/api');

    expect(jar.getCookiesSync('https://example.com/api/users')).toHaveLength(1);
    expect(jar.getCookiesSync('https://example.com/other')).toHaveLength(0);
  });

  test('filters expired cookies', () => {
    const jar = createCookieJar();

    // Set expired cookie
    const pastDate = new Date(Date.now() - 1000).toUTCString();
    jar.setCookieSync(`expired=old; Expires=${pastDate}; Path=/`, 'https://example.com/', {
      ignoreError: true
    });

    // Set valid cookie
    const futureDate = new Date(Date.now() + 10000).toUTCString();
    jar.setCookieSync(`valid=new; Expires=${futureDate}; Path=/`, 'https://example.com/');

    const cookies = jar.getCookiesSync('https://example.com/');
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.key).toBe('valid');
  });

  test('clears all cookies', () => {
    const jar = createCookieJar();

    jar.setCookieSync('a=1; Path=/', 'https://a.com/');
    jar.setCookieSync('b=2; Path=/', 'https://b.com/');

    jar.removeAllCookiesSync();
    expect(jar.getCookiesSync('https://a.com/')).toHaveLength(0);
    expect(jar.getCookiesSync('https://b.com/')).toHaveLength(0);
  });

  test('serializes to JSON and back', () => {
    const jar = createCookieJar();

    jar.setCookieSync('session=abc123; Path=/', 'https://example.com/');

    const serialized = jar.serializeSync();
    const serializedCookies = serialized.cookies;
    if (!serializedCookies) {
      throw new Error('Expected serialized cookies to be present');
    }
    expect(serializedCookies).toHaveLength(1);

    const jar2 = createCookieJar();
    jar2.removeAllCookiesSync();

    // Restore cookies from serialized data
    for (const c of serializedCookies) {
      const cookie = Cookie.fromJSON(c);
      if (cookie) {
        jar2.setCookieSync(cookie, `https://${c.domain}${c.path}`);
      }
    }

    const cookies = jar2.getCookiesSync('https://example.com/');
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.value).toBe('abc123');
  });

  describe('cookie ordering (RFC 6265)', () => {
    test('orders cookies by path length (longest first)', () => {
      const jar = createCookieJar();

      jar.setCookieSync('short=1; Path=/', 'https://example.com/');
      jar.setCookieSync('medium=2; Path=/api', 'https://example.com/api');
      jar.setCookieSync('long=3; Path=/api/users', 'https://example.com/api/users');

      const cookies = jar.getCookiesSync('https://example.com/api/users/123');
      expect(cookies[0]?.key).toBe('long');
      expect(cookies[1]?.key).toBe('medium');
      expect(cookies[2]?.key).toBe('short');
    });

    test('orders cookies by creation time for same path length', async () => {
      const jar = createCookieJar();

      jar.setCookieSync('first=1; Path=/', 'https://example.com/');
      // Small delay to ensure different creation times
      await new Promise((resolve) => setTimeout(resolve, 10));
      jar.setCookieSync('second=2; Path=/', 'https://example.com/');

      const cookies = jar.getCookiesSync('https://example.com/');
      expect(cookies[0]?.key).toBe('first');
      expect(cookies[1]?.key).toBe('second');
    });
  });

  describe('secure cookie handling', () => {
    test('filters secure cookies for non-secure connections', () => {
      const jar = createCookieJar();

      jar.setCookieSync('secure=secret; Secure; Path=/', 'https://example.com/');
      jar.setCookieSync('insecure=public; Path=/', 'https://example.com/');

      // Secure connection - should get both
      const secureCookies = jar.getCookiesSync('https://example.com/');
      expect(secureCookies).toHaveLength(2);

      // Non-secure connection - should only get insecure cookie
      const insecureCookies = jar.getCookiesSync('http://example.com/');
      expect(insecureCookies).toHaveLength(1);
      expect(insecureCookies[0]?.key).toBe('insecure');
    });
  });

  describe('getCookieStringSync', () => {
    test('returns cookie string for URL', () => {
      const jar = createCookieJar();

      jar.setCookieSync('session=abc123; Path=/', 'https://example.com/');

      const cookieString = jar.getCookieStringSync('https://example.com/api');
      expect(cookieString).toBe('session=abc123');
    });

    test('returns multiple cookies joined', () => {
      const jar = createCookieJar();

      jar.setCookieSync('a=1; Path=/', 'https://example.com/');
      jar.setCookieSync('b=2; Path=/', 'https://example.com/');

      const cookieString = jar.getCookieStringSync('https://example.com/');
      expect(cookieString).toContain('a=1');
      expect(cookieString).toContain('b=2');
    });

    test('returns empty string when no cookies match', () => {
      const jar = createCookieJar();

      const cookieString = jar.getCookieStringSync('https://example.com/');
      expect(cookieString).toBe('');
    });
  });

  describe('setCookieSync with ignoreError', () => {
    test('sets cookie from header string', () => {
      const jar = createCookieJar();

      jar.setCookieSync('session=abc123; Path=/', 'https://example.com/');

      const cookies = jar.getCookiesSync('https://example.com/');
      expect(cookies).toHaveLength(1);
      expect(cookies[0]?.key).toBe('session');
      expect(cookies[0]?.value).toBe('abc123');
    });

    test('silently ignores invalid cookies with ignoreError', () => {
      const jar = createCookieJar();

      // This shouldn't throw
      jar.setCookieSync('', 'https://example.com/', { ignoreError: true });

      expect(jar.getCookiesSync('https://example.com/')).toHaveLength(0);
    });
  });

  describe('persistence', () => {
    test('saves and loads cookies', async () => {
      const jar = createCookieJar();
      const tempPath = `/private/tmp/claude/-Users-andrewmelchor-t-req-core/d7e0a253-bb18-42c4-a66a-031b7cc93571/scratchpad/cookies.json`;

      jar.setCookieSync('session=abc123; Path=/', 'https://example.com/');
      const serialized = jar.serializeSync();
      await Bun.write(tempPath, JSON.stringify(serialized, null, 2));

      // Load into new jar
      const file = Bun.file(tempPath);
      const loaded = JSON.parse(await file.text());
      const jar2 = createCookieJar();
      jar2.removeAllCookiesSync();
      for (const c of loaded.cookies || []) {
        const cookie = Cookie.fromJSON(c);
        if (cookie) {
          jar2.setCookieSync(cookie, `https://${c.domain}${c.path}`);
        }
      }

      const cookies = jar2.getCookiesSync('https://example.com/');
      expect(cookies).toHaveLength(1);
      expect(cookies[0]?.key).toBe('session');

      // Cleanup
      await Bun.file(tempPath).delete();
    });
  });

  describe('cookie edge cases', () => {
    test('handles cookie value with equals signs (JWT-like)', () => {
      const jar = createCookieJar();

      jar.setCookieSync('token=abc=def=ghi; Path=/', 'https://example.com/');

      const cookies = jar.getCookiesSync('https://example.com/');
      expect(cookies).toHaveLength(1);
      expect(cookies[0]?.key).toBe('token');
      expect(cookies[0]?.value).toBe('abc=def=ghi');
    });

    test('handles multiple Set-Cookie headers', () => {
      const jar = createCookieJar();

      jar.setCookieSync('session=abc123; Path=/', 'https://example.com/');
      jar.setCookieSync('token=xyz789; Path=/', 'https://example.com/');
      jar.setCookieSync('prefs=dark; Path=/', 'https://example.com/');

      const cookies = jar.getCookiesSync('https://example.com/');
      expect(cookies).toHaveLength(3);
      expect(cookies.map((c) => c.key).sort()).toEqual(['prefs', 'session', 'token']);
    });

    test('path /api does not match /apiv2', () => {
      const jar = createCookieJar();

      jar.setCookieSync('api-session=abc123; Path=/api', 'https://example.com/api');

      // /api/users should match
      expect(jar.getCookiesSync('https://example.com/api/users')).toHaveLength(1);
      // /apiv2 should NOT match (different path, not a subpath)
      expect(jar.getCookiesSync('https://example.com/apiv2')).toHaveLength(0);
      // /apiv2/endpoint should NOT match
      expect(jar.getCookiesSync('https://example.com/apiv2/endpoint')).toHaveLength(0);
    });
  });

  describe('domain security validation', () => {
    test('accepts valid subdomain cookie', () => {
      const jar = createCookieJar();

      jar.setCookieSync('session=abc123; Domain=example.com; Path=/', 'https://api.example.com/');

      const cookies = jar.getCookiesSync('https://example.com/');
      expect(cookies).toHaveLength(1);
      expect(cookies[0]?.domain).toBe('example.com');
    });

    test('rejects cross-domain cookie', () => {
      const jar = createCookieJar();

      // Cross-domain cookie should be rejected
      jar.setCookieSync('session=abc123; Domain=evil.com; Path=/', 'https://example.com/', {
        ignoreError: true
      });

      expect(jar.getCookiesSync('https://evil.com/')).toHaveLength(0);
    });

    test('rejects public suffix cookies by default', () => {
      const jar = createCookieJar();

      jar.setCookieSync('session=abc123; Domain=.com; Path=/', 'https://example.com/', {
        ignoreError: true
      });

      // If public suffix rejection is enabled, the cookie should not be stored.
      expect(jar.getCookiesSync('https://example.com/')).toHaveLength(0);
    });

    test('can allow public suffix cookies when configured (not recommended)', () => {
      const jar = createCookieJar({ rejectPublicSuffixes: false });

      jar.setCookieSync('session=abc123; Domain=.com; Path=/', 'https://example.com/', {
        ignoreError: true
      });

      // With public suffix rejection disabled, the cookie can be stored.
      // Note: it will not necessarily match any real host (e.g. example.com) since tough-cookie
      // only searches within the request's registrable domain permutations.
      const snapshot = jar.serializeSync();
      expect(snapshot.cookies).toHaveLength(1);
      expect(snapshot.cookies?.[0]?.domain).toBe('com');
    });
  });
});

describe('Cookie class', () => {
  test('can create cookie with key property', () => {
    const cookie = new Cookie({
      key: 'session',
      value: 'abc123',
      domain: 'example.com',
      path: '/'
    });

    expect(cookie.key).toBe('session');
    expect(cookie.value).toBe('abc123');
  });

  test('can serialize and deserialize', () => {
    const cookie = new Cookie({
      key: 'session',
      value: 'abc123',
      domain: 'example.com',
      path: '/'
    });

    const json = cookie.toJSON();
    const restored = Cookie.fromJSON(json);

    expect(restored).not.toBeNull();
    expect(restored?.key).toBe('session');
    expect(restored?.value).toBe('abc123');
  });
});
