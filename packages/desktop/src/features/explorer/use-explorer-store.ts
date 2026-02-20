import { unwrap } from '@t-req/sdk/client';
import { createEffect, createMemo, createResource, createSignal, untrack } from 'solid-js';
import { useServer } from '../../context/server-context';
import { toErrorMessage } from '../../lib/errors';
import { runCreateFileMutation, runDeleteFileMutation } from './mutations';
import {
  buildExplorerTree,
  createInitialExpandedDirs,
  flattenExplorerTree,
  hasExplorerPath,
  pruneExpandedDirs
} from './tree';
import type {
  ExplorerExpandedState,
  ExplorerFileEntry,
  ExplorerFlatNode,
  ExplorerNode
} from './types';
import { toExplorerFiles } from './workspace-files';

export interface ExplorerStore {
  workspaceRoot: () => string;
  isLoading: () => boolean;
  error: () => string | undefined;
  tree: () => ExplorerNode[];
  flattenedVisible: () => ExplorerFlatNode[];
  expandedDirs: () => ExplorerExpandedState;
  selectedPath: () => string | undefined;
  isMutating: () => boolean;
  mutationError: () => string | undefined;
  refresh: () => Promise<void>;
  createFile: (path: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  toggleDir: (path: string) => void;
  selectPath: (path: string) => void;
}

export function useExplorerStore(): ExplorerStore {
  const server = useServer();
  const [activeWorkspaceRoot, setActiveWorkspaceRoot] = createSignal<string | undefined>();
  const [expandedDirs, setExpandedDirs] = createSignal<ExplorerExpandedState>({});
  const [selectedPath, setSelectedPath] = createSignal<string | undefined>();
  const [isMutating, setIsMutating] = createSignal(false);
  const [mutationError, setMutationError] = createSignal<string | undefined>();

  const source = createMemo(() => {
    const client = server.client();
    const workspacePath = server.workspacePath();
    if (!client || !workspacePath) {
      return null;
    }

    return {
      client,
      workspacePath
    };
  });

  const [workspaceFiles, { refetch }] = createResource(source, async (context) => {
    const response = await unwrap(context.client.getWorkspaceFiles());
    return {
      workspaceRoot: response.workspaceRoot,
      files: toExplorerFiles(response.files)
    };
  });

  const workspaceRoot = createMemo(() => {
    const currentSource = source();
    if (!currentSource) {
      return '';
    }

    const data = workspaceFiles();
    if (data?.workspaceRoot) {
      return data.workspaceRoot;
    }

    return currentSource.workspacePath;
  });

  const files = createMemo<ExplorerFileEntry[]>(() => {
    if (!source()) {
      return [];
    }
    return workspaceFiles()?.files ?? [];
  });
  const isLoading = createMemo(() => Boolean(source()) && workspaceFiles.loading);
  const error = createMemo(() => {
    if (!source()) {
      return undefined;
    }

    if (!workspaceFiles.error) {
      return undefined;
    }
    return `Failed to load workspace files: ${toErrorMessage(workspaceFiles.error)}`;
  });

  const tree = createMemo(() => buildExplorerTree(files()));
  const flattenedVisible = createMemo<ExplorerFlatNode[]>((previous = []) => {
    const next = flattenExplorerTree(tree(), expandedDirs());
    if (next.length === 0 || previous.length === 0) {
      return next;
    }

    const previousByPath = new Map(previous.map((item) => [item.node.path, item]));
    return next.map((item) => {
      const existing = previousByPath.get(item.node.path);
      if (!existing) {
        return item;
      }

      const previousNode = existing.node;
      const nextNode = item.node;
      const nodeIsEquivalent =
        previousNode.path === nextNode.path &&
        previousNode.name === nextNode.name &&
        previousNode.depth === nextNode.depth &&
        previousNode.isDir === nextNode.isDir &&
        previousNode.requestCount === nextNode.requestCount;

      if (nodeIsEquivalent && existing.isExpanded === item.isExpanded) {
        return existing;
      }

      return item;
    });
  }, []);

  const refresh = async () => {
    if (!source()) {
      return;
    }
    await refetch();
  };

  const createFile = async (path: string) => {
    const currentSource = source();
    if (!currentSource) {
      return;
    }

    setIsMutating(true);
    setMutationError(undefined);
    try {
      await runCreateFileMutation(path, {
        createFile: async (nextPath) => {
          await unwrap(currentSource.client.postWorkspaceFile({ body: { path: nextPath } }));
        },
        refetch: async () => {
          await refetch();
        },
        setSelectedPath
      });
    } catch (error) {
      const message = `Failed to create file: ${toErrorMessage(error)}`;
      setMutationError(message);
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  };

  const deleteFile = async (path: string) => {
    const currentSource = source();
    if (!currentSource) {
      return;
    }

    setIsMutating(true);
    setMutationError(undefined);
    try {
      await runDeleteFileMutation(path, {
        deleteFile: async (nextPath) => {
          await unwrap(currentSource.client.deleteWorkspaceFile({ query: { path: nextPath } }));
        },
        refetch: async () => {
          await refetch();
        },
        selectedPath,
        setSelectedPath,
        flattenedVisible
      });
    } catch (error) {
      const message = `Failed to delete file: ${toErrorMessage(error)}`;
      setMutationError(message);
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  };

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => ({
      ...prev,
      [path]: !prev[path]
    }));
  };

  const selectPath = (path: string) => {
    setSelectedPath(path);
  };

  createEffect(() => {
    if (!source()) {
      setActiveWorkspaceRoot(undefined);
      setExpandedDirs({});
      setSelectedPath(undefined);
      setIsMutating(false);
      setMutationError(undefined);
      return;
    }
  });

  createEffect(() => {
    const data = workspaceFiles();
    if (!data) {
      return;
    }

    const nextTree = tree();
    const previousWorkspaceRoot = untrack(activeWorkspaceRoot);
    const hasWorkspaceChanged = previousWorkspaceRoot !== data.workspaceRoot;

    setActiveWorkspaceRoot(data.workspaceRoot);
    setExpandedDirs((prev) => {
      if (hasWorkspaceChanged || Object.keys(prev).length === 0) {
        return createInitialExpandedDirs(nextTree);
      }
      return pruneExpandedDirs(prev, nextTree);
    });
    setSelectedPath((prev) => {
      if (!prev) {
        return undefined;
      }
      return hasExplorerPath(nextTree, prev) ? prev : undefined;
    });
  });

  return {
    workspaceRoot,
    isLoading,
    error,
    tree,
    flattenedVisible,
    expandedDirs,
    selectedPath,
    isMutating,
    mutationError,
    refresh,
    createFile,
    deleteFile,
    toggleDir,
    selectPath
  };
}
