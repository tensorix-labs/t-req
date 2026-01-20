import type { TreqConfigInput, TreqDefaults, TreqProfileInput } from './types';

export type MergeConfigInputs = {
  defaults?: TreqConfigInput;
  file?: TreqConfigInput;
  overrides?: TreqConfigInput;
};

/**
 * Deep merge two defaults objects, with proper header merging.
 */
function mergeDefaults(
  base: TreqDefaults | undefined,
  overlay: TreqDefaults | undefined
): TreqDefaults | undefined {
  if (!base && !overlay) return undefined;
  if (!base) return overlay;
  if (!overlay) return base;

  return {
    ...base,
    ...overlay,
    headers: {
      ...(base.headers ?? {}),
      ...(overlay.headers ?? {})
    }
  };
}

/**
 * Merge two config inputs with deep merge for defaults.
 */
function mergeTwo(base: TreqConfigInput, overlay: TreqConfigInput): TreqConfigInput {
  const result: TreqConfigInput = {};

  // Merge variables
  const mergedVariables = {
    ...(base.variables ?? {}),
    ...(overlay.variables ?? {})
  };
  if (Object.keys(mergedVariables).length > 0) {
    result.variables = mergedVariables;
  }

  // Merge resolvers
  const mergedResolvers = {
    ...(base.resolvers ?? {}),
    ...(overlay.resolvers ?? {})
  };
  if (Object.keys(mergedResolvers).length > 0) {
    result.resolvers = mergedResolvers;
  }

  // Merge defaults
  const mergedDefaults = mergeDefaults(base.defaults, overlay.defaults);
  if (mergedDefaults) {
    result.defaults = mergedDefaults;
  }

  // Merge cookies
  const mergedCookies = {
    ...(base.cookies ?? {}),
    ...(overlay.cookies ?? {})
  };
  if (Object.keys(mergedCookies).length > 0) {
    result.cookies = mergedCookies;
  }

  // Merge security
  const mergedSecurity = {
    ...(base.security ?? {}),
    ...(overlay.security ?? {})
  };
  if (Object.keys(mergedSecurity).length > 0) {
    result.security = mergedSecurity;
  }

  // Profiles are NOT merged - they come from the base config only
  if (base.profiles) {
    result.profiles = base.profiles;
  }

  return result;
}

/**
 * Merge multiple config sources with "last wins" semantics.
 *
 * Order: defaults < file < overrides
 */
export function mergeConfig(inputs: MergeConfigInputs): TreqConfigInput {
  let result: TreqConfigInput = {};

  if (inputs.defaults) {
    result = mergeTwo(result, inputs.defaults);
  }

  if (inputs.file) {
    result = mergeTwo(result, inputs.file);
  }

  if (inputs.overrides) {
    result = mergeTwo(result, inputs.overrides);
  }

  return result;
}

/**
 * Apply a profile to a config input.
 *
 * IMPORTANT: This operates on INPUT config, NOT ResolvedConfig.
 * Returns a new TreqConfigInput with the profile's overrides applied.
 *
 * @param input - The config input to apply the profile to
 * @param profileName - The name of the profile to apply
 * @returns The config with profile applied
 * @throws Error if the profile doesn't exist
 */
export function applyProfile(input: TreqConfigInput, profileName?: string): TreqConfigInput {
  if (!profileName) {
    return input;
  }

  const profiles = input.profiles ?? {};
  const profile = profiles[profileName];

  if (!profile) {
    const available = Object.keys(profiles);
    const hint = available.length > 0 ? ` Available profiles: ${available.join(', ')}` : '';
    throw new Error(`Profile "${profileName}" not found.${hint}`);
  }

  // Create base config without profiles (profiles are not inherited)
  const base: TreqConfigInput = {};

  if (input.variables) base.variables = input.variables;
  if (input.defaults) base.defaults = input.defaults;
  if (input.cookies) base.cookies = input.cookies;
  if (input.resolvers) base.resolvers = input.resolvers;
  if (input.security) base.security = input.security;
  // Explicitly NOT including profiles

  // Merge profile on top
  return mergeTwo(base, profile);
}

/**
 * Get sorted list of profile names from a config.
 */
export function listProfiles(config: TreqConfigInput): string[] {
  const profiles = config.profiles ?? {};
  return Object.keys(profiles).sort();
}

/**
 * Merge profile input with deep merge for defaults.
 * Used internally for combining profile with base config.
 */
export function mergeProfileInput(
  base: TreqProfileInput,
  overlay: TreqProfileInput
): TreqProfileInput {
  const result: TreqProfileInput = {};

  // Merge variables
  const mergedVariables = {
    ...(base.variables ?? {}),
    ...(overlay.variables ?? {})
  };
  if (Object.keys(mergedVariables).length > 0) {
    result.variables = mergedVariables;
  }

  // Merge resolvers
  const mergedResolvers = {
    ...(base.resolvers ?? {}),
    ...(overlay.resolvers ?? {})
  };
  if (Object.keys(mergedResolvers).length > 0) {
    result.resolvers = mergedResolvers;
  }

  // Merge defaults
  const mergedDefaults = mergeDefaults(base.defaults, overlay.defaults);
  if (mergedDefaults) {
    result.defaults = mergedDefaults;
  }

  // Merge cookies
  const mergedCookies = {
    ...(base.cookies ?? {}),
    ...(overlay.cookies ?? {})
  };
  if (Object.keys(mergedCookies).length > 0) {
    result.cookies = mergedCookies;
  }

  return result;
}
