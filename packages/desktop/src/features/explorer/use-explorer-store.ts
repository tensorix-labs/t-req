import { unwrap } from '@t-req/sdk/client';
import { createEffect, createMemo, createResource, on, untrack } from 'solid-js';
import { createStore } from 'solid-js/store';
import { useServer } from '../../context/server-context';
import { toErrorMessage } from '../../lib/errors';
import {
  runCreateFileMutation,
  runDeleteFileMutation,
  runRenameFileMutation,
  runSaveFileContentMutation
} from './mutations';
import {
  buildExplorerTree,
  createInitialExpandedDirs,
  flattenExplorerTree,
  hasExplorerPath,
  pruneExpandedDirs
} from './tree';
import type {
  ExplorerExpandedState,
  ExplorerFileDocument,
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
  selectedFileContent: () => string | undefined;
  fileDraftContent: () => string | undefined;
  isFileLoading: () => boolean;
  fileLoadError: () => string | undefined;
  isSavingFile: () => boolean;
  fileSaveError: () => string | undefined;
  refresh: () => Promise<void>;
  saveSelectedFile: () => Promise<void>;
  createFile: (path: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  renameFile: (fromPath: string, toPath: string) => Promise<void>;
  setFileDraftContent: (content: string) => void;
  toggleDir: (path: string) => void;
  selectPath: (path: string) => void;
}

type ExplorerUiState = {
  activeWorkspaceRoot: string | undefined;
  expandedDirs: ExplorerExpandedState;
  selectedPath: string | undefined;
  mutation: {
    isPending: boolean;
    error: string | undefined;
  };
  fileEditor: {
    draftPath: string | undefined;
    draftContent: string | undefined;
    saveError: string | undefined;
    isSaving: boolean;
  };
};

export function useExplorerStore(): ExplorerStore {
  const server = useServer();
  const [state, setState] = createStore<ExplorerUiState>({
    activeWorkspaceRoot: undefined,
    expandedDirs: {},
    selectedPath: undefined,
    mutation: {
      isPending: false,
      error: undefined
    },
    fileEditor: {
      draftPath: undefined,
      draftContent: undefined,
      saveError: undefined,
      isSaving: false
    }
  });
  const expandedDirs = () => state.expandedDirs;
  const selectedPath = () => state.selectedPath;
  const setSelectedPath = (path: string | undefined) => {
    setState('selectedPath', path);
  };
  const isMutating = () => state.mutation.isPending;
  const mutationError = () => state.mutation.error;

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

  const selectedFileSource = createMemo(() => {
    const currentSource = source();
    const path = selectedPath();
    if (!currentSource || !path) {
      return null;
    }

    return {
      client: currentSource.client,
      path
    };
  });

  const [selectedFile, { mutate: mutateSelectedFile }] = createResource(
    selectedFileSource,
    async (context) => {
      const response = await unwrap(
        context.client.getWorkspaceFile({ query: { path: context.path } })
      );
      return {
        path: response.path,
        content: response.content,
        lastModified: response.lastModified
      };
    }
  );

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

  const selectedFileContent = createMemo(() => selectedFile()?.content);
  const fileDraftContent = createMemo(() => state.fileEditor.draftContent);
  const isFileLoading = createMemo(() => Boolean(selectedFileSource()) && selectedFile.loading);
  const fileLoadError = createMemo(() => {
    if (!selectedFileSource()) {
      return undefined;
    }
    if (!selectedFile.error) {
      return undefined;
    }
    return `Failed to load file: ${toErrorMessage(selectedFile.error)}`;
  });
  const isSavingFile = createMemo(() => state.fileEditor.isSaving);
  const fileSaveError = createMemo(() => state.fileEditor.saveError);

  const setFileDraftContent = (content: string) => {
    setState('fileEditor', 'draftContent', content);
  };

  const saveSelectedFile = async () => {
    const currentSource = source();
    const path = selectedPath();
    const content = state.fileEditor.draftContent;
    if (!currentSource || !path || content === undefined) {
      return;
    }

    setState('fileEditor', 'isSaving', true);
    setState('fileEditor', 'saveError', undefined);
    try {
      await runSaveFileContentMutation(path, content, {
        saveFile: async (nextPath, nextContent) => {
          const response = (await unwrap(
            currentSource.client.putWorkspaceFile({
              body: {
                path: nextPath,
                content: nextContent
              }
            })
          )) as ExplorerFileDocument;
          return {
            path: response.path,
            content: response.content,
            lastModified: response.lastModified
          };
        },
        setSelectedFile: (file) => {
          mutateSelectedFile(file);
          setState('fileEditor', 'draftPath', file.path);
          setState('fileEditor', 'draftContent', file.content);
          setState('fileEditor', 'saveError', undefined);
        },
        refetchWorkspaceFiles: async () => {
          await refetch();
        }
      });
    } catch (error) {
      const message = `Failed to save file: ${toErrorMessage(error)}`;
      setState('fileEditor', 'saveError', message);
      throw new Error(message);
    } finally {
      setState('fileEditor', 'isSaving', false);
    }
  };

  const createFile = async (path: string) => {
    const currentSource = source();
    if (!currentSource) {
      return;
    }

    setState('mutation', {
      isPending: true,
      error: undefined
    });
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
      setState('mutation', 'error', message);
      throw new Error(message);
    } finally {
      setState('mutation', 'isPending', false);
    }
  };

  const renameFile = async (fromPath: string, toPath: string) => {
    const currentSource = source();
    if (!currentSource || fromPath === toPath) {
      return;
    }

    setState('mutation', {
      isPending: true,
      error: undefined
    });
    try {
      await runRenameFileMutation(fromPath, toPath, {
        readFile: async (path) => {
          const response = (await unwrap(
            currentSource.client.getWorkspaceFile({ query: { path } })
          )) as ExplorerFileDocument;
          return {
            path: response.path,
            content: response.content,
            lastModified: response.lastModified
          };
        },
        createFile: async (path, content) => {
          await unwrap(currentSource.client.postWorkspaceFile({ body: { path, content } }));
        },
        deleteFile: async (path) => {
          await unwrap(currentSource.client.deleteWorkspaceFile({ query: { path } }));
        },
        selectedPath,
        setSelectedPath,
        refetchWorkspaceFiles: async () => {
          await refetch();
        }
      });
    } catch (error) {
      const message = `Failed to rename file: ${toErrorMessage(error)}`;
      setState('mutation', 'error', message);
      throw new Error(message);
    } finally {
      setState('mutation', 'isPending', false);
    }
  };

  const deleteFile = async (path: string) => {
    const currentSource = source();
    if (!currentSource) {
      return;
    }

    setState('mutation', {
      isPending: true,
      error: undefined
    });
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
      setState('mutation', 'error', message);
      throw new Error(message);
    } finally {
      setState('mutation', 'isPending', false);
    }
  };

  const toggleDir = (path: string) => {
    setState('expandedDirs', path, (isExpanded) => !isExpanded);
  };

  const selectPath = (path: string) => {
    setState('selectedPath', path);
  };

  createEffect(
    on(source, (currentSource) => {
      if (currentSource) {
        return;
      }

      setState({
        activeWorkspaceRoot: undefined,
        expandedDirs: {},
        selectedPath: undefined,
        mutation: {
          isPending: false,
          error: undefined
        },
        fileEditor: {
          draftPath: undefined,
          draftContent: undefined,
          saveError: undefined,
          isSaving: false
        }
      });
    })
  );

  createEffect(
    on(selectedFileSource, (currentFileSource) => {
      if (currentFileSource) {
        return;
      }

      mutateSelectedFile(undefined);
      setState('fileEditor', {
        draftPath: undefined,
        draftContent: undefined,
        saveError: undefined
      });
    })
  );

  createEffect(
    on(selectedFile, (data) => {
      if (!data) {
        setState('fileEditor', {
          draftPath: undefined,
          draftContent: undefined,
          saveError: undefined
        });
        return;
      }

      setState('fileEditor', {
        draftPath: data.path,
        draftContent: data.content,
        saveError: undefined
      });
    })
  );

  createEffect(
    on(workspaceFiles, (data) => {
      if (!data) {
        return;
      }

      const nextTree = buildExplorerTree(data.files);
      const previousWorkspaceRoot = untrack(() => state.activeWorkspaceRoot);
      const hasWorkspaceChanged = previousWorkspaceRoot !== data.workspaceRoot;

      setState('activeWorkspaceRoot', data.workspaceRoot);
      setState('expandedDirs', (prev) => {
        if (hasWorkspaceChanged) {
          return createInitialExpandedDirs(nextTree);
        }
        return pruneExpandedDirs(prev, nextTree);
      });
      setState('selectedPath', (prev) => {
        if (!prev) {
          return undefined;
        }
        return hasExplorerPath(nextTree, prev) ? prev : undefined;
      });
    })
  );

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
    selectedFileContent,
    fileDraftContent,
    isFileLoading,
    fileLoadError,
    isSavingFile,
    fileSaveError,
    refresh,
    saveSelectedFile,
    createFile,
    deleteFile,
    renameFile,
    setFileDraftContent,
    toggleDir,
    selectPath
  };
}
