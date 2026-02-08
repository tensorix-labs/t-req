import { createContext, useContext } from 'solid-js';
import type { SDK } from '../sdk';

const SDKContext = createContext<() => SDK | null>();

export function SDKProvider(props: { sdk: () => SDK | null; children: import('solid-js').JSX.Element }) {
  return <SDKContext.Provider value={props.sdk}>{props.children}</SDKContext.Provider>;
}

export function useSDK(): () => SDK | null {
  const ctx = useContext(SDKContext);
  if (!ctx) {
    throw new Error('useSDK must be used within SDKProvider');
  }
  return ctx;
}
