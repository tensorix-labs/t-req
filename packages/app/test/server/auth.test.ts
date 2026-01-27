import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  clearAllScriptTokens,
  generateScriptToken,
  getScriptTokenCount,
  revokeScriptToken,
  startScriptTokenCleanup,
  stopScriptTokenCleanup,
  validateScriptToken
} from '../../src/server/auth';

describe('Script Token Functions', () => {
  const serverToken = 'test-server-token-12345';

  beforeEach(() => {
    clearAllScriptTokens();
  });

  afterEach(() => {
    clearAllScriptTokens();
    stopScriptTokenCleanup();
  });

  describe('generateScriptToken', () => {
    test('generates token with correct script.<payload>.<signature> format', () => {
      const result = generateScriptToken(serverToken, 'flow-1', 'session-1');

      expect(result.token).toMatch(/^script\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

      const parts = result.token.split('.');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('script');
    });

    test('payload contains all required fields', () => {
      const result = generateScriptToken(serverToken, 'flow-123', 'session-456');

      expect(result.payload.jti).toBeDefined();
      expect(result.payload.flowId).toBe('flow-123');
      expect(result.payload.sessionId).toBe('session-456');
      expect(result.payload.createdAt).toBeDefined();
      expect(result.payload.expiresAt).toBeDefined();
      expect(typeof result.payload.createdAt).toBe('number');
      expect(typeof result.payload.expiresAt).toBe('number');
    });

    test('different server tokens produce different signatures', () => {
      const result1 = generateScriptToken('server-token-A', 'flow-1', 'session-1');
      const result2 = generateScriptToken('server-token-B', 'flow-1', 'session-1');

      const signature1 = result1.token.split('.')[2];
      const signature2 = result2.token.split('.')[2];

      expect(signature1).not.toBe(signature2);
    });

    test('custom TTL is respected in expiresAt', () => {
      const customTtlMs = 5 * 60 * 1000; // 5 minutes
      const before = Date.now();
      const result = generateScriptToken(serverToken, 'flow-1', 'session-1', customTtlMs);
      const after = Date.now();

      expect(result.payload.expiresAt).toBeGreaterThanOrEqual(before + customTtlMs);
      expect(result.payload.expiresAt).toBeLessThanOrEqual(after + customTtlMs);
    });

    test('multiple tokens have unique jti values', () => {
      const result1 = generateScriptToken(serverToken, 'flow-1', 'session-1');
      const result2 = generateScriptToken(serverToken, 'flow-1', 'session-1');
      const result3 = generateScriptToken(serverToken, 'flow-2', 'session-2');

      const jtis = new Set([result1.jti, result2.jti, result3.jti]);
      expect(jtis.size).toBe(3);
    });

    test('token is registered in activeScriptTokens immediately', () => {
      expect(getScriptTokenCount()).toBe(0);

      const result = generateScriptToken(serverToken, 'flow-1', 'session-1');

      expect(getScriptTokenCount()).toBe(1);
      // Token should be valid right after generation
      const validated = validateScriptToken(serverToken, result.token);
      expect(validated).not.toBeNull();
      expect(validated?.jti).toBe(result.jti);
    });
  });

  describe('validateScriptToken', () => {
    test('valid token returns payload', () => {
      const generated = generateScriptToken(serverToken, 'flow-1', 'session-1');
      const payload = validateScriptToken(serverToken, generated.token);

      expect(payload).not.toBeNull();
      expect(payload?.jti).toBe(generated.jti);
      expect(payload?.flowId).toBe('flow-1');
      expect(payload?.sessionId).toBe('session-1');
    });

    test('missing script. prefix returns null', () => {
      const generated = generateScriptToken(serverToken, 'flow-1', 'session-1');
      const tokenWithoutPrefix = generated.token.replace('script.', '');

      const payload = validateScriptToken(serverToken, tokenWithoutPrefix);
      expect(payload).toBeNull();
    });

    test('invalid format (wrong part count) returns null', () => {
      expect(validateScriptToken(serverToken, 'script.onlyonepart')).toBeNull();
      expect(validateScriptToken(serverToken, 'script.one.two.three')).toBeNull();
      expect(validateScriptToken(serverToken, 'script.')).toBeNull();
    });

    test('empty payload/signature returns null', () => {
      expect(validateScriptToken(serverToken, 'script..signature')).toBeNull();
      expect(validateScriptToken(serverToken, 'script.payload.')).toBeNull();
      expect(validateScriptToken(serverToken, 'script..')).toBeNull();
    });

    test('invalid base64url encoding returns null', () => {
      // Create a token with invalid base64url characters
      const invalidPayload = 'not!valid@base64#url';
      const invalidToken = `script.${invalidPayload}.fakesignature`;

      const payload = validateScriptToken(serverToken, invalidToken);
      expect(payload).toBeNull();
    });

    test('invalid JSON in payload returns null', () => {
      // Create valid base64url but invalid JSON
      const invalidJson = Buffer.from('not valid json').toString('base64url');
      const invalidToken = `script.${invalidJson}.fakesignature`;

      const payload = validateScriptToken(serverToken, invalidToken);
      expect(payload).toBeNull();
    });

    test('expired token returns null', () => {
      // Generate a token with very short TTL
      const generated = generateScriptToken(serverToken, 'flow-1', 'session-1', 1); // 1ms TTL

      // Wait for it to expire
      const start = Date.now();
      while (Date.now() - start < 10) {
        // Busy wait for expiration
      }

      const payload = validateScriptToken(serverToken, generated.token);
      expect(payload).toBeNull();
    });

    test('wrong server token returns null (signature mismatch)', () => {
      const generated = generateScriptToken(serverToken, 'flow-1', 'session-1');

      // Try to validate with different server token
      const payload = validateScriptToken('wrong-server-token', generated.token);
      expect(payload).toBeNull();
    });

    test('revoked token (jti removed) returns null', () => {
      const generated = generateScriptToken(serverToken, 'flow-1', 'session-1');

      // Token should be valid initially
      expect(validateScriptToken(serverToken, generated.token)).not.toBeNull();

      // Revoke the token
      revokeScriptToken(generated.jti);

      // Token should now be invalid
      expect(validateScriptToken(serverToken, generated.token)).toBeNull();
    });
  });

  describe('revokeScriptToken', () => {
    test('removes token from activeScriptTokens', () => {
      const generated = generateScriptToken(serverToken, 'flow-1', 'session-1');
      expect(getScriptTokenCount()).toBe(1);

      revokeScriptToken(generated.jti);

      expect(getScriptTokenCount()).toBe(0);
    });

    test('revoked token fails validation', () => {
      const generated = generateScriptToken(serverToken, 'flow-1', 'session-1');

      // Valid before revocation
      expect(validateScriptToken(serverToken, generated.token)).not.toBeNull();

      revokeScriptToken(generated.jti);

      // Invalid after revocation
      expect(validateScriptToken(serverToken, generated.token)).toBeNull();
    });

    test('revoking non-existent jti does not throw', () => {
      expect(() => revokeScriptToken('non-existent-jti')).not.toThrow();
      expect(() => revokeScriptToken('')).not.toThrow();
    });
  });

  describe('cleanup functions', () => {
    test('clearAllScriptTokens removes all tokens', () => {
      // Generate multiple tokens
      generateScriptToken(serverToken, 'flow-1', 'session-1');
      generateScriptToken(serverToken, 'flow-2', 'session-2');
      generateScriptToken(serverToken, 'flow-3', 'session-3');

      expect(getScriptTokenCount()).toBe(3);

      clearAllScriptTokens();

      expect(getScriptTokenCount()).toBe(0);
    });

    test('startScriptTokenCleanup is idempotent', () => {
      // Calling multiple times should not throw
      expect(() => {
        startScriptTokenCleanup();
        startScriptTokenCleanup();
        startScriptTokenCleanup();
      }).not.toThrow();
    });

    test('stopScriptTokenCleanup is idempotent', () => {
      startScriptTokenCleanup();

      // Calling multiple times should not throw
      expect(() => {
        stopScriptTokenCleanup();
        stopScriptTokenCleanup();
        stopScriptTokenCleanup();
      }).not.toThrow();
    });

    test('can start/stop cleanup multiple times', () => {
      expect(() => {
        startScriptTokenCleanup();
        stopScriptTokenCleanup();
        startScriptTokenCleanup();
        stopScriptTokenCleanup();
      }).not.toThrow();
    });
  });
});
