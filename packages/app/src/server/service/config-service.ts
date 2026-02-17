import {
  type ConfigMeta,
  listProfiles,
  loadConfig,
  type ResolvedConfig,
  resolveProjectConfig
} from '@t-req/core/config';
import { dirname, resolve } from '../../utils';
import type { ConfigSummaryResponse, ResolvedPaths } from '../schemas';
import type { ServiceContext } from './types';
import { sanitizeVariables } from './utils';

type ResolvedConfigResult = { config: ResolvedConfig; meta: ConfigMeta };

export interface ConfigService {
  getWorkspaceConfig(): Promise<ResolvedConfigResult>;
  getExecutionBaseConfig(options: {
    startDir: string;
    profile?: string;
  }): Promise<ResolvedConfigResult>;
  getConfig(options: { profile?: string; path?: string }): Promise<ConfigSummaryResponse>;
  getResolvedPaths(httpFilePath?: string, resolvedConfig?: ResolvedConfigResult): ResolvedPaths;
  dispose(): Promise<void>;
}

export function createConfigService(context: ServiceContext): ConfigService {
  // Cached workspace-level config for plugins
  let workspaceConfigCache: ResolvedConfigResult | null = null;
  let workspaceConfigPromise: Promise<ResolvedConfigResult> | null = null;
  const executionConfigCache = new Map<string, ResolvedConfigResult>();
  const executionConfigPromises = new Map<string, Promise<ResolvedConfigResult>>();
  let disposed = false;

  async function getWorkspaceConfig(): Promise<ResolvedConfigResult> {
    if (workspaceConfigCache) {
      return workspaceConfigCache;
    }
    if (workspaceConfigPromise) {
      return workspaceConfigPromise;
    }
    workspaceConfigPromise = resolveProjectConfig({
      startDir: context.workspaceRoot,
      stopDir: context.workspaceRoot,
      profile: context.profile
    }).then((result) => {
      workspaceConfigCache = result;
      workspaceConfigPromise = null;
      return result;
    });
    return workspaceConfigPromise;
  }

  function getExecutionConfigCacheKey(startDir: string, profile?: string): string {
    const normalizedStartDir = resolve(startDir);
    return `${normalizedStartDir}::${profile ?? ''}`;
  }

  async function getExecutionBaseConfig(options: {
    startDir: string;
    profile?: string;
  }): Promise<ResolvedConfigResult> {
    const cacheKey = getExecutionConfigCacheKey(options.startDir, options.profile);

    const cached = executionConfigCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const pending = executionConfigPromises.get(cacheKey);
    if (pending) {
      return pending;
    }

    const promise = resolveProjectConfig({
      startDir: resolve(options.startDir),
      stopDir: context.workspaceRoot,
      profile: options.profile
    })
      .then((result) => {
        executionConfigCache.set(cacheKey, result);
        executionConfigPromises.delete(cacheKey);
        return result;
      })
      .catch((error) => {
        executionConfigPromises.delete(cacheKey);
        throw error;
      });

    executionConfigPromises.set(cacheKey, promise);
    return promise;
  }

  async function getConfig(options: {
    profile?: string;
    path?: string;
  }): Promise<ConfigSummaryResponse> {
    const startDir = options.path
      ? dirname(resolve(context.workspaceRoot, options.path))
      : context.workspaceRoot;

    const resolved = await resolveProjectConfig({
      startDir,
      stopDir: context.workspaceRoot,
      profile: options.profile
    });

    const { config: projectConfig, meta } = resolved;

    const rawConfig = await loadConfig({ startDir, stopDir: context.workspaceRoot });
    const availableProfiles = listProfiles(rawConfig.config);

    // Sanitize variables (redact sensitive values)
    const sanitizedVariables = sanitizeVariables(projectConfig.variables);

    return {
      configPath: meta.configPath,
      projectRoot: meta.projectRoot,
      format: meta.format,
      profile: meta.profile,
      availableProfiles,
      layersApplied: meta.layersApplied,
      resolvedConfig: {
        variables: sanitizedVariables,
        defaults: projectConfig.defaults,
        cookies: projectConfig.cookies,
        security: projectConfig.security,
        resolverNames: Object.keys(projectConfig.resolvers)
      },
      warnings: meta.warnings
    };
  }

  function getResolvedPaths(
    httpFilePath?: string,
    resolvedConfig?: ResolvedConfigResult
  ): ResolvedPaths {
    const basePath = httpFilePath
      ? dirname(resolve(context.workspaceRoot, httpFilePath))
      : context.workspaceRoot;

    return {
      workspaceRoot: context.workspaceRoot,
      projectRoot: resolvedConfig?.meta.projectRoot ?? context.workspaceRoot,
      httpFilePath,
      basePath,
      configPath: resolvedConfig?.meta.configPath
    };
  }

  async function dispose(): Promise<void> {
    if (disposed) {
      return;
    }
    disposed = true;

    const pluginManagers = new Set<NonNullable<ResolvedConfig['pluginManager']>>();
    const collectPluginManager = (resolved?: ResolvedConfigResult | null) => {
      const pluginManager = resolved?.config.pluginManager;
      if (pluginManager) {
        pluginManagers.add(pluginManager);
      }
    };

    collectPluginManager(workspaceConfigCache);
    for (const value of executionConfigCache.values()) {
      collectPluginManager(value);
    }

    if (workspaceConfigPromise) {
      try {
        collectPluginManager(await workspaceConfigPromise);
      } catch {
        // Ignore failed in-flight config resolution on shutdown.
      }
    }

    for (const pending of executionConfigPromises.values()) {
      try {
        collectPluginManager(await pending);
      } catch {
        // Ignore failed in-flight config resolution on shutdown.
      }
    }

    workspaceConfigCache = null;
    workspaceConfigPromise = null;
    executionConfigCache.clear();
    executionConfigPromises.clear();

    for (const pluginManager of pluginManagers) {
      await pluginManager.teardown();
    }
  }

  return {
    getWorkspaceConfig,
    getExecutionBaseConfig,
    getConfig,
    getResolvedPaths,
    dispose
  };
}
