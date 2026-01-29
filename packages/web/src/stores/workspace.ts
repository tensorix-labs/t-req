import { createMemo, createSignal } from 'solid-js';
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

export interface WorkspaceStore {
  // Connection state
  connectionStatus: () => ConnectionStatus;
  error: () => string | undefined;
  sdk: () => SDK | null;

  // Workspace data
  workspaceRoot: () => string;
  files: () => WorkspaceFile[];

  activeProfile: () => string | undefined;
  setActiveProfile: (profile: string | undefined) => void;
  availableProfiles: () => string[];

  // Tree state
  tree: () => TreeNode[];
  flattenedVisible: () => FlatNode[];
  expandedDirs: () => Set<string>;
  toggleDir: (path: string) => void;

  // Selection state
  selectedPath: () => string | undefined;
  setSelectedPath: (path: string | undefined) => void;
  selectedNode: () => FlatNode | undefined;

  // Requests (lazy loaded)
  requestsByPath: () => Record<string, WorkspaceRequest[]>;
  selectedRequests: () => WorkspaceRequest[];
  loadingRequests: () => boolean;

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

function flattenTree(nodes: TreeNode[], expandedDirs: Set<string>): FlatNode[] {
  const result: FlatNode[] = [];

  function traverse(node: TreeNode) {
    const isExpanded = expandedDirs.has(node.path);
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

export function createWorkspaceStore(): WorkspaceStore {
  // Connection state
  const [connectionStatus, setConnectionStatus] = createSignal<ConnectionStatus>('disconnected');
  const [error, setError] = createSignal<string | undefined>(undefined);
  const [sdk, setSdk] = createSignal<SDK | null>(null);

  // Workspace data
  const [workspaceRoot, setWorkspaceRoot] = createSignal<string>('');
  const [files, setFiles] = createSignal<WorkspaceFile[]>([]);

  // Profile state
  const [activeProfile, setActiveProfile] = createSignal<string | undefined>(undefined);
  const [availableProfiles, setAvailableProfiles] = createSignal<string[]>([]);

  // Selection and expansion state
  const [selectedPath, setSelectedPath] = createSignal<string | undefined>(undefined);
  const [expandedDirs, setExpandedDirs] = createSignal<Set<string>>(new Set());

  // Requests cache
  const [requestsByPath, setRequestsByPath] = createSignal<Record<string, WorkspaceRequest[]>>({});
  const [loadingRequests, setLoadingRequests] = createSignal(false);

  // Derived: tree structure from files
  const tree = createMemo(() => buildTree(files()));

  // Derived: flattened visible nodes
  const flattenedVisible = createMemo(() => flattenTree(tree(), expandedDirs()));

  // Derived: currently selected node
  const selectedNode = createMemo(() => {
    const path = selectedPath();
    if (!path) return undefined;
    return flattenedVisible().find((f) => f.node.path === path);
  });

  // Derived: requests for selected file
  const selectedRequests = createMemo(() => {
    const path = selectedPath();
    if (!path) return [];
    return requestsByPath()[path] ?? [];
  });

  // Actions
  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const connect = async (config?: SDKConfig | string) => {
    setConnectionStatus('connecting');
    setError(undefined);
    setFiles([]);
    setSelectedPath(undefined);
    setRequestsByPath({});
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
      setExpandedDirs(new Set(firstLevelDirs));
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
    setRequestsByPath({});
    setExpandedDirs(new Set<string>());
  };

  const loadRequests = async (path: string) => {
    const currentSdk = sdk();
    if (!currentSdk) return;

    // Skip if already loaded
    if (requestsByPath()[path]) return;

    setLoadingRequests(true);
    try {
      const response = await currentSdk.listWorkspaceRequests(path);
      setRequestsByPath((prev) => ({
        ...prev,
        [path]: response.requests
      }));
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
      setRequestsByPath({});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return {
    // Connection
    connectionStatus,
    error,
    sdk,

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
    expandedDirs,
    toggleDir,

    // Selection
    selectedPath,
    setSelectedPath,
    selectedNode,

    // Requests
    requestsByPath,
    selectedRequests,
    loadingRequests,

    // Actions
    connect,
    disconnect,
    loadRequests,
    refresh
  };
}
