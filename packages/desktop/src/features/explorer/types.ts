export type ExplorerExpandedState = Record<string, boolean>;

export interface ExplorerFileEntry {
  path: string;
  requestCount?: number;
}

export interface ExplorerNode {
  name: string;
  path: string;
  isDir: boolean;
  depth: number;
  children?: ExplorerNode[];
  requestCount?: number;
}

export interface ExplorerFlatNode {
  node: ExplorerNode;
  isExpanded: boolean;
}

export interface ExplorerFileDocument {
  path: string;
  content: string;
  lastModified: number;
}
