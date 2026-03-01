import { unwrap } from '@t-req/sdk/client';
import {
  buildExplorerTree,
  createInitialExpandedDirs,
  type ExplorerExpandedState,
  type ExplorerFlatNode,
  type ExplorerNode,
  flattenExplorerTree
} from '@t-req/ui/explorer';
import { createMemo, createSignal } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import type { ConnectionState } from '../context/sdk';
import { createTreqWebClient, type WorkspaceFile, type WorkspaceRequest } from '../sdk';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type TreeNode = ExplorerNode;
export type FlatNode = ExplorerFlatNode;

export interface FileContent {
  content: string;
  originalContent: string; // Track what was loaded from server
  lastModified: number;
  isLoading: boolean;
  error?: string;
}

interface DeepState {
  expandedDirs: ExplorerExpandedState;
  requestsByPath: Record<string, WorkspaceRequest[]>;
  fileContents: Record<string, FileContent>;
  unsavedChanges: Record<string, boolean>;
}

export interface WorkspaceStoreDeps {
  connection: () => ConnectionState;
  setConnection: (connection: ConnectionState) => void;
}

export interface WorkspaceStore {
  // Connection state
  connectionStatus: () => ConnectionStatus;
  error: () => string | undefined;

  // Workspace data
  workspaceRoot: () => string;
  files: () => WorkspaceFile[];

  activeProfile: () => string | undefined;
  setActiveProfile: (profile: string | undefined) => void;
  availableProfiles: () => string[];

  // Tree state
  tree: () => TreeNode[];
  flattenedVisible: () => FlatNode[];
  expandedDirs: () => ExplorerExpandedState;
  toggleDir: (path: string) => void;

  // Selection state
  selectedPath: () => string | undefined;
  setSelectedPath: (path: string | undefined) => void;
  selectedNode: () => FlatNode | undefined;

  // Requests (lazy loaded)
  requestsByPath: () => Record<string, WorkspaceRequest[]>;
  selectedRequests: () => WorkspaceRequest[];
  loadingRequests: () => boolean;

  // File editor state
  openFiles: () => string[];
  activeFile: () => string | undefined;
  fileContents: () => Record<string, FileContent>;
  unsavedChanges: () => Record<string, boolean>;

  // Actions
  /**
   * Connect to a t-req server.
   *
   * @param config - Web client configuration. Can be:
   *   - undefined/empty: Use relative URLs with cookie auth (local proxy mode)
   *   - string: Server URL (legacy, uses that URL with no token)
   *   - object: Full config with baseUrl and optional token
   */
  connect: (config?: Parameters<typeof createTreqWebClient>[0]) => Promise<void>;
  disconnect: () => void;
  loadRequests: (path: string) => Promise<void>;
  refresh: () => Promise<void>;

