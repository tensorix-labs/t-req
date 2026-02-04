import { createResource, type Resource } from 'solid-js';
import type { ConfigResponse, PluginsResponse, SDK } from '../sdk';

export interface EnvironmentData {
  config: ConfigResponse | null;
  plugins: PluginsResponse | null;
}

export interface UseEnvironmentDataReturn {
  /** The fetched data resource */
  data: Resource<EnvironmentData | null>;
  /** Refetch both config and plugins */
  refetch: () => void;
  /** Get the resolved config if available */
  resolvedConfig: () => ConfigResponse['resolvedConfig'] | undefined;
  /** Get the plugins response if available */
  pluginsResponse: () => PluginsResponse | undefined;
  /** Whether data is currently loading */
  loading: () => boolean;
  /** Any error that occurred during fetching */
  error: () => Error | undefined;
}

/**
 * Hook to fetch and coordinate environment configuration data
 * Fetches both config and plugins in parallel
 */
export function useEnvironmentData(
  sdk: () => SDK | null,
  profile: () => string | undefined
): UseEnvironmentDataReturn {
  const [data, { refetch }] = createResource(
    () => ({ sdk: sdk(), profile: profile() }),
    async ({ sdk, profile }): Promise<EnvironmentData | null> => {
      if (!sdk) return null;

      const [config, plugins] = await Promise.all([sdk.getConfig(profile), sdk.getPlugins()]);

      return { config, plugins };
    }
  );

  return {
    data,
    refetch,
    resolvedConfig: () => data()?.config?.resolvedConfig,
    pluginsResponse: () => data()?.plugins ?? undefined,
    loading: () => data.loading,
    error: () => data.error as Error | undefined
  };
}
