import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { createCommandResolver, isCommandResolverDef } from '../resolver/command';
import type { Resolver } from '../types';
import { isLegacyFormat, loadConfig } from './load';
import { applyProfile, mergeConfig } from './merge';
import { applySubstitutions } from './substitution';
import type {
  CommandResolverDef,
  ConfigMeta,
  ResolvedConfig,
  ResolvedCookiesConfig,
  ResolvedDefaults,
  ResolvedProjectConfig,
  TreqConfigInput
} from './types';

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_FOLLOW_REDIRECTS = true;
export const DEFAULT_VALIDATE_SSL = true;

// ============================================================================
// Types
// ============================================================================

export type ConfigOverrideLayer = {
  /**
   * A human-friendly layer name for introspection (e.g. "env", "cli", "session", "request").
   */
  name: string;
  overrides: Partial<TreqConfigInput>;
};

export type ResolveProjectConfigOptions = {
  /**
   * Directory to start searching for config from.
   */
  startDir: string;

  /**
   * Stop searching at this directory (e.g., workspace root).
   * Prevents accidentally picking a parent config outside the intended workspace.
   */
  stopDir?: string;

  /**
   * Profile to apply.
   */
  profile?: string;

  /**
   * Named override layers to apply, in-order, after profile.
   * Each layer is merged with "last wins" semantics.
   */
  overrideLayers?: ConfigOverrideLayer[];

  /**
   * Overrides to apply (from CLI flags, environment files, etc.).
   * Applied after profile.
   */
  overrides?: Partial<TreqConfigInput>;

  /**
   * Layer name recorded in metadata for the `overrides` option.
   * Defaults to "overrides".
   */
  overridesLayerName?: string;
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find git root directory by walking up from startDir.
 */
function findGitRoot(startDir: string, stopDir?: string): string | undefined {
  let dir = path.resolve(startDir);
  const stop = stopDir ? path.resolve(stopDir) : undefined;
  const { root } = path.parse(dir);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const gitPath = path.join(dir, '.git');
    if (existsSync(gitPath)) {
      return dir;
    }

    if (stop && dir === stop) return undefined;

    if (dir === root) return undefined;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Determine project root based on config path or fallbacks.
 */
function determineProjectRoot(
  configPath: string | undefined,
  startDir: string,
  workspaceRoot?: string
): string {
  // If config file found, use its directory
  if (configPath) {
    return path.dirname(configPath);
  }

  // Fallback: git root → workspace root → startDir
  const resolvedWorkspace = workspaceRoot ? path.resolve(workspaceRoot) : undefined;
  const gitRoot = findGitRoot(startDir, resolvedWorkspace);
  return gitRoot ?? resolvedWorkspace ?? path.resolve(startDir);
}

/**
 * Resolve cookie config to ResolvedCookiesConfig.
 */
function resolveCookies(cookies: TreqConfigInput['cookies']): ResolvedCookiesConfig {
  const enabled = cookies?.enabled !== false; // Default: true
  const jarPath = cookies?.jarPath;

  let mode: 'disabled' | 'memory' | 'persistent';
  if (!enabled) {
    mode = 'disabled';
  } else if (jarPath) {
    mode = 'persistent';
  } else {
    mode = 'memory';
  }

  const result: ResolvedCookiesConfig = {
    enabled,
    mode
  };

  // Only include jarPath if defined
  if (jarPath) {
    result.jarPath = jarPath;
  }

  return result;
}

/**
 * Resolve defaults to ResolvedDefaults with all required fields.
 */
function resolveDefaults(defaults: TreqConfigInput['defaults']): ResolvedDefaults {
  const result: ResolvedDefaults = {
    timeoutMs: defaults?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    followRedirects: defaults?.followRedirects ?? DEFAULT_FOLLOW_REDIRECTS,
    validateSSL: defaults?.validateSSL ?? DEFAULT_VALIDATE_SSL,
    headers: defaults?.headers ?? {}
  };

  // Only include proxy if defined
  if (defaults?.proxy) {
    result.proxy = defaults.proxy;
  }

  return result;
}

/**
 * Compile resolvers: convert CommandResolverDef to Resolver functions.
 */
function compileResolvers(
  input: Record<string, Resolver | CommandResolverDef> | undefined,
  projectRoot: string
): Record<string, Resolver> {
  if (!input) {
    return {};
  }

  const result: Record<string, Resolver> = {};

  for (const [name, def] of Object.entries(input)) {
    if (typeof def === 'function') {
      // Already a function resolver
      result[name] = def;
    } else if (isCommandResolverDef(def)) {
      // Command resolver - compile to function with name for error messages
      result[name] = createCommandResolver(def, projectRoot, name);
    } else {
      throw new Error(
        `Unknown resolver type for "${name}". Expected function or { type: "command", command: [...] }`
      );
    }
  }

  return result;
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Resolve project configuration - the single source of truth for both CLI and server.
 *
 * This function:
 * 1. Discovers config file (treq.jsonc, treq.json, treq.config.ts, etc.)
 * 2. Parses the config
 * 3. Applies substitutions ({env:}, {file:})
 * 4. Applies profile overlay
 * 5. Applies overrides (CLI flags, etc.)
 * 6. Compiles resolvers (CommandResolverDef → Resolver wrapper)
 * 7. Resolves cookies and defaults
 * 8. Returns { config: ResolvedConfig, meta: ConfigMeta }
 *
 * @param options - Configuration options
 * @returns ResolvedProjectConfig with config and metadata
 */
export async function resolveProjectConfig(
  options: ResolveProjectConfigOptions
): Promise<ResolvedProjectConfig> {
  const warnings: string[] = [];
  const layersApplied: string[] = [];

  // Step 1: Load config file
  const loadOptions: { startDir: string; stopDir?: string } = {
    startDir: options.startDir
  };
  if (options.stopDir) {
    loadOptions.stopDir = options.stopDir;
  }
  const loaded = await loadConfig(loadOptions);

  const resolvedWorkspaceRoot = options.stopDir ? path.resolve(options.stopDir) : undefined;

  // Determine project root (locked semantics)
  const projectRoot = determineProjectRoot(loaded.path, options.startDir, resolvedWorkspaceRoot);

  // Track warnings for legacy formats
  if (loaded.path && isLegacyFormat(loaded.format)) {
    warnings.push(`${path.basename(loaded.path)} is deprecated; migrate to treq.jsonc`);
  }

  // Step 2: Start building merged config
  let mergedConfig: TreqConfigInput = {};

  if (loaded.config && Object.keys(loaded.config).length > 0) {
    layersApplied.push('file');
    mergedConfig = loaded.config;
  }

  // Step 3: Apply profile if specified
  if (options.profile) {
    mergedConfig = applyProfile(mergedConfig, options.profile);
    layersApplied.push(`profile:${options.profile}`);
  }

  // Step 4: Apply named override layers (e.g. session, request, env, cli)
  for (const layer of options.overrideLayers ?? []) {
    if (!layer || !layer.overrides || Object.keys(layer.overrides).length === 0) continue;
    mergedConfig = mergeConfig({
      file: mergedConfig,
      overrides: layer.overrides as TreqConfigInput
    });
    layersApplied.push(layer.name);
  }

  // Step 5: Apply overrides (single final layer)
  if (options.overrides && Object.keys(options.overrides).length > 0) {
    mergedConfig = mergeConfig({
      file: mergedConfig,
      overrides: options.overrides as TreqConfigInput
    });
    layersApplied.push(options.overridesLayerName ?? 'overrides');
  }

  // Step 6: Apply substitutions to the fully-merged config
  const workspaceRoot = resolvedWorkspaceRoot ?? projectRoot;
  const configDir = loaded.path ? path.dirname(loaded.path) : projectRoot;
  const allowExternalFiles = mergedConfig.security?.allowExternalFiles ?? false;

  mergedConfig = applySubstitutions(mergedConfig, {
    configDir,
    workspaceRoot,
    allowExternalFiles
  }) as TreqConfigInput;

  // Step 7: Compile resolvers
  const resolvers = compileResolvers(mergedConfig.resolvers, projectRoot);

  // Step 8: Build final resolved config
  const config: ResolvedConfig = {
    projectRoot,
    variables: mergedConfig.variables ?? {},
    defaults: resolveDefaults(mergedConfig.defaults),
    cookies: resolveCookies(mergedConfig.cookies),
    resolvers,
    security: {
      allowExternalFiles: mergedConfig.security?.allowExternalFiles ?? false
    }
  };

  // Step 9: Build metadata
  const meta: ConfigMeta = {
    projectRoot,
    layersApplied,
    warnings
  };

  // Only include optional fields if defined
  if (loaded.path) {
    meta.configPath = loaded.path;
  }
  if (loaded.format) {
    meta.format = loaded.format;
  }
  if (options.profile) {
    meta.profile = options.profile;
  }

  return { config, meta };
}
