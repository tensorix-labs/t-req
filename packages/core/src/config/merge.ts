import type { TreqConfig } from './types';

export type MergeConfigInputs = {
  defaults?: TreqConfig;
  file?: TreqConfig;
  overrides?: TreqConfig;
};

export function mergeConfig(inputs: MergeConfigInputs): TreqConfig {
  const base = inputs.defaults ?? {};
  const file = inputs.file ?? {};
  const overrides = inputs.overrides ?? {};

  return {
    variables: {
      ...(base.variables ?? {}),
      ...(file.variables ?? {}),
      ...(overrides.variables ?? {})
    },
    resolvers: {
      ...(base.resolvers ?? {}),
      ...(file.resolvers ?? {}),
      ...(overrides.resolvers ?? {})
    },
    defaults: {
      ...(base.defaults ?? {}),
      ...(file.defaults ?? {}),
      ...(overrides.defaults ?? {}),
      headers: {
        ...(base.defaults?.headers ?? {}),
        ...(file.defaults?.headers ?? {}),
        ...(overrides.defaults?.headers ?? {})
      }
    },
    cookies: {
      ...(base.cookies ?? {}),
      ...(file.cookies ?? {}),
      ...(overrides.cookies ?? {})
    }
  };
}
