import { createContext, type JSX, useContext } from 'solid-js';
import type { ObserverStore } from '../observer-store';

const ObserverContext = createContext<ObserverStore>();

export function ObserverProvider(props: { store: ObserverStore; children: JSX.Element }) {
  return <ObserverContext.Provider value={props.store}>{props.children}</ObserverContext.Provider>;
}

export function useObserver(): ObserverStore {
  const ctx = useContext(ObserverContext);
  if (!ctx) {
    throw new Error('useObserver must be used within ObserverProvider');
  }
  return ctx;
}
