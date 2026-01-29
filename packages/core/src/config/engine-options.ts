import type { EngineConfig } from '../engine/engine';
import type { CookieStore, EngineEvent } from '../runtime/types';
import type { ResolvedConfig } from './types';

// ============================================================================
// Types
// ============================================================================

export type RequestDefaults = {
  timeoutMs: number;
  followRedirects: boolean;
  validateSSL: boolean;
  proxy?: string;
};

export type BuildEngineOptionsInput = {
  config: ResolvedConfig;
  cookieStore?: CookieStore;
  onEvent?: (event: EngineEvent) => void;
};

export type BuildEngineOptionsResult = {
  engineOptions: EngineConfig;
  requestDefaults: RequestDefaults;
};

// ============================================================================
// Main API
// ============================================================================

/**
 * Build engine options from resolved config.
 *
 * This is the centralized helper used by both CLI and server to ensure
 * consistent engine configuration.
 *
 * Usage:
 * ```typescript
 * const { engineOptions, requestDefaults } = buildEngineOptions({
 *   config,
 *   cookieStore,
 *   onEvent
 * });
 *
 * const engine = createEngine(engineOptions);
 *
 * const response = await engine.runString(content, {
 *   variables: config.variables,
 *   basePath,
 *   timeoutMs: explicitTimeout ?? requestDefaults.timeoutMs,
 *   followRedirects: explicitFollowRedirects ?? requestDefaults.followRedirects,
 *   validateSSL: explicitValidateSSL ?? requestDefaults.validateSSL
 * });
 * ```
 *
 * @param input - Configuration input
 * @returns Engine options and request defaults
 */
export function buildEngineOptions(input: BuildEngineOptionsInput): BuildEngineOptionsResult {
  const { config, cookieStore, onEvent } = input;

  // Build engine options conditionally to handle exactOptionalPropertyTypes
  const engineOptions: EngineConfig = {};

  // Only include cookieStore if cookies are enabled and a store is provided
  if (config.cookies.enabled && cookieStore) {
    engineOptions.cookieStore = cookieStore;
  }

  // Header defaults from config
  engineOptions.headerDefaults = config.defaults.headers;

  // Compiled resolvers (all are functions at this point)
  engineOptions.resolvers = config.resolvers;

  // Event handler - only include if provided
  if (onEvent) {
    engineOptions.onEvent = onEvent;
  }

  // Plugin manager - only include if available
  if (config.pluginManager) {
    engineOptions.pluginManager = config.pluginManager;
  }

  // Build request defaults conditionally
  const requestDefaults: RequestDefaults = {
    timeoutMs: config.defaults.timeoutMs,
    followRedirects: config.defaults.followRedirects,
    validateSSL: config.defaults.validateSSL
  };

  // Only include proxy if defined
  if (config.defaults.proxy) {
    requestDefaults.proxy = config.defaults.proxy;
  }

  return { engineOptions, requestDefaults };
}