  // File editor actions
  openFile: (path: string) => Promise<void>;
  closeFile: (path: string) => void;
  setActiveFile: (path: string | undefined) => void;
  updateFileContent: (path: string, content: string) => void;
  saveFile: (path: string) => Promise<void>;
  createFile: (path: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  hasUnsavedChanges: (path: string) => boolean;
}

// ============================================================================
// Store Factory
// ============================================================================

export function createWorkspaceStore(deps: WorkspaceStoreDeps): WorkspaceStore {
  const { connection, setConnection } = deps;

  // ── Signals: simple flat state ──────────────────────────────────────────
  const [connectionStatus, setConnectionStatus] = createSignal<ConnectionStatus>('disconnected');
  const [error, setError] = createSignal<string | undefined>(undefined);
  const [workspaceRoot, setWorkspaceRoot] = createSignal<string>('');
  const [files, setFiles] = createSignal<WorkspaceFile[]>([]);
  const [activeProfile, setActiveProfile] = createSignal<string | undefined>(undefined);
  const [availableProfiles, setAvailableProfiles] = createSignal<string[]>([]);
  const [selectedPath, setSelectedPath] = createSignal<string | undefined>(undefined);
  const [loadingRequests, setLoadingRequests] = createSignal(false);
  const [openFiles, setOpenFiles] = createSignal<string[]>([]);
  const [activeFile, setActiveFile] = createSignal<string | undefined>(undefined);

  // ── Store: deeply nested state with fine-grained updates ────────────────
  const [deep, setDeep] = createStore<DeepState>({
    expandedDirs: {},
    requestsByPath: {},
    fileContents: {},
    unsavedChanges: {}
  });

  // ── Derived ─────────────────────────────────────────────────────────────
  const tree = createMemo(() => buildExplorerTree(files()));
  const flattenedVisible = createMemo(() => flattenExplorerTree(tree(), deep.expandedDirs));

  const selectedNode = createMemo(() => {
    const path = selectedPath();
    if (!path) return undefined;
    return flattenedVisible().find((f) => f.node.path === path);
  });

  const selectedRequests = createMemo(() => {
    const path = selectedPath();
    if (!path) return [];
    return deep.requestsByPath[path] ?? [];
  });

  // ── Actions ─────────────────────────────────────────────────────────────
  const toggleDir = (path: string) => {
    setDeep('expandedDirs', path, (v) => !v);
  };

  const connect = async (config?: Parameters<typeof createTreqWebClient>[0]) => {
    setConnectionStatus('connecting');
    setError(undefined);
    setConnection({ client: null });
    setFiles([]);
    setSelectedPath(undefined);
    setDeep('requestsByPath', {});
    setActiveProfile(undefined);
    setAvailableProfiles([]);

    try {
      const newClient = createTreqWebClient(config);

      // Test connection with health check
      const health = await unwrap(newClient.getHealth());
      if (!health.healthy) {
        throw new Error('Server is unhealthy');
      }

      // Fetch workspace files
      const response = await unwrap(newClient.getWorkspaceFiles());
      setFiles(response.files);
      setWorkspaceRoot(response.workspaceRoot);
      setConnection({ client: newClient });
      setConnectionStatus('connected');

      // Fetch available profiles
      try {
        const configResponse = await unwrap(newClient.getConfig());
        setAvailableProfiles(configResponse.availableProfiles);
      } catch {
        // Ignore errors - profiles just won't be available
      }

      // Auto-expand first level directories
      setDeep('expandedDirs', createInitialExpandedDirs(buildExplorerTree(response.files)));
    } catch (err) {
      setConnectionStatus('error');
      setError(err instanceof Error ? err.message : String(err));
      setConnection({ client: null });
    }
  };

  const disconnect = () => {
    setConnection({ client: null });
    setConnectionStatus('disconnected');
    setFiles([]);
    setWorkspaceRoot('');
    setSelectedPath(undefined);
    setDeep('requestsByPath', {});
    setDeep('expandedDirs', {});
  };

  const loadRequests = async (path: string) => {
    const currentClient = connection().client;
    if (!currentClient) return;

    // Skip if already loaded
    if (deep.requestsByPath[path]) return;

    setLoadingRequests(true);
    try {
      const response = await unwrap(currentClient.getWorkspaceRequests({ query: { path } }));
      setDeep('requestsByPath', path, response.requests);
    } catch (err) {
      console.error('Failed to load requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  };

  const refresh = async () => {
    const currentClient = connection().client;
    if (!currentClient) return;

    try {
      const response = await unwrap(currentClient.getWorkspaceFiles());
      setFiles(response.files);
      setWorkspaceRoot(response.workspaceRoot);
      // Clear requests cache to force reload
      setDeep('requestsByPath', {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // ── File editor actions ─────────────────────────────────────────────────
  const openFile = async (path: string) => {
    const currentClient = connection().client;
    if (!currentClient) return;

    // Add to open files if not already open
    setOpenFiles((prev) => {
      if (prev.includes(path)) return prev;
      return [...prev, path];
    });

    // Set as active file
    setActiveFile(path);

    // Load content if not already loaded
    if (!deep.fileContents[path]) {
      setDeep('fileContents', path, {
        content: '',
        originalContent: '',
        lastModified: 0,
        isLoading: true
      });

      try {
        const response = await unwrap(currentClient.getWorkspaceFile({ query: { path } }));
        setDeep('fileContents', path, {
          content: response.content,
          originalContent: response.content,
          lastModified: response.lastModified,
          isLoading: false
        });
      } catch (err) {
        setDeep('fileContents', path, {
          content: '',
          originalContent: '',
          lastModified: 0,
          isLoading: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  };

  const closeFile = (path: string) => {
    setOpenFiles((prev) => prev.filter((p) => p !== path));

    // If closing the active file, switch to another open file
    if (activeFile() === path) {
      const remaining = openFiles().filter((p) => p !== path);
      setActiveFile(remaining.length > 0 ? remaining[remaining.length - 1] : undefined);
    }

    // Clean up file contents and unsaved changes (fixes memory leak)
    setDeep(
      'fileContents',
      produce((contents) => {
        delete contents[path];
      })
    );
    setDeep(
      'unsavedChanges',
      produce((changes) => {
        delete changes[path];
      })
    );
  };

  const updateFileContent = (path: string, content: string) => {
    const original = deep.fileContents[path]?.originalContent;

    setDeep('fileContents', path, 'content', content);

    // Only mark dirty if content differs from original
    if (content !== original) {
      setDeep('unsavedChanges', path, true);
    } else {
      setDeep(
        'unsavedChanges',
        produce((changes) => {
          delete changes[path];
        })
      );
    }
  };

  const saveFile = async (path: string) => {
    const currentClient = connection().client;
    if (!currentClient) return;

    const content = deep.fileContents[path]?.content;
    if (content === undefined) return;

    try {
      await unwrap(currentClient.putWorkspaceFile({ body: { path, content } }));

      // Mark as saved
      setDeep(
        'unsavedChanges',
        produce((changes) => {
          delete changes[path];
        })
      );

      // Update lastModified and originalContent (content is now saved)
      setDeep('fileContents', path, {
        originalContent: deep.fileContents[path].content,
        lastModified: Date.now()
      });

      // Refresh file list to update request counts (but don't clear all requests)
      const response = await unwrap(currentClient.getWorkspaceFiles());
      setFiles(response.files);
      setWorkspaceRoot(response.workspaceRoot);

      // Only clear this file's cached requests (they may have changed)
      setDeep(
        'requestsByPath',
        produce((reqs) => {
          delete reqs[path];
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const createFile = async (path: string) => {
    const currentClient = connection().client;
    if (!currentClient) return;

    try {
      await unwrap(currentClient.postWorkspaceFile({ body: { path } }));

      // Refresh file list
      await refresh();

      // Open the new file
      await openFile(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const deleteFile = async (path: string) => {
    const currentClient = connection().client;
    if (!currentClient) return;

    try {
      await unwrap(currentClient.deleteWorkspaceFile({ query: { path } }));

      // Close if open
      if (openFiles().includes(path)) {
        closeFile(path);
      }

      // Refresh file list
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const hasUnsavedChanges = (path: string) => {
    return !!deep.unsavedChanges[path];
  };

  return {
    // Connection
    connectionStatus,
    error,

    // Workspace
    workspaceRoot,
    files,

    // Profile
    activeProfile,
    setActiveProfile,
    availableProfiles,

    // Tree
    tree,
    flattenedVisible,
    expandedDirs: () => deep.expandedDirs,
    toggleDir,

    // Selection
    selectedPath,
    setSelectedPath,
    selectedNode,

    // Requests
    requestsByPath: () => deep.requestsByPath,
    selectedRequests,
    loadingRequests,

    // File editor state
    openFiles,
    activeFile,
    fileContents: () => deep.fileContents,
    unsavedChanges: () => deep.unsavedChanges,

    // Actions
    connect,
    disconnect,
    loadRequests,
    refresh,

    // File editor actions
    openFile,
    closeFile,
    setActiveFile,
    updateFileContent,
    saveFile,
    createFile,
    deleteFile,
    hasUnsavedChanges
  };
}
