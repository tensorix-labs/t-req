import { describe, expect, test } from 'bun:test';
import { createClient } from '@t-req/core';
import { resolveProjectConfig } from '@t-req/core/config';
import { LoginResponse, RefreshResponse } from '../schemas';

// Auth tests use a separate client pointing to dummyjson.com
const { config } = await resolveProjectConfig({ startDir: process.cwd() });
const authClient = createClient({
  variables: {
    ...config.variables,
    authBaseUrl: 'https://dummyjson.com'
  }
});

describe('Auth API', () => {
  describe('POST /auth/login', () => {
    test('returns tokens matching schema', async () => {
      const response = await authClient.run('./collection/auth/login.http', {
        variables: {
          username: 'emilys',
          password: 'emilyspass'
        }
      });

      expect(response.ok).toBe(true);

      const loginResult = LoginResponse.parse(await response.json());

      expect(loginResult.accessToken).toBeDefined();
      expect(loginResult.refreshToken).toBeDefined();
      expect(loginResult.username).toBe('emilys');
      expect(loginResult.email).toContain('@');
    });

    test('returns 401 for invalid credentials', async () => {
      const response = await authClient.run('./collection/auth/login.http', {
        variables: {
          username: 'invalid',
          password: 'wrong'
        }
      });

      expect(response.status).toBe(400); // dummyjson returns 400 for invalid creds
    });
  });

  describe('POST /auth/refresh', () => {
    test('refreshes token matching schema', async () => {
      // First login to get a refresh token
      const loginResponse = await authClient.run('./collection/auth/login.http', {
        variables: {
          username: 'emilys',
          password: 'emilyspass'
        }
      });
      const { refreshToken } = LoginResponse.parse(await loginResponse.json());

      // Now refresh
      const response = await authClient.run('./collection/auth/refresh.http', {
        variables: { refreshToken }
      });

      expect(response.ok).toBe(true);

      const refreshResult = RefreshResponse.parse(await response.json());

      expect(refreshResult.accessToken).toBeDefined();
      expect(refreshResult.refreshToken).toBeDefined();
    });
  });
});
