import { createEffect, createMemo, createSignal, on } from 'solid-js';
import type { WorkspaceFile, WorkspaceRequest } from './sdk';

// ============================================================================
// Types
// ============================================================================

export type ConnectionStatus = 'connecting' | 'connected' | 'error';

export type FileType = 'http' | 'script' | 'other';

export interface TreeNode {
  name: string;
  path: string; // Cumulative path for stable keys
  isDir: boolean;
  children?: TreeNode[];
  depth: number;
  requestCount?: number; // For files, show badge
  fileType?: FileType; // File type for non-directories
}

// Script file extensions
const SCRIPT_EXTENSIONS = new Set(['.ts', '.js', '.mts', '.mjs']);
const HTTP_EXTENSIONS = new Set(['.http']);

/**
 * Determine the file type from a file path.
 */
export function getFileType(path: string): FileType {
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
  if (HTTP_EXTENSIONS.has(ext)) return 'http';
  if (SCRIPT_EXTENSIONS.has(ext)) return 'script';
  return 'other';
}

/**
 * Check if a file path is a runnable script.
 */
export function isRunnableScript(path: string): boolean {
  return getFileType(path) === 'script';
}

/**
 * Check if a file path is an HTTP file.
 */
export function isHttpFile(path: string): boolean {
  return getFileType(path) === 'http';
}

export interface FlatNode {
  node: TreeNode;
  isExpanded: boolean; // For directories
}

export interface TuiStore {
  // Connection state
  connectionStatus: () => ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;
  error: () => string | undefined;
  setError: (error: string | undefined) => void;

  // Workspace data
  workspaceRoot: () => string;
  setWorkspaceRoot: (root: string) => void;
  files: () => WorkspaceFile[];
  setFiles: (files: WorkspaceFile[]) => void;

  // Tree state (derived + interactive)
  tree: () => TreeNode[];
  flattenedVisible: () => FlatNode[];
  expandedDirs: () => Set<string>;
  toggleDir: (path: string) => void;
  expandDir: (path: string) => void;
  collapseDir: (path: string) => void;

  // Selection state
  selectedIndex: () => number;
  setSelectedIndex: (index: number) => void;
  selectedNode: () => FlatNode | undefined;
  selectNext: () => void;
  selectPrevious: () => void;

  // Requests (lazy loaded)
  requestsByPath: () => Record<string, WorkspaceRequest[]>;
  setRequestsForPath: (path: string, requests: WorkspaceRequest[]) => void;
  selectedFileRequests: () => WorkspaceRequest[];
}

// ============================================================================
// Tree Building
// ============================================================================

/**
 * Build tree structure from flat file list.
 * Splits paths on '/' and creates nested directory structure.
 */
function buildTree(files: WorkspaceFile[]): TreeNode[] {
  // Use a map to track directory nodes by path for efficient lookup
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

      // Get the parent's children map
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
          requestCount: isLast ? file.requestCount : undefined,
          fileType: isLast ? getFileType(currentPath) : undefined
        };
        parentMap.set(part, node);

        // If this is a directory, create its children map
        if (!isLast) {
          dirMaps.set(currentPath, new Map());
        }
      }

      // Link children arrays to their maps
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

  // Convert root map to sorted array
  return sortNodes(Array.from(root.values()));
}

/**
 * Recursively convert children maps back to arrays and sort.
 */
function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: node.children ? sortNodes(node.children) : undefined
    }))
    .sort((a, b) => {
      // Directories first, then alphabetically (case-insensitive)
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
}

/**
 * Flatten tree for rendering, respecting expanded state.
 */
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

export function createStore(): TuiStore {
  // Connection state
  const [connectionStatus, setConnectionStatus] = createSignal<ConnectionStatus>('connecting');
  const [error, setError] = createSignal<string | undefined>(undefined);

  // Workspace data
  const [workspaceRoot, setWorkspaceRoot] = createSignal<string>('');
  const [files, setFiles] = createSignal<WorkspaceFile[]>([]);

  // Selection and expansion state
  const [selectedIndex, setSelectedIndex] = createSignal<number>(0);
  const [expandedDirs, setExpandedDirs] = createSignal<Set<string>>(new Set());

  // Requests cache
  const [requestsByPath, setRequestsByPath] = createSignal<Record<string, WorkspaceRequest[]>>({});

  // Derived: tree structure from files
  const tree = createMemo(() => buildTree(files()));

  // Derived: flattened visible nodes
  const flattenedVisible = createMemo(() => flattenTree(tree(), expandedDirs()));

  // Derived: currently selected node
  const selectedNode = createMemo(() => {
    const flat = flattenedVisible();
    const idx = selectedIndex();
    return idx >= 0 && idx < flat.length ? flat[idx] : undefined;
  });

  // Derived: requests for selected file
  const selectedFileRequests = createMemo(() => {
    const node = selectedNode();
    if (!node || node.node.isDir) return [];
    return requestsByPath()[node.node.path] ?? [];
  });

  // Effect: clamp selection index when list shrinks (e.g., after collapsing dirs)
  // Uses on() to only track length changes, not selection changes, avoiding double-updates
  createEffect(
    on(
      () => flattenedVisible().length,
      (len) => {
        const idx = selectedIndex(); // Read without tracking
        if (len > 0 && idx >= len) {
          setSelectedIndex(len - 1);
        } else if (len === 0 && idx !== 0) {
          setSelectedIndex(0);
        }
      }
    )
  );

  // Actions
  const toggleDir = (path: string) => {
    setExpandedDirs((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const expandDir = (path: string) => {
    setExpandedDirs((prev: Set<string>) => {
      if (prev.has(path)) return prev;
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  };

  const collapseDir = (path: string) => {
    setExpandedDirs((prev: Set<string>) => {
      if (!prev.has(path)) return prev;
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  };

  const selectNext = () => {
    const flat = flattenedVisible();
    setSelectedIndex((idx: number) => Math.min(idx + 1, flat.length - 1));
  };

  const selectPrevious = () => {
    setSelectedIndex((idx: number) => Math.max(idx - 1, 0));
  };

  const setRequestsForPath = (path: string, requests: WorkspaceRequest[]) => {
    setRequestsByPath((prev: Record<string, WorkspaceRequest[]>) => ({
      ...prev,
      [path]: requests
    }));
  };

  return {
    // Connection
    connectionStatus,
    setConnectionStatus,
    error,
    setError,

    // Workspace
    workspaceRoot,
    setWorkspaceRoot,
    files,
    setFiles,

    // Tree
    tree,
    flattenedVisible,
    expandedDirs,
    toggleDir,
    expandDir,
    collapseDir,

    // Selection
    selectedIndex,
    setSelectedIndex,
    selectedNode,
    selectNext,
    selectPrevious,

    // Requests
    requestsByPath,
    setRequestsForPath,
    selectedFileRequests
  };
}
