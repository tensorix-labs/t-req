export type {
  ExplorerExpandedState,
  ExplorerFileEntry,
  ExplorerFlatNode,
  ExplorerNode
} from '@t-req/ui/explorer';

export interface ExplorerFileDocument {
  path: string;
  content: string;
  lastModified: number;
}
