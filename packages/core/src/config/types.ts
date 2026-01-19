import type { Resolver } from '../types';

export type TreqDefaults = {
  timeoutMs?: number;
  followRedirects?: boolean;
  validateSSL?: boolean;
  proxy?: string;
  headers?: Record<string, string>;
};

export type TreqConfig = {
  variables?: Record<string, unknown>;
  resolvers?: Record<string, Resolver>;
  defaults?: TreqDefaults;
  cookies?: {
    enabled?: boolean;
    jarPath?: string;
  };
};

export type LoadedConfig = {
  path?: string;
  config: TreqConfig;
};
