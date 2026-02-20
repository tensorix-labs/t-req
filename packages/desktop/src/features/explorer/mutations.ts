import type { ExplorerFlatNode } from './types';

export type CreateHttpPathResult = { ok: true; path: string } | { ok: false; error: string };

export type CreateDirectoryResult =
  | { ok: true; directory: string | undefined }
  | { ok: false; error: string };

type CreateFileDeps = {
  createFile: (path: string) => Promise<void>;
  refetch: () => Promise<void>;
  setSelectedPath: (path: string | undefined) => void;
};

type DeleteFileDeps = {
  deleteFile: (path: string) => Promise<void>;
  refetch: () => Promise<void>;
  selectedPath: () => string | undefined;
  setSelectedPath: (path: string | undefined) => void;
  flattenedVisible: () => ExplorerFlatNode[];
};

export function toCreateHttpPath(rawInput: string): CreateHttpPathResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: 'Filename is required.'
    };
  }

  if (trimmed.includes('/') || trimmed.includes('\\')) {
    return {
      ok: false,
      error: 'Filename cannot include path separators.'
    };
  }

  if (trimmed.includes('..')) {
    return {
      ok: false,
      error: 'Filename cannot include "..".'
    };
  }

  if (trimmed === '.http') {
    return {
      ok: false,
      error: 'Filename cannot be only an extension.'
    };
  }

  const path = trimmed.toLowerCase().endsWith('.http') ? trimmed : `${trimmed}.http`;
  return {
    ok: true,
    path
  };
}

export function toCreateDirectory(rawInput: string): CreateDirectoryResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      ok: true,
      directory: undefined
    };
  }

  const normalized = trimmed.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
  if (!normalized) {
    return {
      ok: true,
      directory: undefined
    };
  }

  const parts = normalized.split('/').filter(Boolean);
  if (parts.some((part) => part === '..')) {
    return {
      ok: false,
      error: 'Directory cannot include "..".'
    };
  }

  return {
    ok: true,
    directory: parts.join('/')
  };
}

export function buildCreateFilePath(filename: string, directory?: string): string {
  if (!directory) {
    return filename;
  }

  return `${directory}/${filename}`;
}

export function resolveSelectionAfterDeletedPath(
  visibleItems: ExplorerFlatNode[],
  deletedPath: string
): string | undefined {
  const visibleFilePaths = visibleItems
    .filter((item) => !item.node.isDir)
    .map((item) => item.node.path);
  const deletedIndex = visibleFilePaths.indexOf(deletedPath);
  if (deletedIndex === -1) {
    return undefined;
  }

  return visibleFilePaths[deletedIndex + 1] ?? visibleFilePaths[deletedIndex - 1];
}

export async function runCreateFileMutation(path: string, deps: CreateFileDeps): Promise<void> {
  await deps.createFile(path);
  await deps.refetch();
  deps.setSelectedPath(path);
}

export async function runDeleteFileMutation(path: string, deps: DeleteFileDeps): Promise<void> {
  const nextSelectedPath = resolveSelectionAfterDeletedPath(deps.flattenedVisible(), path);
  await deps.deleteFile(path);
  if (deps.selectedPath() === path) {
    deps.setSelectedPath(nextSelectedPath);
  }
  await deps.refetch();
}

export async function runConfirmedDelete(
  path: string,
  confirmDelete: () => boolean,
  deleteFile: (path: string) => Promise<void>
): Promise<boolean> {
  if (!confirmDelete()) {
    return false;
  }

  await deleteFile(path);
  return true;
}
