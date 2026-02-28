import { describe, expect, test } from 'bun:test';
import type { Installation } from '../../src/installation';
import {
  AUTO_UPDATE_CHECK_TTL_MS,
  AUTO_UPDATE_RETRY_BACKOFF_MS,
  type AutoUpdateStateStore,
  type AutoUpdateStateV1,
  checkForAvailableUpdate,
  type InstallationLike,
  resolveAutoUpdateEnabled,
  runAutoUpdate
} from '../../src/update';

interface InstallationStub {
  installation: InstallationLike;
  calls: {
    latest: number;
    upgrade: number;
  };
}

function createInstallationStub(options?: {
  version?: string;
  method?: Installation.Method;
  latest?: string;
  latestError?: string;
  upgradeError?: string;
}): InstallationStub {
  const calls = {
    latest: 0,
    upgrade: 0
  };

  const installation: InstallationLike = {
    VERSION: options?.version ?? '0.1.0',
    async method() {
      return options?.method ?? 'npm';
    },
    async latest() {
      calls.latest += 1;
      if (options?.latestError) {
        throw new Error(options.latestError);
      }
      return options?.latest ?? '0.2.0';
    },
    updateCommand(method, target) {
      return `${method}:${target ?? 'latest'}`;
    },
    async upgrade() {
      calls.upgrade += 1;
      if (options?.upgradeError) {
        throw new Error(options.upgradeError);
      }
    }
  };

  return { installation, calls };
}

function createMemoryStateStore(initial?: AutoUpdateStateV1): {
  store: AutoUpdateStateStore;
  get: () => AutoUpdateStateV1;
} {
  let state: AutoUpdateStateV1 = initial ?? { version: 1 };
  return {
    store: {
      async read() {
        return { ...state };
      },
      async write(next) {
        state = { ...next };
      }
    },
    get: () => ({ ...state })
  };
}

describe('resolveAutoUpdateEnabled', () => {
  test('defaults to true', () => {
    expect(resolveAutoUpdateEnabled(undefined, {})).toBe(true);
  });

  test('respects option when env is absent', () => {
    expect(resolveAutoUpdateEnabled(false, {})).toBe(false);
    expect(resolveAutoUpdateEnabled(true, {})).toBe(true);
  });

  test('env override wins over option value', () => {
    expect(resolveAutoUpdateEnabled(true, { TREQ_AUTO_UPDATE: '0' })).toBe(false);
    expect(resolveAutoUpdateEnabled(false, { TREQ_AUTO_UPDATE: 'true' })).toBe(true);
  });
});

describe('checkForAvailableUpdate', () => {
  test('returns undefined when latest is older than current', async () => {
    const { installation } = createInstallationStub({
      version: '1.2.0',
      latest: '1.1.0'
    });
    const result = await checkForAvailableUpdate(installation);
    expect(result).toBeUndefined();
  });
});

