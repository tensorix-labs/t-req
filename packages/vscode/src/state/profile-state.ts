import type { ExtensionExecutionMode } from '../config/loader';
import { WORKSPACE_STATE_KEYS } from '../constants';

type UriLike = {
  toString(): string;
};

type WorkspaceStateLike = {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Promise<void> | PromiseLike<void>;
};

type ScopedProfiles = Record<string, string>;

export function makeProfileScopeKey(
  folderUri: UriLike,
  executionMode: ExtensionExecutionMode
): string {
  return `${folderUri.toString()}|${executionMode}`;
}

function readProfiles(workspaceState: WorkspaceStateLike): ScopedProfiles {
  const raw = workspaceState.get<unknown>(WORKSPACE_STATE_KEYS.ACTIVE_PROFILES_BY_SCOPE);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const map = raw as Record<string, unknown>;
  const out: ScopedProfiles = {};
  for (const [key, value] of Object.entries(map)) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    out[key] = trimmed;
  }
  return out;
}

export function getScopedProfile(
  workspaceState: WorkspaceStateLike,
  folderUri: UriLike,
  executionMode: ExtensionExecutionMode,
  defaultProfile?: string
): string | undefined {
  const key = makeProfileScopeKey(folderUri, executionMode);
  const profiles = readProfiles(workspaceState);
  const stored = profiles[key]?.trim();
  if (stored) {
    return stored;
  }

  const fallback = defaultProfile?.trim();
  return fallback || undefined;
}

export async function setScopedProfile(
  workspaceState: WorkspaceStateLike,
  folderUri: UriLike,
  executionMode: ExtensionExecutionMode,
  profile: string
): Promise<void> {
  const trimmed = profile.trim();
  if (!trimmed) {
    await clearScopedProfile(workspaceState, folderUri, executionMode);
    return;
  }

  const key = makeProfileScopeKey(folderUri, executionMode);
  const profiles = readProfiles(workspaceState);
  profiles[key] = trimmed;
  await workspaceState.update(WORKSPACE_STATE_KEYS.ACTIVE_PROFILES_BY_SCOPE, profiles);
}

export async function clearScopedProfile(
  workspaceState: WorkspaceStateLike,
  folderUri: UriLike,
  executionMode: ExtensionExecutionMode
): Promise<void> {
  const key = makeProfileScopeKey(folderUri, executionMode);
  const profiles = readProfiles(workspaceState);
  delete profiles[key];
  if (Object.keys(profiles).length === 0) {
    await workspaceState.update(WORKSPACE_STATE_KEYS.ACTIVE_PROFILES_BY_SCOPE, undefined);
    return;
  }
  await workspaceState.update(WORKSPACE_STATE_KEYS.ACTIVE_PROFILES_BY_SCOPE, profiles);
}

export async function migrateLegacyProfileState(
  workspaceState: WorkspaceStateLike,
  folderUris: readonly UriLike[]
): Promise<boolean> {
  const legacyProfile = workspaceState.get<string>(WORKSPACE_STATE_KEYS.ACTIVE_PROFILE)?.trim();
  if (!legacyProfile) {
    return false;
  }
  if (folderUris.length === 0) {
    return false;
  }

  const profiles = readProfiles(workspaceState);
  const uniqueFolderUris = new Map<string, UriLike>();
  for (const uri of folderUris) {
    uniqueFolderUris.set(uri.toString(), uri);
  }

  let changed = false;
  for (const folderUri of uniqueFolderUris.values()) {
    for (const mode of ['local', 'server'] as const) {
      const key = makeProfileScopeKey(folderUri, mode);
      if (profiles[key]) {
        continue;
      }
      profiles[key] = legacyProfile;
      changed = true;
    }
  }

  if (changed) {
    await workspaceState.update(WORKSPACE_STATE_KEYS.ACTIVE_PROFILES_BY_SCOPE, profiles);
  }
  await workspaceState.update(WORKSPACE_STATE_KEYS.ACTIVE_PROFILE, undefined);
  return changed;
}
