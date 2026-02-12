import * as crypto from 'node:crypto';
import type * as vscode from 'vscode';

type SecretStorageLike = {
  get(key: string): Promise<string | undefined> | PromiseLike<string | undefined>;
  store(key: string, value: string): Promise<void> | PromiseLike<void>;
  delete(key: string): Promise<void> | PromiseLike<void>;
};

type LegacyTokenAccessor = {
  read(scope?: vscode.ConfigurationScope): string | undefined;
  clear(scope?: vscode.ConfigurationScope): Promise<void>;
};

export type TokenScope = {
  folderUri: vscode.Uri;
  serverUrl: string;
  configurationScope?: vscode.ConfigurationScope;
};

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function normalizeServerUrl(serverUrl: string): string {
  const url = new URL(serverUrl.trim());
  url.search = '';
  url.hash = '';
  if (url.pathname !== '/') {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  return `${url.origin}${url.pathname === '/' ? '' : url.pathname}`;
}

export function makeTokenScopeKey(folderUri: vscode.Uri, serverUrl: string): string {
  const folderHash = sha256(folderUri.toString());
  const serverHash = sha256(normalizeServerUrl(serverUrl));
  return `t-req.serverToken.v1:${folderHash}:${serverHash}`;
}

export class ServerTokenStore {
  constructor(
    private readonly secrets: SecretStorageLike,
    private readonly legacyAccessor: LegacyTokenAccessor
  ) {}

  async getToken(scope: TokenScope): Promise<string | undefined> {
    const secretKey = makeTokenScopeKey(scope.folderUri, scope.serverUrl);
    const existing = (await this.secrets.get(secretKey))?.trim();
    if (existing) {
      return existing;
    }

    return await this.migrateLegacyTokenIfNeeded(scope, secretKey);
  }

  async migrateLegacyTokenIfNeeded(
    scope: TokenScope,
    secretKey?: string
  ): Promise<string | undefined> {
    const key = secretKey ?? makeTokenScopeKey(scope.folderUri, scope.serverUrl);
    const legacyToken = this.legacyAccessor.read(scope.configurationScope)?.trim();
    if (!legacyToken) {
      return undefined;
    }

    await this.secrets.store(key, legacyToken);
    await this.legacyAccessor.clear(scope.configurationScope);
    return legacyToken;
  }

  async setToken(scope: TokenScope, token: string): Promise<void> {
    const key = makeTokenScopeKey(scope.folderUri, scope.serverUrl);
    const trimmed = token.trim();
    if (!trimmed) {
      await this.secrets.delete(key);
      return;
    }
    await this.secrets.store(key, trimmed);
  }

  async clearToken(scope: TokenScope): Promise<void> {
    const key = makeTokenScopeKey(scope.folderUri, scope.serverUrl);
    await this.secrets.delete(key);
  }
}
