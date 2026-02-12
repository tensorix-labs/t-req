import type { ExecutionResult } from '../execution/types';

export type AppTab = 'body' | 'headers' | 'plugins';

export type WebviewBootstrapData = {
  result: ExecutionResult;
  profile?: string;
};
