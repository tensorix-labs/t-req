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

export interface ConfigService {
  getWorkspaceConfig(): Promise<{ config: ResolvedConfig; meta: ConfigMeta }>;
  getConfig(options: { profile?: string; path?: string }): Promise<ConfigSummaryResponse>;
  getResolvedPaths(
    httpFilePath?: string,
    resolvedConfig?: { config: ResolvedConfig; meta: ConfigMeta }
  ): ResolvedPaths;
}

export function createConfigService(context: ServiceContext): ConfigService {
  // Cached workspace-level config for plugins
  let workspaceConfigCache: { config: ResolvedConfig; meta: ConfigMeta } | null = null;
  let workspaceConfigPromise: Promise<{ config: ResolvedConfig; meta: ConfigMeta }> | null = null;

  async function getWorkspaceConfig(): Promise<{ config: ResolvedConfig; meta: ConfigMeta }> {
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
    resolvedConfig?: { config: ResolvedConfig; meta: ConfigMeta }
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

  return {
    getWorkspaceConfig,
    getConfig,
    getResolvedPaths
  };
}
