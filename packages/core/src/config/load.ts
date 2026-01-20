import { access, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseJsonc } from './jsonc';
import type { ConfigFormat, LoadedConfig, TreqConfigInput } from './types';

export type LoadConfigOptions =
  | { path: string }
  | { startDir: string; filename?: string; stopDir?: string };

// Config file discovery order (preferred first)
const CONFIG_FILES: Array<{ filename: string; format: ConfigFormat }> = [
  { filename: 'treq.jsonc', format: 'jsonc' },
  { filename: 'treq.json', format: 'json' },
  { filename: 'treq.config.ts', format: 'ts' },
  { filename: 'treq.config.js', format: 'js' },
  { filename: 'treq.config.mjs', format: 'mjs' }
];

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find config file by walking up from startDir.
 * Returns the first matching config file found.
 */
async function findUp(
  startDir: string,
  filename: string | undefined,
  stopDir?: string
): Promise<{ path: string; format: ConfigFormat } | undefined> {
  let dir = path.resolve(startDir);
  const stop = stopDir ? path.resolve(stopDir) : undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // If specific filename provided, only check that file
    if (filename) {
      const candidate = path.join(dir, filename);
      if (await fileExists(candidate)) {
        // Determine format from extension
        const format = getFormatFromFilename(filename);
        return { path: candidate, format };
      }
    } else {
      // Check all config files in discovery order
      for (const { filename: fname, format } of CONFIG_FILES) {
        const candidate = path.join(dir, fname);
        if (await fileExists(candidate)) {
          return { path: candidate, format };
        }
      }
    }

    if (stop && dir === stop) return undefined;

    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function getFormatFromFilename(filename: string): ConfigFormat {
  if (filename.endsWith('.jsonc')) return 'jsonc';
  if (filename.endsWith('.json')) return 'json';
  if (filename.endsWith('.ts')) return 'ts';
  if (filename.endsWith('.mjs')) return 'mjs';
  if (filename.endsWith('.js')) return 'js';
  return 'json'; // Default fallback
}

function getFormatFromPath(configPath: string): ConfigFormat {
  const basename = path.basename(configPath);
  return getFormatFromFilename(basename);
}

async function importConfigFile(configPath: string): Promise<TreqConfigInput> {
  const url = pathToFileURL(configPath).href;
  const mod = (await import(url)) as { default?: unknown };
  const cfg = mod.default;
  if (!cfg || typeof cfg !== 'object') {
    throw new Error(`Invalid config export from ${configPath}. Expected default object export.`);
  }
  return cfg as TreqConfigInput;
}

async function loadJsoncConfigFile(configPath: string): Promise<TreqConfigInput> {
  const content = await readFile(configPath, 'utf-8');
  const parsed = parseJsonc<TreqConfigInput>(content);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid JSONC config at ${configPath}. Expected object.`);
  }
  return parsed;
}

async function loadJsonConfigFile(configPath: string): Promise<TreqConfigInput> {
  const content = await readFile(configPath, 'utf-8');
  const parsed = JSON.parse(content) as TreqConfigInput;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid JSON config at ${configPath}. Expected object.`);
  }
  return parsed;
}

async function loadConfigByFormat(
  configPath: string,
  format: ConfigFormat
): Promise<TreqConfigInput> {
  switch (format) {
    case 'jsonc':
      return await loadJsoncConfigFile(configPath);
    case 'json':
      return await loadJsonConfigFile(configPath);
    case 'ts':
    case 'js':
    case 'mjs':
      return await importConfigFile(configPath);
    default:
      throw new Error(`Unknown config format: ${format}`);
  }
}

/**
 * Load config from an explicit path or by searching upwards.
 *
 * Discovery order (when searching):
 * 1. treq.jsonc (preferred)
 * 2. treq.json
 * 3. treq.config.ts (legacy, deprecated)
 * 4. treq.config.js (legacy, deprecated)
 * 5. treq.config.mjs (legacy, deprecated)
 *
 * Node/Bun only (not renderer-safe).
 */
export async function loadConfig(options: LoadConfigOptions): Promise<LoadedConfig> {
  const filename = 'filename' in options && options.filename ? options.filename : undefined;

  let configPath: string | undefined;
  let format: ConfigFormat | undefined;

  if ('path' in options) {
    configPath = path.resolve(options.path);
    format = getFormatFromPath(configPath);
    if (!(await fileExists(configPath))) {
      return { config: {} };
    }
  } else {
    const found = await findUp(options.startDir, filename, options.stopDir);
    if (!found) {
      return { config: {} };
    }
    configPath = found.path;
    format = found.format;
  }

  const config = await loadConfigByFormat(configPath, format);
  return { path: configPath, config, format };
}

/**
 * Check if a config format is a legacy format (TS/JS).
 */
export function isLegacyFormat(format: ConfigFormat | undefined): boolean {
  return format === 'ts' || format === 'js' || format === 'mjs';
}
