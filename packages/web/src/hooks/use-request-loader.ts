import { createEffect } from 'solid-js';
import { useWorkspace } from '../context';

export function useRequestLoader() {
  const store = useWorkspace();

  createEffect(() => {
    const path = store.selectedPath();
    const node = store.selectedNode();
    if (path && node && !node.node.isDir) {
      store.loadRequests(path);
    }
  });
}
