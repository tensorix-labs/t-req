import type { ExplorerFileDocument, ExplorerFlatNode } from './types';

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

type SaveFileContentDeps = {
  saveFile: (path: string, content: string) => Promise<ExplorerFileDocument>;
  setSelectedFile: (file: ExplorerFileDocument) => void;
  refetchWorkspaceFiles: () => Promise<void>;
};

type RenameFileDeps = {
  readFile: (path: string) => Promise<ExplorerFileDocument>;
  createFile: (path: string, content: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  selectedPath: () => string | undefined;
  setSelectedPath: (path: string | undefined) => void;
  refetchWorkspaceFiles: () => Promise<void>;
};

function toErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isDestinationConflict(error: unknown): boolean {
  const text = toErrorText(error).toLowerCase();
  return (
    text.includes('already exists') ||
    text.includes('file exists') ||
    text.includes('eexist') ||
    text.includes('conflict')
  );
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

export async function runSaveFileContentMutation(
  path: string,
  content: string,
  deps: SaveFileContentDeps
): Promise<void> {
  const savedFile = await deps.saveFile(path, content);
  deps.setSelectedFile(savedFile);
  await deps.refetchWorkspaceFiles();
}

export async function runRenameFileMutation(
  fromPath: string,
  toPath: string,
  deps: RenameFileDeps
): Promise<void> {
  if (fromPath === toPath) {
    return;
  }

  const sourceFile = await deps.readFile(fromPath);
  try {
    await deps.createFile(toPath, sourceFile.content);
  } catch (error) {
    if (isDestinationConflict(error)) {
      throw new Error(`Destination already exists: "${toPath}".`);
    }
    throw error;
  }

  try {
    await deps.deleteFile(fromPath);
  } catch {
    try {
      // Best-effort rollback to avoid ending up with both old and new files after partial failure.
      await deps.deleteFile(toPath);
    } catch {
      throw new Error(
        `Rename partially applied. Created "${toPath}" but failed deleting "${fromPath}", and rollback failed.`
      );
    }

    throw new Error(
      `Rename failed while deleting "${fromPath}". The created file at "${toPath}" was rolled back.`
    );
  }

  if (deps.selectedPath() === fromPath) {
    deps.setSelectedPath(toPath);
  }
  await deps.refetchWorkspaceFiles();
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