describe('runAutoUpdate', () => {
  test('returns disabled when feature is off', async () => {
    const { installation } = createInstallationStub();
    const result = await runAutoUpdate(
      { enabled: false, interactive: true },
      { installation, stateStore: createMemoryStateStore().store }
    );
    expect(result).toEqual({ status: 'disabled', reason: 'disabled' });
  });

  test('returns disabled when non-interactive', async () => {
    const { installation } = createInstallationStub();
    const result = await runAutoUpdate(
      { enabled: true, interactive: false },
      { installation, stateStore: createMemoryStateStore().store }
    );
    expect(result).toEqual({ status: 'disabled', reason: 'non_interactive' });
  });

  test('uses cached latest version within ttl', async () => {
    const now = 1_000_000;
    const { installation, calls } = createInstallationStub({ method: 'unknown' });
    const { store } = createMemoryStateStore({
      version: 1,
      lastCheckedAt: now - 1000,
      cachedLatestVersion: '0.2.0'
    });

    const result = await runAutoUpdate(
      { enabled: true, interactive: true, now: () => now },
      {
        installation,
        stateStore: store
      }
    );

    expect(result.status).toBe('available_manual');
    expect(calls.latest).toBe(0);
  });

  test('refreshes latest when cache is stale', async () => {
    const now = 2_000_000;
    const { installation, calls } = createInstallationStub({ method: 'unknown', latest: '0.3.0' });
    const { store } = createMemoryStateStore({
      version: 1,
      lastCheckedAt: now - AUTO_UPDATE_CHECK_TTL_MS - 1,
      cachedLatestVersion: '0.2.0'
    });

    const result = await runAutoUpdate(
      { enabled: true, interactive: true, now: () => now },
      {
        installation,
        stateStore: store
      }
    );

    expect(result.status).toBe('available_manual');
    expect(calls.latest).toBe(1);
  });

  test('returns available_manual for unknown install method', async () => {
    const { installation } = createInstallationStub({ method: 'unknown', latest: '0.2.0' });
    const result = await runAutoUpdate(
      { enabled: true, interactive: true },
      { installation, stateStore: createMemoryStateStore().store }
    );

    expect(result).toMatchObject({
      status: 'available_manual',
      latestVersion: '0.2.0',
      method: 'unknown',
      command: 'unknown:0.2.0'
    });
  });

  test('returns updated and writes success attempt state', async () => {
    const now = 3_000_000;
    const { installation, calls } = createInstallationStub({ method: 'npm', latest: '0.2.0' });
    const memory = createMemoryStateStore();

    const result = await runAutoUpdate(
      { enabled: true, interactive: true, now: () => now },
      {
        installation,
        stateStore: memory.store
      }
    );

    expect(result.status).toBe('updated');
    expect(calls.upgrade).toBe(1);
    expect(memory.get()).toMatchObject({
      lastAttemptedVersion: '0.2.0',
      lastAttemptedAt: now,
      lastAttemptStatus: 'success'
    });
  });

  test('returns up_to_date and skips upgrade when latest is older than current', async () => {
    const { installation, calls } = createInstallationStub({
      version: '1.2.0',
      latest: '1.1.0',
      method: 'npm'
    });

    const result = await runAutoUpdate(
      { enabled: true, interactive: true },
      { installation, stateStore: createMemoryStateStore().store }
    );

    expect(result.status).toBe('up_to_date');
    expect(calls.upgrade).toBe(0);
  });

  test('returns backoff_skipped after recent failure for same target', async () => {
    const now = 4_000_000;
    const { installation, calls } = createInstallationStub({ method: 'npm' });
    const { store } = createMemoryStateStore({
      version: 1,
      lastCheckedAt: now - 500,
      cachedLatestVersion: '0.2.0',
      lastAttemptedVersion: '0.2.0',
      lastAttemptedAt: now - 1000,
      lastAttemptStatus: 'failed'
    });

    const result = await runAutoUpdate(
      { enabled: true, interactive: true, now: () => now },
      {
        installation,
        stateStore: store
      }
    );

    expect(result.status).toBe('backoff_skipped');
    expect(calls.upgrade).toBe(0);
    if (result.status === 'backoff_skipped') {
      expect(result.retryAfter).toBe(now - 1000 + AUTO_UPDATE_RETRY_BACKOFF_MS);
    }
  });

  test('returns failed phase=upgrade and stores failed attempt on upgrade error', async () => {
    const now = 5_000_000;
    const { installation, calls } = createInstallationStub({
      method: 'npm',
      latest: '0.2.0',
      upgradeError: 'permission denied'
    });
    const memory = createMemoryStateStore();

    const result = await runAutoUpdate(
      { enabled: true, interactive: true, now: () => now },
      {
        installation,
        stateStore: memory.store
      }
    );

    expect(result).toMatchObject({
      status: 'failed',
      phase: 'upgrade',
      latestVersion: '0.2.0'
    });
    expect(calls.upgrade).toBe(1);
    expect(memory.get()).toMatchObject({
      lastAttemptedVersion: '0.2.0',
      lastAttemptStatus: 'failed'
    });
  });

  test('returns failed phase=check when latest lookup fails', async () => {
    const { installation } = createInstallationStub({
      method: 'npm',
      latestError: 'offline'
    });

    const result = await runAutoUpdate(
      { enabled: true, interactive: true },
      { installation, stateStore: createMemoryStateStore().store }
    );

    expect(result).toMatchObject({
      status: 'failed',
      phase: 'check',
      error: 'offline'
    });
  });
});
