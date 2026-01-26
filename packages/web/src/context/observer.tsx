import { createContext, onCleanup, useContext, type JSX } from 'solid-js';
import type { ObserverStore } from '../stores/observer';

const ObserverContext = createContext<ObserverStore>();

export function ObserverProvider(props: { store: ObserverStore; children: JSX.Element }) {
  // Cleanup SSE connections on page unload (tab close/navigate away)
  const handleUnload = () => props.store.reset();

  window.addEventListener('beforeunload', handleUnload);
  onCleanup(() => {
    window.removeEventListener('beforeunload', handleUnload);
    props.store.reset();
  });

  return <ObserverContext.Provider value={props.store}>{props.children}</ObserverContext.Provider>;
}

export function useObserver(): ObserverStore {
  const ctx = useContext(ObserverContext);
  if (!ctx) {
    throw new Error('useObserver must be used within ObserverProvider');
  }
  return ctx;
}
