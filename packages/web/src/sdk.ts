import {
  type ClientOptions,
  createConfig,
  createClient as createGeneratedClient,
  type EventEnvelope as GeneratedEventEnvelope,
  TreqClient
} from '@t-req/sdk/client';

export {
  type ConfigResponse,
  type ExecuteResponse,
  type ExecutionDetail,
  type PluginHookInfo,
  type PluginInfo,
  type PluginReport,
  type PluginsResponse,
  type ResolvedCookies,
  type ResolvedDefaults,
  type RunnerOption,
  SDKError,
  type SecuritySettings,
  type TestFrameworkOption,
  TreqClient,
  unwrap,
  type WorkspaceFile,
  type WorkspaceRequest
} from '@t-req/sdk/client';

// Runtime event payloads include values currently broader than generated enum types.
export type EventEnvelope = Omit<GeneratedEventEnvelope, 'type'> & { type: string };

export interface TreqWebClientConfig {
  /** Base URL for API requests. Empty string uses same-origin relative URLs. */
  baseUrl?: string;
  /** Bearer token for non-cookie auth (e.g., external server mode). */
  token?: string;
}

export function createTreqWebClient(configOrUrl?: TreqWebClientConfig | string): TreqClient {
  const config = normalizeClientConfig(configOrUrl);
  const baseUrl = (config.baseUrl ?? '').replace(/\/+$/, '');
  return createWebClient(baseUrl, config.token);
}

/**
 * Get the default server URL from environment or use same-origin.
 *
 * In browser context without explicit VITE_API_URL:
 * - Returns empty string for relative URLs (same-origin)
 *
 * In non-browser context:
 * - Returns localhost:4096 as fallback
 */
export function getDefaultServerUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (envUrl) {
    return envUrl;
  }
  if (typeof window !== 'undefined') {
    return '';
  }
  return 'http://localhost:4096';
}

function normalizeClientConfig(configOrUrl?: TreqWebClientConfig | string): TreqWebClientConfig {
  if (typeof configOrUrl === 'string') {
    return { baseUrl: configOrUrl };
  }
  return configOrUrl ?? {};
}

function createWebFetch(token?: string): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const requestWithCredentials = new Request(request, { credentials: 'include' });
    const response = await fetch(requestWithCredentials);

    if (response.status === 401 && !token && typeof window !== 'undefined') {
      window.location.href = '/auth/init';
    }

    return response;
  };
}

function createWebClient(baseUrl: string, token?: string): TreqClient {
  const client = createGeneratedClient(
    createConfig<ClientOptions>({
      baseUrl: baseUrl || undefined,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      fetch: createWebFetch(token)
    })
  );

  return new TreqClient({ client });
}
