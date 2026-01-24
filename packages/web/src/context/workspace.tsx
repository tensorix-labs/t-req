import { createContext, useContext, type JSX } from 'solid-js';
import type { WorkspaceStore } from '../stores/workspace';

const WorkspaceContext = createContext<WorkspaceStore>();

export function WorkspaceProvider(props: { store: WorkspaceStore; children: JSX.Element }) {
  return <WorkspaceContext.Provider value={props.store}>{props.children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceStore {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return ctx;
}
