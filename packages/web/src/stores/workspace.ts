import { createMemo, createSignal } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import {
  createSDK,
  type SDK,
  type SDKConfig,
  type WorkspaceFile,
  type WorkspaceRequest
} from '../sdk';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: TreeNode[];
  depth: number;
  requestCount?: number;
}

export interface FlatNode {
  node: TreeNode;
  isExpanded: boolean;
}

export interface FileContent {
  content: string;
  originalContent: string; // Track what was loaded from server
  lastModified: number;
  isLoading: boolean;
  error?: string;
}

interface DeepState {
  expandedDirs: Record<string, boolean>;
  requestsByPath: Record<string, WorkspaceRequest[]>;
  fileContents: Record<string, FileContent>;
  unsavedChanges: Record<string, boolean>;
}

export interface WorkspaceStoreDeps {
  sdk: () => SDK | null;
  setSdk: (sdk: SDK | null) => void;
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
  expandedDirs: () => Record<string, boolean>;
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
   * @param config - SDK configuration. Can be:
   *   - undefined/empty: Use relative URLs with cookie auth (local proxy mode)
   *   - string: Server URL (legacy, uses that URL with no token)
   *   - SDKConfig: Full config with baseUrl and optional token
   */
  connect: (config?: SDKConfig | string) => Promise<void>;
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

function buildTree(files: WorkspaceFile[]): TreeNode[] {
  const dirMaps = new Map<string, Map<string, TreeNode>>();
  const root = new Map<string, TreeNode>();
  dirMaps.set('', root);

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = i === parts.length - 1;

      let parentMap = dirMaps.get(parentPath);
      if (!parentMap) {
        parentMap = new Map();
        dirMaps.set(parentPath, parentMap);
      }

      let node = parentMap.get(part);

      if (!node) {
        node = {
          name: part,
          path: currentPath,
          isDir: !isLast,
          depth: i,
          children: isLast ? undefined : [],
          requestCount: isLast ? file.requestCount : undefined
        };
        parentMap.set(part, node);

        if (!isLast) {
          dirMaps.set(currentPath, new Map());
        }
      }

      if (!isLast && node.children) {
        const childMap = dirMaps.get(currentPath);
        if (childMap) {
          node.children = Array.from(childMap.values());
        }
      }
    }
  }

  // Final pass: ensure all directory children arrays are populated
  for (const [path, map] of dirMaps) {
    if (path === '') continue;
    const parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
    const name = path.includes('/') ? path.substring(path.lastIndexOf('/') + 1) : path;
    const parentMap = dirMaps.get(parentPath);
    if (parentMap) {
      const node = parentMap.get(name);
      if (node?.isDir) {
        node.children = Array.from(map.values());
      }
    }
  }

  return sortNodes(Array.from(root.values()));
}

function isHttpFile(name: string): boolean {
  return name.endsWith('.http') || name.endsWith('.rest');
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: node.children ? sortNodes(node.children) : undefined
    }))
    .sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      const aIsHttp = isHttpFile(a.name);
      const bIsHttp = isHttpFile(b.name);
      if (aIsHttp && !bIsHttp) return -1;
      if (!aIsHttp && bIsHttp) return 1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
}

function flattenTree(nodes: TreeNode[], expandedDirs: Record<string, boolean>): FlatNode[] {
  const result: FlatNode[] = [];

  function traverse(node: TreeNode) {
    const isExpanded = !!expandedDirs[node.path];
    result.push({ node, isExpanded });

    if (node.isDir && isExpanded && node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  return result;
}

// ============================================================================
// Store Factory
// ============================================================================

export function createWorkspaceStore(deps: WorkspaceStoreDeps): WorkspaceStore {
  const { sdk, setSdk } = deps;

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
  const tree = createMemo(() => buildTree(files()));
  const flattenedVisible = createMemo(() => flattenTree(tree(), deep.expandedDirs));

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

  const connect = async (config?: SDKConfig | string) => {
    setConnectionStatus('connecting');
    setError(undefined);
    setFiles([]);
    setSelectedPath(undefined);
    setDeep('requestsByPath', {});
    setActiveProfile(undefined);
    setAvailableProfiles([]);

    try {
      // Create SDK with provided config
      // - undefined: relative URLs with cookie auth (local proxy mode)
      // - string: legacy URL-only mode
      // - SDKConfig: full config
      const newSdk = createSDK(config);

      // Test connection with health check
      const health = await newSdk.health();
      if (!health.healthy) {
        throw new Error('Server is unhealthy');
      }

      // Fetch workspace files
      const response = await newSdk.listWorkspaceFiles();
      setFiles(response.files);
      setWorkspaceRoot(response.workspaceRoot);
      setSdk(newSdk);
      setConnectionStatus('connected');

      // Fetch available profiles
      try {
        const configResponse = await newSdk.getConfig();
        setAvailableProfiles(configResponse.availableProfiles);
      } catch {
        // Ignore errors - profiles just won't be available
      }

      // Auto-expand first level directories
      const firstLevelDirs = response.files
        .map((f) => f.path.split('/')[0])
        .filter((v, i, a) => a.indexOf(v) === i);
      const expanded: Record<string, boolean> = {};
      for (const dir of firstLevelDirs) {
        expanded[dir] = true;
      }
      setDeep('expandedDirs', expanded);
    } catch (err) {
      setConnectionStatus('error');
      setError(err instanceof Error ? err.message : String(err));
      setSdk(null);
    }
  };

  const disconnect = () => {
    setSdk(null);
    setConnectionStatus('disconnected');
    setFiles([]);
    setWorkspaceRoot('');
    setSelectedPath(undefined);
    setDeep('requestsByPath', {});
    setDeep('expandedDirs', {});
  };

  const loadRequests = async (path: string) => {
    const currentSdk = sdk();
    if (!currentSdk) return;

    // Skip if already loaded
    if (deep.requestsByPath[path]) return;

    setLoadingRequests(true);
    try {
      const response = await currentSdk.listWorkspaceRequests(path);
      setDeep('requestsByPath', path, response.requests);
    } catch (err) {
      console.error('Failed to load requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  };

  const refresh = async () => {
    const currentSdk = sdk();
    if (!currentSdk) return;

    try {
      const response = await currentSdk.listWorkspaceFiles();
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
    const currentSdk = sdk();
    if (!currentSdk) return;

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
        const response = await currentSdk.getFileContent(path);
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
    const currentSdk = sdk();
    if (!currentSdk) return;

    const content = deep.fileContents[path]?.content;
    if (content === undefined) return;

    try {
      await currentSdk.updateFile(path, content);

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
      const response = await currentSdk.listWorkspaceFiles();
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
    const currentSdk = sdk();
    if (!currentSdk) return;

    try {
      await currentSdk.createFile(path);

      // Refresh file list
      await refresh();

      // Open the new file
      await openFile(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const deleteFile = async (path: string) => {
    const currentSdk = sdk();
    if (!currentSdk) return;

    try {
      await currentSdk.deleteFile(path);

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
