/**
 * useWorkspace Hook
 *
 * Encapsulates workspace file navigation and request loading logic.
 * Provides a clean interface for file tree operations without exposing store internals.
 */

import type { WorkspaceRequest } from '@t-req/sdk/client';
import { onMount } from 'solid-js';
import { unwrap, useSDK, useStore } from '../context';

export interface WorkspaceReturn {
  /** Navigate to a file in the tree, expanding parents if needed */
  navigateToFile: (filePath: string) => void;
  /** Load requests for a file path, returns cached if available */
  loadRequests: (filePath: string) => Promise<WorkspaceRequest[] | undefined>;
  /** Get the workspace root path */
  workspaceRoot: () => string;
}

export function useWorkspace(): WorkspaceReturn {
  const store = useStore();
  const sdk = useSDK();

  onMount(async () => {
    try {
      const config = await unwrap(sdk.getConfig());
      store.setAvailableProfiles(config.availableProfiles);
    } catch {
      // Ignore errors - profiles just won't be available
    }
  });

  /**
   * Navigate to a file in the tree view.
   * If the file is in a collapsed directory, expands parent directories first.
   */
  function navigateToFile(filePath: string) {
    const flat = store.flattenedVisible();
    let index = flat.findIndex((n) => n.node.path === filePath);

    if (index === -1) {
      // File might be in a collapsed directory - expand parent directories
      expandParents(filePath);
      const newFlat = store.flattenedVisible();
      index = newFlat.findIndex((n) => n.node.path === filePath);
    }

    if (index >= 0) {
      store.setSelectedIndex(index);
    }
  }

  /**
   * Expand all parent directories of a file path.
   */
  function expandParents(filePath: string) {
    const parts = filePath.split('/');
    let currentPath = '';

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!part) continue;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      store.expandDir(currentPath);
    }
  }

  /**
   * Load requests for a file path.
   * Returns cached requests if available, otherwise fetches from SDK.
   */
  async function loadRequests(filePath: string) {
    // Check cache first
    const requests = store.requestsByPath()[filePath];
    if (requests) {
      return requests;
    }

    // Fetch from SDK
    try {
      const response = await unwrap(sdk.getWorkspaceRequests({ query: { path: filePath } }));
      store.setRequestsForPath(filePath, response.requests);
      return response.requests;
    } catch (_e) {
      return undefined;
    }
  }

  return {
    navigateToFile,
    loadRequests,
    workspaceRoot: store.workspaceRoot
  };
}
