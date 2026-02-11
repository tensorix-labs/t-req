import { describe, expect, test } from 'bun:test';
import type * as vscode from 'vscode';
import {
  makeTokenScopeKey,
  normalizeServerUrl,
  ServerTokenStore
} from '../../src/auth/server-token-store';

type UriLike = {
  toString(): string;
};

function uri(value: string): UriLike {
  return {
    toString() {
      return value;
    }
  };
}

function asUri(value: string): vscode.Uri {
  return uri(value) as unknown as vscode.Uri;
}

class MockSecrets {
  readonly data = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.data.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

describe('server token store', () => {
  test('normalizes server urls for stable keying', () => {
    expect(normalizeServerUrl('https://api.example.com/')).toBe('https://api.example.com');
    expect(normalizeServerUrl('https://api.example.com/v1///?q=1#hash')).toBe(
      'https://api.example.com/v1'
    );
  });

  test('keys are isolated by folder and server', () => {
    const folderA = asUri('file:///workspace/a');
    const folderB = asUri('file:///workspace/b');
    const keyA = makeTokenScopeKey(folderA, 'https://api.example.com');
    const keyB = makeTokenScopeKey(folderB, 'https://api.example.com');
    const keyC = makeTokenScopeKey(folderA, 'https://other.example.com');

    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(keyC);
  });

  test('migrates legacy settings token once then reads from secret storage', async () => {
    const secrets = new MockSecrets();
    let legacyToken = 'legacy-token';
    let clearCount = 0;

    const store = new ServerTokenStore(secrets, {
      read: () => legacyToken,
      clear: async () => {
        clearCount += 1;
        legacyToken = undefined as unknown as string;
      }
    });

    const scope = {
      folderUri: asUri('file:///workspace/a'),
      serverUrl: 'https://api.example.com'
    };

    const first = await store.getToken(scope);
    const second = await store.getToken(scope);

    expect(first).toBe('legacy-token');
    expect(second).toBe('legacy-token');
    expect(clearCount).toBe(1);
  });

  test('set and clear token operate on scoped key', async () => {
    const secrets = new MockSecrets();
    const store = new ServerTokenStore(secrets, {
      read: () => undefined,
      clear: async () => undefined
    });

    const scope = {
      folderUri: asUri('file:///workspace/a'),
      serverUrl: 'https://api.example.com'
    };
    const key = makeTokenScopeKey(scope.folderUri, scope.serverUrl);

    await store.setToken(scope, '  abc123  ');
    expect(await secrets.get(key)).toBe('abc123');

    await store.clearToken(scope);
    expect(await secrets.get(key)).toBeUndefined();
  });
});
