import { createContext, type JSX, useContext } from 'solid-js';
import type { TuiStore } from '../store';

const StoreContext = createContext<TuiStore>();

export function StoreProvider(props: { store: TuiStore; children: JSX.Element }) {
  return <StoreContext.Provider value={props.store}>{props.children}</StoreContext.Provider>;
}

export function useStore(): TuiStore {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useStore must be used within StoreProvider');
  }
  return ctx;
}
