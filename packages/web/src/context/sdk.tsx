import type { TreqClient } from '@t-req/sdk/client';
import { createContext, type JSX, useContext } from 'solid-js';

export interface ConnectionState {
  client: TreqClient | null;
}

const ConnectionContext = createContext<ConnectionState>();

export function SDKProvider(props: { connection: ConnectionState; children: JSX.Element }) {
  return (
    <ConnectionContext.Provider value={props.connection}>
      {props.children}
    </ConnectionContext.Provider>
  );
}

export function useConnection(): ConnectionState {
  const ctx = useContext(ConnectionContext);
  if (!ctx) {
    throw new Error('useConnection must be used within SDKProvider');
  }
  return ctx;
}
