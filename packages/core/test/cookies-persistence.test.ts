import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createCookieJar } from '../src/cookies';
import {
  createCookieJarManager,
  flushPendingCookieSaves,
  scheduleCookieJarSave
} from '../src/cookies/persistence';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'treq-cookies-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('cookie persistence', () => {
  test('withLock serializes concurrent operations for same jarPath', async () => {
    await withTempDir(async (dir) => {
      const jarPath = path.join(dir, 'cookies.json');
      const manager = createCookieJarManager(jarPath);

      let active = 0;
      let maxActive = 0;

      const runLocked = async (): Promise<void> => {
        await manager.withLock(async () => {
          active++;
          maxActive = Math.max(maxActive, active);
          await sleep(25);
          active--;
        });
      };

      await Promise.all([runLocked(), runLocked(), runLocked()]);
      expect(maxActive).toBe(1);
    });
  });

  test('flushPendingCookieSaves writes debounced saves immediately', async () => {
    await withTempDir(async (dir) => {
      const stateDir = path.join(dir, '.treq');
      await mkdir(stateDir, { recursive: true });

      const jarPath = path.join(stateDir, 'cookies.json');
      const jar = createCookieJar();
      jar.setCookieSync('session=abc123; Path=/', 'https://example.com/');

      scheduleCookieJarSave(jarPath, jar);
      await flushPendingCookieSaves();

      const txt = await Bun.file(jarPath).text();
      const parsed = JSON.parse(txt) as {
        version?: number;
        cookies?: Array<{ key: string; value: string }>;
      };

      expect(parsed.version).toBe(1);
      expect(parsed.cookies?.some((c) => c.key === 'session' && c.value === 'abc123')).toBe(true);
    });
  });
});
