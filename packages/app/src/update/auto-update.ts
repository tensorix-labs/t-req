import { Installation } from '../installation';
import {
  AUTO_UPDATE_CHECK_TTL_MS,
  AUTO_UPDATE_RETRY_BACKOFF_MS,
  createAutoUpdateStateStore
} from './state';
import type {
  AutoUpdateOptions,
  AutoUpdateOutcome,
  AutoUpdateStateStore,
  InstallationLike,
  UpdateInfo
} from './types';

interface AutoUpdateDependencies {
  installation?: InstallationLike;
  stateStore?: AutoUpdateStateStore;
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  pre?: string[];
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on')
    return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off')
    return false;
  return undefined;
}

export function resolveAutoUpdateEnabled(
  optionValue: boolean | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const envValue = parseBooleanEnv(env.TREQ_AUTO_UPDATE);
  if (envValue !== undefined) return envValue;
  return optionValue ?? true;
}

function parseVersion(version: string): ParsedVersion | undefined {
  const normalized = version.trim().replace(/^v/, '');
  const match = normalized.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-.]+)?$/
  );
  if (!match) return undefined;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return undefined;
  }

  const pre = match[4]?.split('.');
  return { major, minor, patch, pre };
}

function comparePrerelease(a: string[] | undefined, b: string[] | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left === right) continue;

    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) {
      const leftNumber = Number(left);
      const rightNumber = Number(right);
      if (leftNumber > rightNumber) return 1;
      if (leftNumber < rightNumber) return -1;
      continue;
    }
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return left > right ? 1 : -1;
  }

  return 0;
}

function compareVersions(a: string, b: string): number | undefined {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return undefined;

  if (left.major !== right.major) return left.major > right.major ? 1 : -1;
  if (left.minor !== right.minor) return left.minor > right.minor ? 1 : -1;
  if (left.patch !== right.patch) return left.patch > right.patch ? 1 : -1;
  return comparePrerelease(left.pre, right.pre);
}

function isStrictlyNewer(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) === 1;
}

export async function checkForAvailableUpdate(
  installation: InstallationLike = Installation
): Promise<UpdateInfo | undefined> {
  const method = await installation.method();
  const latest = await installation.latest(method).catch(() => undefined);
  if (!latest) return undefined;
  if (!isStrictlyNewer(latest, installation.VERSION)) return undefined;

  return {
    version: latest,
    method,
    command: installation.updateCommand(method, latest)
  };
}

export async function runAutoUpdate(
  options: AutoUpdateOptions,
  deps: AutoUpdateDependencies = {}
): Promise<AutoUpdateOutcome> {
  if (!options.enabled) {
    return {
      status: 'disabled',
      reason: 'disabled'
    };
  }

  if (!options.interactive) {
    return {
      status: 'disabled',
      reason: 'non_interactive'
    };
  }

  const now = options.now?.() ?? Date.now();
  const installation = deps.installation ?? Installation;
  const stateStore = deps.stateStore ?? createAutoUpdateStateStore();

  const methodResult = await installation
    .method()
    .then((method) => ({ ok: true as const, method }))
    .catch((error) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : String(error)
    }));
  if (!methodResult.ok) {
    return {
      status: 'failed',
      currentVersion: installation.VERSION,
      phase: 'check',
      error: methodResult.error
    };
  }
  const method = methodResult.method;

  const state = await stateStore.read();
  const checkExpiresAt = (state.lastCheckedAt ?? 0) + AUTO_UPDATE_CHECK_TTL_MS;
  const shouldUseCache =
    typeof state.cachedLatestVersion === 'string' &&
    state.cachedLatestVersion.length > 0 &&
    now < checkExpiresAt;

  let latestVersion: string | undefined;
  let checkedAt = now;

  if (shouldUseCache) {
    latestVersion = state.cachedLatestVersion;
    checkedAt = state.lastCheckedAt ?? now;
  } else {
    const latestResult = await installation
      .latest(method)
      .then((latest) => ({ ok: true as const, latest }))
      .catch((error) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : String(error)
      }));

    if (!latestResult.ok) {
      return {
        status: 'failed',
        currentVersion: installation.VERSION,
        method,
        phase: 'check',
        error: latestResult.error
      };
    }

    latestVersion = latestResult.latest;
    checkedAt = now;
    await stateStore.write({
      ...state,
      lastCheckedAt: checkedAt,
      cachedLatestVersion: latestVersion
    });
  }

  if (latestVersion === installation.VERSION) {
    return {
      status: 'up_to_date',
      currentVersion: installation.VERSION,
      method,
      checkedAt
    };
  }
  if (!latestVersion) {
    return {
      status: 'failed',
      currentVersion: installation.VERSION,
      method,
      phase: 'check',
      error: 'Missing latest version'
    };
  }

  if (!isStrictlyNewer(latestVersion, installation.VERSION)) {
    return {
      status: 'up_to_date',
      currentVersion: installation.VERSION,
      method,
      checkedAt
    };
  }

  const command = installation.updateCommand(method, latestVersion);

  if (method === 'unknown') {
    return {
      status: 'available_manual',
      currentVersion: installation.VERSION,
      latestVersion,
      method,
      command,
      checkedAt
    };
  }

  if (
    state.lastAttemptStatus === 'failed' &&
    state.lastAttemptedVersion === latestVersion &&
    typeof state.lastAttemptedAt === 'number'
  ) {
    const retryAfter = state.lastAttemptedAt + AUTO_UPDATE_RETRY_BACKOFF_MS;
    if (now < retryAfter) {
      return {
        status: 'backoff_skipped',
        currentVersion: installation.VERSION,
        latestVersion,
        method,
        command,
        checkedAt,
        retryAfter
      };
    }
  }

  const upgradeError = await installation.upgrade(method, latestVersion).catch((error) => {
    return error instanceof Error ? error.message : String(error);
  });

  if (typeof upgradeError === 'string') {
    await stateStore.write({
      ...state,
      lastCheckedAt: checkedAt,
      cachedLatestVersion: latestVersion,
      lastAttemptedVersion: latestVersion,
      lastAttemptedAt: now,
      lastAttemptStatus: 'failed'
    });

    return {
      status: 'failed',
      currentVersion: installation.VERSION,
      latestVersion,
      method,
      command,
      checkedAt,
      phase: 'upgrade',
      error: upgradeError
    };
  }

  await stateStore.write({
    ...state,
    lastCheckedAt: checkedAt,
    cachedLatestVersion: latestVersion,
    lastAttemptedVersion: latestVersion,
    lastAttemptedAt: now,
    lastAttemptStatus: 'success'
  });

  return {
    status: 'updated',
    currentVersion: installation.VERSION,
    latestVersion,
    method,
    command,
    checkedAt
  };
}
