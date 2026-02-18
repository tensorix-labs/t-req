import type { ExplorerFileEntry } from './types';

const HTTP_FILE_EXTENSION = '.http';

type WorkspaceFileLike = {
  path: string;
  requestCount?: number;
};

function isHttpWorkspaceFile(file: WorkspaceFileLike): boolean {
  return file.path.toLowerCase().endsWith(HTTP_FILE_EXTENSION);
}

export function toExplorerFiles(files: WorkspaceFileLike[]): ExplorerFileEntry[] {
  return files.filter(isHttpWorkspaceFile).map((file) => ({
    path: file.path,
    requestCount: file.requestCount
  }));
}
