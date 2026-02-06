import { createContext, useContext, type JSX } from 'solid-js';
import type { TreqClient } from '@t-req/sdk/client';

const SdkContext = createContext<TreqClient>();

export function SDKProvider(props: { sdk: TreqClient; children: JSX.Element }) {
  return <SdkContext.Provider value={props.sdk}>{props.children}</SdkContext.Provider>;
}

export function useSDK(): TreqClient {
  const ctx = useContext(SdkContext);
  if (!ctx) {
    throw new Error('useSDK must be used within SDKProvider');
  }
  return ctx;
}

/** Unwrap a TreqClient response, throwing on error. */
export async function unwrap<T>(
  result: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await result;
  if (error !== undefined) {
    const err = error as { error?: { message?: string; code?: string } };
    const msg = err?.error?.message ?? `HTTP ${response.status}`;
    throw new Error(msg);
  }
  return data as T;
}
