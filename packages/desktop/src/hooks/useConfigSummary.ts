import type { ConfigResponse, TreqClient } from '@t-req/sdk/client';
import { unwrap } from '@t-req/sdk/client';
import type { Accessor } from 'solid-js';
import { createMemo, createResource } from 'solid-js';

export type ConfigSummaryQuery = {
  enabled: boolean;
  client: TreqClient | null;
  profile: string | undefined;
};

export function useConfigSummary(query: Accessor<ConfigSummaryQuery>) {
  const [config, { refetch }] = createResource(
    query,
    async (current): Promise<ConfigResponse | null> => {
      if (!current.enabled || !current.client) {
        return null;
      }

      return unwrap(current.client.getConfig({ query: { profile: current.profile } }));
    }
  );

  const loading = createMemo(() => config.loading);
  const error = createMemo(() => config.error as Error | undefined);

  return {
    config,
    loading,
    error,
    refetch
  };
}
