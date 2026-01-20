import type { Resolver } from '../types';

// ============================================================================
// Defaults
// ============================================================================

export type TreqDefaults = {
  timeoutMs?: number;
  followRedirects?: boolean;
  validateSSL?: boolean;
  proxy?: string;
  headers?: Record<string, string>;
};

export type ResolvedDefaults = {
  timeoutMs: number;
  followRedirects: boolean;
  validateSSL: boolean;
  proxy?: string;
  headers: Record<string, string>;
};

// ============================================================================
// Cookies
// ============================================================================

export type CookiesConfig = {
  enabled?: boolean;
  jarPath?: string;
};

export type ResolvedCookiesConfig = {
  enabled: boolean;
  jarPath?: string;
  mode: 'disabled' | 'memory' | 'persistent';
};

// ============================================================================
// Security
// ============================================================================

export type SecurityConfig = {
  allowExternalFiles?: boolean;
};

// ============================================================================
// Command Resolver Definition (JSON-serializable)
// ============================================================================

export type CommandResolverDef = {
  type: 'command';
  command: string[];
  timeoutMs?: number;
};

// ============================================================================
// Profile Input Types (what gets parsed from JSON/TS)
// ============================================================================

export type TreqProfileInput = {
  variables?: Record<string, unknown>;
  defaults?: TreqDefaults;
  cookies?: CookiesConfig;
  resolvers?: Record<string, Resolver | CommandResolverDef>;
};

// ============================================================================
// Config Input Types (what gets parsed from JSON/TS)
// ============================================================================

export type TreqConfigInput = {
  variables?: Record<string, unknown>;
  defaults?: TreqDefaults;
  cookies?: CookiesConfig;
  resolvers?: Record<string, Resolver | CommandResolverDef>;
  profiles?: Record<string, TreqProfileInput>;
  security?: SecurityConfig;
};

// ============================================================================
// Resolved Config (output of resolveProjectConfig())
// Engine-ready, all transformations complete
// ============================================================================

export type ResolvedConfig = {
  projectRoot: string;
  variables: Record<string, unknown>;
  defaults: ResolvedDefaults;
  cookies: ResolvedCookiesConfig;
  resolvers: Record<string, Resolver>;
  security: {
    allowExternalFiles: boolean;
  };
};

// ============================================================================
// Config Metadata
// ============================================================================

export type ConfigFormat = 'jsonc' | 'json' | 'ts' | 'js' | 'mjs';

export type ConfigMeta = {
  configPath?: string;
  projectRoot: string;
  format?: ConfigFormat;
  profile?: string;
  layersApplied: string[];
  warnings: string[];
};

// ============================================================================
// Loaded Config (from loadConfig)
// ============================================================================

export type LoadedConfig = {
  path?: string;
  config: TreqConfigInput;
  format?: ConfigFormat;
};

// ============================================================================
// Resolved Project Config (full result)
// ============================================================================

export type ResolvedProjectConfig = {
  config: ResolvedConfig;
  meta: ConfigMeta;
};

// ============================================================================
// Legacy alias for backward compatibility
// ============================================================================

export type TreqConfig = TreqConfigInput;
