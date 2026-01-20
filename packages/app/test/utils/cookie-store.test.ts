import { describe, expect, test } from 'bun:test';
import { createCookieJar } from '@t-req/core/cookies';
import { createCookieStoreFromJar } from '../../src/utils/cookie-store';

describe('createCookieStoreFromJar', () => {
  describe('getCookieHeader', () => {
    test('should return undefined when no cookies set', () => {
      const jar = createCookieJar();
      const store = createCookieStoreFromJar(jar);

      const header = store.getCookieHeader('https://example.com');

      expect(header).toBeUndefined();
    });

    test('should return cookie string when cookies are set', () => {
      const jar = createCookieJar();
      jar.setCookieSync('session=abc123', 'https://example.com');

      const store = createCookieStoreFromJar(jar);
      const header = store.getCookieHeader('https://example.com');

      expect(header).toBe('session=abc123');
    });

    test('should return multiple cookies as semicolon-separated string', () => {
      const jar = createCookieJar();
      jar.setCookieSync('session=abc', 'https://example.com');
      jar.setCookieSync('token=xyz', 'https://example.com');

      const store = createCookieStoreFromJar(jar);
      const header = store.getCookieHeader('https://example.com');

      // Cookies are returned in the format "name=value; name=value"
      expect(header).toContain('session=abc');
      expect(header).toContain('token=xyz');
    });

    test('should respect cookie domain', () => {
      const jar = createCookieJar();
      jar.setCookieSync('session=abc; Domain=example.com', 'https://example.com');

      const store = createCookieStoreFromJar(jar);

      // Should work for the domain
      expect(store.getCookieHeader('https://example.com')).toBe('session=abc');

      // Should work for subdomains
      expect(store.getCookieHeader('https://api.example.com')).toBe('session=abc');

      // Should not work for different domains
      expect(store.getCookieHeader('https://other.com')).toBeUndefined();
    });

    test('should respect cookie path', () => {
      const jar = createCookieJar();
      jar.setCookieSync('session=abc; Path=/api', 'https://example.com/api');

      const store = createCookieStoreFromJar(jar);

      expect(store.getCookieHeader('https://example.com/api/users')).toBe('session=abc');
      expect(store.getCookieHeader('https://example.com/other')).toBeUndefined();
    });

    test('should respect secure flag', () => {
      const jar = createCookieJar();
      jar.setCookieSync('secure=value; Secure', 'https://example.com');

      const store = createCookieStoreFromJar(jar);

      // Should work with HTTPS
      expect(store.getCookieHeader('https://example.com')).toBe('secure=value');

      // Note: tough-cookie may or may not enforce this based on configuration
      // The behavior depends on the jar's allowSpecialUseDomain setting
    });
  });

  describe('setFromResponse', () => {
    test('should extract cookies from response Set-Cookie headers', () => {
      const jar = createCookieJar();
      const store = createCookieStoreFromJar(jar);

      // Create a mock response with getSetCookie method
      const mockResponse = {
        headers: {
          getSetCookie: () => ['session=newvalue; Path=/; HttpOnly']
        }
      } as unknown as Response;

      store.setFromResponse('https://example.com', mockResponse);

      // Verify the cookie was stored
      const header = store.getCookieHeader('https://example.com');
      expect(header).toBe('session=newvalue');
    });

    test('should handle multiple Set-Cookie headers', () => {
      const jar = createCookieJar();
      const store = createCookieStoreFromJar(jar);

      const mockResponse = {
        headers: {
          getSetCookie: () => ['session=abc; Path=/', 'token=xyz; Path=/', 'refresh=123; Path=/']
        }
      } as unknown as Response;

      store.setFromResponse('https://example.com', mockResponse);

      const header = store.getCookieHeader('https://example.com');
      expect(header).toContain('session=abc');
      expect(header).toContain('token=xyz');
      expect(header).toContain('refresh=123');
    });

    test('should handle response without getSetCookie method', () => {
      const jar = createCookieJar();
      const store = createCookieStoreFromJar(jar);

      // Response without getSetCookie
      const mockResponse = {
        headers: {}
      } as unknown as Response;

      // Should not throw
      expect(() => {
        store.setFromResponse('https://example.com', mockResponse);
      }).not.toThrow();

      // Should have no cookies
      expect(store.getCookieHeader('https://example.com')).toBeUndefined();
    });

    test('should handle empty Set-Cookie array', () => {
      const jar = createCookieJar();
      const store = createCookieStoreFromJar(jar);

      const mockResponse = {
        headers: {
          getSetCookie: () => []
        }
      } as unknown as Response;

      store.setFromResponse('https://example.com', mockResponse);

      expect(store.getCookieHeader('https://example.com')).toBeUndefined();
    });

    test('should update existing cookies', () => {
      const jar = createCookieJar();
      jar.setCookieSync('session=old', 'https://example.com');

      const store = createCookieStoreFromJar(jar);

      const mockResponse = {
        headers: {
          getSetCookie: () => ['session=new']
        }
      } as unknown as Response;

      store.setFromResponse('https://example.com', mockResponse);

      const header = store.getCookieHeader('https://example.com');
      expect(header).toBe('session=new');
    });

    test('should handle cookie with attributes', () => {
      const jar = createCookieJar();
      const store = createCookieStoreFromJar(jar);

      const mockResponse = {
        headers: {
          getSetCookie: () => ['session=value; Max-Age=3600; Path=/; HttpOnly; SameSite=Strict']
        }
      } as unknown as Response;

      store.setFromResponse('https://example.com', mockResponse);

      // Should store the cookie (attributes are parsed but value is returned)
      const header = store.getCookieHeader('https://example.com');
      expect(header).toBe('session=value');
    });
  });

  describe('cookie isolation', () => {
    test('should maintain separate cookie stores for different jars', () => {
      const jar1 = createCookieJar();
      const jar2 = createCookieJar();

      const store1 = createCookieStoreFromJar(jar1);
      const store2 = createCookieStoreFromJar(jar2);

      jar1.setCookieSync('user=alice', 'https://example.com');
      jar2.setCookieSync('user=bob', 'https://example.com');

      expect(store1.getCookieHeader('https://example.com')).toBe('user=alice');
      expect(store2.getCookieHeader('https://example.com')).toBe('user=bob');
    });
  });

  describe('cookie serialization', () => {
    test('should work with jar.toJSON for persistence', () => {
      const jar = createCookieJar();
      jar.setCookieSync('session=test123', 'https://example.com');
      jar.setCookieSync('token=abc', 'https://example.com');

      const serialized = jar.toJSON();

      expect(serialized).toBeDefined();
      expect(serialized?.cookies).toBeDefined();
      expect(serialized?.cookies?.length).toBe(2);
    });
  });
});
