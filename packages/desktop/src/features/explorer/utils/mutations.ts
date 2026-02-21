import { normalizeRelativePath, parentDirectory } from './path';

export type CreateHttpPathResult = { ok: true; path: string } | { ok: false; error: string };
export type CreateDirectoryResult =
  | { ok: true; directory: string | undefined }
  | { ok: false; error: string };

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

export function buildCreateFilePath(filename: string, directory?: string): string {
  if (!directory) {
    return filename;
  }

  return `${directory}/${filename}`;
}

export function isCrossDirectoryMove(fromPath: string, toPath: string): boolean {
  return parentDirectory(fromPath) !== parentDirectory(toPath);
}

export function toCreateDirectory(rawInput: string): CreateDirectoryResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      ok: true,
      directory: undefined
    };
  }

  const normalized = normalizeRelativePath(trimmed);
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
