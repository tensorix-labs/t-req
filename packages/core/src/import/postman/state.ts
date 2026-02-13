import type { PostmanAuth } from '../postman-types';
import type { ImportDiagnostic, ImportFile } from '../types';

export interface ConvertState {
  collectionName: string;
  fileStrategy: 'request-per-file' | 'folder-per-file';
  reportDisabled: boolean;
  diagnostics: ImportDiagnostic[];
  variables: Record<string, unknown>;
  requestCount: number;
  seenPaths: Set<string>;
  files: ImportFile[];
  groupedFiles: Map<string, ImportFile>;
}

export interface WalkContext {
  folderSlugs: string[];
  sourcePathParts: string[];
  inheritedAuth: PostmanAuth | null | undefined;
}
