import { createContext, useContext, type JSX } from 'solid-js';
import type { SDK } from '../sdk';

const SdkContext = createContext<SDK>();

export function SDKProvider(props: { sdk: SDK; children: JSX.Element }) {
  return <SdkContext.Provider value={props.sdk}>{props.children}</SdkContext.Provider>;
}

export function useSDK(): SDK {
  const ctx = useContext(SdkContext);
  if (!ctx) {
    throw new Error('useSDK must be used within SDKProvider');
  }
  return ctx;
}

