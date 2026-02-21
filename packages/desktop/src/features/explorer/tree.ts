import type {
  ExplorerExpandedState,
  ExplorerFileEntry,
  ExplorerFlatNode,
  ExplorerNode
} from './types';
import { normalizeRelativePath } from './utils/path';

type MutableNode = ExplorerNode & {
  childMap?: Map<string, MutableNode>;
};

function compareNodes(a: ExplorerNode, b: ExplorerNode): number {
  if (a.isDir && !b.isDir) return -1;
  if (!a.isDir && b.isDir) return 1;
  return a.name.localeCompare(b.name, undefined, {
    sensitivity: 'base',
    numeric: true
  });
}

function toExplorerNodes(map: Map<string, MutableNode>): ExplorerNode[] {
  return Array.from(map.values())
    .map((node): ExplorerNode => {
      const children = node.childMap ? toExplorerNodes(node.childMap) : undefined;
      return {
        name: node.name,
        path: node.path,
        isDir: node.isDir,
        depth: node.depth,
        children,
        requestCount: node.requestCount
      };
    })
    .sort(compareNodes);
}

export function buildExplorerTree(files: ExplorerFileEntry[]): ExplorerNode[] {
  const rootMap = new Map<string, MutableNode>();

  for (const file of files) {
    const normalizedPath = normalizeRelativePath(file.path);
    if (!normalizedPath) continue;

    const parts = normalizedPath.split('/');
    let currentPath = '';
    let cursorMap = rootMap;

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      if (!part) continue;

      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isDir = index < parts.length - 1;
      let node = cursorMap.get(part);

      if (!node) {
        node = {
          name: part,
          path: currentPath,
          isDir,
          depth: index,
          children: isDir ? [] : undefined,
          requestCount: isDir ? undefined : file.requestCount,
          childMap: isDir ? new Map<string, MutableNode>() : undefined
        };
        cursorMap.set(part, node);
      } else {
        if (isDir && !node.isDir) {
          node.isDir = true;
          node.requestCount = undefined;
          node.children = [];
          node.childMap = new Map<string, MutableNode>();
        }

        if (!isDir) {
          node.requestCount = file.requestCount;
        }
      }

      if (isDir) {
        if (!node.childMap) {
          node.childMap = new Map<string, MutableNode>();
        }
        if (!node.children) {
          node.children = [];
        }
        cursorMap = node.childMap;
      }
    }
  }

  return toExplorerNodes(rootMap);
}

export function flattenExplorerTree(
  nodes: ExplorerNode[],
  expandedDirs: ExplorerExpandedState
): ExplorerFlatNode[] {
  const flattened: ExplorerFlatNode[] = [];

  const visit = (node: ExplorerNode) => {
    const isExpanded = Boolean(expandedDirs[node.path]);
    flattened.push({
      node,
      isExpanded
    });

    if (!node.isDir || !isExpanded || !node.children) {
      return;
    }

    for (const child of node.children) {
      visit(child);
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return flattened;
}

export function createInitialExpandedDirs(nodes: ExplorerNode[]): ExplorerExpandedState {
  const initial: ExplorerExpandedState = {};

  for (const node of nodes) {
    if (node.isDir) {
      initial[node.path] = true;
    }
  }

  return initial;
}

export function findExplorerNode(nodes: ExplorerNode[], path: string): ExplorerNode | undefined {
  for (const node of nodes) {
    if (node.path === path) {
      return node;
    }

    if (node.children) {
      const child = findExplorerNode(node.children, path);
      if (child) {
        return child;
      }
    }
  }

  return undefined;
}

export function hasExplorerPath(nodes: ExplorerNode[], path: string): boolean {
  return Boolean(findExplorerNode(nodes, path));
}

export function pruneExpandedDirs(
  expandedDirs: ExplorerExpandedState,
  nodes: ExplorerNode[]
): ExplorerExpandedState {
  const pruned: ExplorerExpandedState = {};

  for (const [path, isExpanded] of Object.entries(expandedDirs)) {
    if (!isExpanded) continue;
    const node = findExplorerNode(nodes, path);
    if (node?.isDir) {
      pruned[path] = true;
    }
  }

  return pruned;
}
