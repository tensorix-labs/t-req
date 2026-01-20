// Core config functions
export { defineConfig } from './define';
// Engine options builder
export {
  type BuildEngineOptionsInput,
  type BuildEngineOptionsResult,
  buildEngineOptions,
  type RequestDefaults
} from './engine-options';
// JSONC parsing
export { parseJsonc, stripJsonComments } from './jsonc';
// Config loading
export { isLegacyFormat, type LoadConfigOptions, loadConfig } from './load';
// Config merging
export { applyProfile, listProfiles, type MergeConfigInputs, mergeConfig } from './merge';
// Config resolution (unified API)
export {
  type ConfigOverrideLayer,
  DEFAULT_FOLLOW_REDIRECTS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_VALIDATE_SSL,
  type ResolveProjectConfigOptions,
  resolveProjectConfig
} from './resolve';

// Substitutions
export { applySubstitutions, type SubstitutionOptions } from './substitution';

// Types
export type {
  CommandResolverDef,
  ConfigFormat,
  ConfigMeta,
  CookiesConfig,
  // Metadata
  LoadedConfig,
  // Resolved types
  ResolvedConfig,
  ResolvedCookiesConfig,
  ResolvedDefaults,
  ResolvedProjectConfig,
  SecurityConfig,
  // Input types
  TreqConfig,
  TreqConfigInput,
  TreqDefaults,
  TreqProfileInput
} from './types';
