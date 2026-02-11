import { describe, expect, test } from 'bun:test';
import { WORKSPACE_STATE_KEYS } from '../../src/constants';
import {
  clearScopedProfile,
  getScopedProfile,
  makeProfileScopeKey,
  migrateLegacyProfileState,
  setScopedProfile
} from '../../src/state/profile-state';

type UriLike = { toString(): string };

function uri(value: string): UriLike {
  return {
    toString() {
      return value;
    }
  };
}

class MockWorkspaceState {
  private readonly data = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.data.delete(key);
      return;
    }
    this.data.set(key, value);
  }
}

describe('profile state', () => {
  test('scopes profile selection by folder and execution mode', async () => {
    const workspaceState = new MockWorkspaceState();
    const folderA = uri('file:///workspace/a');
    const folderB = uri('file:///workspace/b');

    await setScopedProfile(workspaceState, folderA, 'local', 'dev-local');
    await setScopedProfile(workspaceState, folderA, 'server', 'dev-server');
    await setScopedProfile(workspaceState, folderB, 'local', 'prod-local');

    expect(getScopedProfile(workspaceState, folderA, 'local')).toBe('dev-local');
    expect(getScopedProfile(workspaceState, folderA, 'server')).toBe('dev-server');
    expect(getScopedProfile(workspaceState, folderB, 'local')).toBe('prod-local');
    expect(getScopedProfile(workspaceState, folderB, 'server', 'fallback')).toBe('fallback');
  });

  test('clears one scoped profile without affecting others', async () => {
    const workspaceState = new MockWorkspaceState();
    const folderA = uri('file:///workspace/a');
    const folderB = uri('file:///workspace/b');

    await setScopedProfile(workspaceState, folderA, 'local', 'dev-local');
    await setScopedProfile(workspaceState, folderB, 'local', 'prod-local');
    await clearScopedProfile(workspaceState, folderA, 'local');

    expect(getScopedProfile(workspaceState, folderA, 'local')).toBeUndefined();
    expect(getScopedProfile(workspaceState, folderB, 'local')).toBe('prod-local');
  });

  test('migrates legacy profile into scoped keys and clears legacy key', async () => {
    const workspaceState = new MockWorkspaceState();
    const folderA = uri('file:///workspace/a');
    const folderB = uri('file:///workspace/b');

    await workspaceState.update(WORKSPACE_STATE_KEYS.ACTIVE_PROFILE, 'legacy-profile');
    await setScopedProfile(workspaceState, folderA, 'local', 'existing-local');

    const migrated = await migrateLegacyProfileState(workspaceState, [folderA, folderB]);
    expect(migrated).toBe(true);

    expect(getScopedProfile(workspaceState, folderA, 'local')).toBe('existing-local');
    expect(getScopedProfile(workspaceState, folderA, 'server')).toBe('legacy-profile');
    expect(getScopedProfile(workspaceState, folderB, 'local')).toBe('legacy-profile');
    expect(getScopedProfile(workspaceState, folderB, 'server')).toBe('legacy-profile');
    expect(workspaceState.get(WORKSPACE_STATE_KEYS.ACTIVE_PROFILE)).toBeUndefined();
  });

  test('profile scope key includes mode boundary', () => {
    const folder = uri('file:///workspace/a');
    expect(makeProfileScopeKey(folder, 'local')).toBe('file:///workspace/a|local');
    expect(makeProfileScopeKey(folder, 'server')).toBe('file:///workspace/a|server');
  });
});
