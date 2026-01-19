import { access } from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LoadedConfig, TreqConfig } from './types';

export type LoadConfigOptions =
  | { path: string }
  | { startDir: string; filename?: string; stopDir?: string };

const DEFAULT_FILENAME = 'treq.config.ts';

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function findUp(
  startDir: string,
  filename: string,
  stopDir?: string
): Promise<string | undefined> {
  let dir = path.resolve(startDir);
  const stop = stopDir ? path.resolve(stopDir) : undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(dir, filename);
    if (await fileExists(candidate)) return candidate;

    if (stop && dir === stop) return undefined;

    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

async function importConfigFile(configPath: string): Promise<TreqConfig> {
  const url = pathToFileURL(configPath).href;
  const mod = (await import(url)) as { default?: unknown };
  const cfg = mod.default;
  if (!cfg || typeof cfg !== 'object') {
    throw new Error(`Invalid config export from ${configPath}. Expected default object export.`);
  }
  return cfg as TreqConfig;
}

/**
 * Load `treq.config.ts` from an explicit path or by searching upwards.
 *
 * Node/Bun only (not renderer-safe).
 */
export async function loadConfig(options: LoadConfigOptions): Promise<LoadedConfig> {
  const filename = 'filename' in options && options.filename ? options.filename : DEFAULT_FILENAME;

  const configPath =
    'path' in options
      ? path.resolve(options.path)
      : await findUp(options.startDir, filename, options.stopDir);

  if (!configPath) {
    return { config: {} };
  }

  return { path: configPath, config: await importConfigFile(configPath) };
}
