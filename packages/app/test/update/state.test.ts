import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAutoUpdateStateStore, normalizeState } from '../../src/update';

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'treq-test-'));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe('normalizeState', () => {
  test('returns default state for invalid input', () => {
    expect(normalizeState(null)).toEqual({ version: 1 });
    expect(normalizeState('invalid')).toEqual({ version: 1 });
  });

  test('keeps only recognized fields', () => {
    const state = normalizeState({
      version: 999,
      lastCheckedAt: 100,
      cachedLatestVersion: '0.2.0',
      lastAttemptedVersion: '0.2.0',
      lastAttemptedAt: 200,
      lastAttemptStatus: 'failed',
      extra: true
    });

    expect(state).toEqual({
      version: 1,
      lastCheckedAt: 100,
      cachedLatestVersion: '0.2.0',
      lastAttemptedVersion: '0.2.0',
      lastAttemptedAt: 200,
      lastAttemptStatus: 'failed'
    });
  });
});

describe('createAutoUpdateStateStore', () => {
  test('read returns default state when file is missing', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/auto-update.json`;
      const store = createAutoUpdateStateStore(path);
      const state = await store.read();
      expect(state).toEqual({ version: 1 });
    });
  });

  test('read returns default state when json is invalid', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/auto-update.json`;
      await Bun.write(path, '{not valid json}');

      const store = createAutoUpdateStateStore(path);
      const state = await store.read();
      expect(state).toEqual({ version: 1 });
    });
  });

  test('write then read preserves normalized state', async () => {
    await withTempDir(async (dir) => {
      const path = `${dir}/state/auto-update.json`;
      const store = createAutoUpdateStateStore(path);

      await store.write({
        version: 1,
        lastCheckedAt: 111,
        cachedLatestVersion: '0.3.0',
        lastAttemptedVersion: '0.3.0',
        lastAttemptedAt: 222,
        lastAttemptStatus: 'success'
      });

      expect(existsSync(path)).toBe(true);
      const state = await store.read();
      expect(state).toEqual({
        version: 1,
        lastCheckedAt: 111,
        cachedLatestVersion: '0.3.0',
        lastAttemptedVersion: '0.3.0',
        lastAttemptedAt: 222,
        lastAttemptStatus: 'success'
      });
    });
  });

  test('write is best-effort when target path cannot be created', async () => {
    await withTempDir(async (dir) => {
      await Bun.write(`${dir}/blocked`, 'x');
      const path = `${dir}/blocked/auto-update.json`;
      const store = createAutoUpdateStateStore(path);

      await expect(
        store.write({
          version: 1,
          lastCheckedAt: 1,
          cachedLatestVersion: '0.2.0'
        })
      ).resolves.toBeUndefined();
    });
  });
});
