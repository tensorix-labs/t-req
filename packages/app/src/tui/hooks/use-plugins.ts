import type { GetPluginsResponses } from '@t-req/sdk/client';
import { type Accessor, createEffect, createSignal } from 'solid-js';
import { unwrap, useSDK } from '../context';

type LoadedPlugin = GetPluginsResponses[200]['plugins'][number];

export interface PluginsReturn {
  plugins: Accessor<LoadedPlugin[] | undefined>;
  isLoading: Accessor<boolean>;
}

export function usePlugins(): PluginsReturn {
  const sdk = useSDK();
  const [plugins, setPlugins] = createSignal<LoadedPlugin[] | undefined>(undefined);
  const [loading, setLoading] = createSignal(false);

  createEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const result = await unwrap(sdk.getPlugins());
        setPlugins(result.plugins);
      } catch (err) {
        console.error('Failed to load plugins:', err);
        setPlugins(undefined);
      } finally {
        setLoading(false);
      }
    })();
  });

  return {
    plugins,
    isLoading: loading
  };
}
