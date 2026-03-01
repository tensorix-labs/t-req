import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AutoUpdateStateStore, AutoUpdateStateV1 } from './types';

export const AUTO_UPDATE_CHECK_TTL_MS = 24 * 60 * 60 * 1000;
export const AUTO_UPDATE_RETRY_BACKOFF_MS = 24 * 60 * 60 * 1000;

const STATE_VERSION = 1;
const DEFAULT_STATE_PATH = join(homedir(), '.treq', 'auto-update.json');

function createDefaultState(): AutoUpdateStateV1 {
  return { version: STATE_VERSION };
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'number') return undefined;
  if (!Number.isFinite(value)) return undefined;
  return value;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function toOptionalStatus(value: unknown): 'success' | 'failed' | undefined {
  return value === 'success' || value === 'failed' ? value : undefined;
}

export function normalizeState(raw: unknown): AutoUpdateStateV1 {
  if (typeof raw !== 'object' || raw === null) {
    return createDefaultState();
  }

  const value = raw as Record<string, unknown>;

  return {
    version: STATE_VERSION,
    lastCheckedAt: toOptionalNumber(value.lastCheckedAt),
    cachedLatestVersion: toOptionalString(value.cachedLatestVersion),
    lastAttemptedVersion: toOptionalString(value.lastAttemptedVersion),
    lastAttemptedAt: toOptionalNumber(value.lastAttemptedAt),
    lastAttemptStatus: toOptionalStatus(value.lastAttemptStatus)
  };
}

export function createAutoUpdateStateStore(path = DEFAULT_STATE_PATH): AutoUpdateStateStore {
  return {
    async read(): Promise<AutoUpdateStateV1> {
      try {
        const content = await readFile(path, 'utf8');
        const parsed = JSON.parse(content) as unknown;
        return normalizeState(parsed);
      } catch {
        return createDefaultState();
      }
    },
    async write(state: AutoUpdateStateV1): Promise<void> {
      const next = normalizeState(state);
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      } catch {
        // Best-effort write only; update checks must never fail command execution.
      }
    }
  };
}
