import { mkdir } from 'node:fs/promises';
import { parse } from '@t-req/core';
import { getFileType } from '../../tui/store';
import { dirname, isPathSafe, resolve } from '../../utils';
import {
  FileNotFoundError,
  ParseError,
  PathOutsideWorkspaceError,
  ValidationError
} from '../errors';
import type {
  CreateFileRequest,
  GetFileContentResponse,
  ListWorkspaceFilesResponse,
  ListWorkspaceRequestsResponse,
  WorkspaceFile,
  WorkspaceRequest
} from '../schemas';
import type { ServiceContext } from './types';
import { DEFAULT_WORKSPACE_IGNORE_PATTERNS } from './types';

export interface WorkspaceService {
  listWorkspaceFiles(additionalIgnore?: string[]): Promise<ListWorkspaceFilesResponse>;
  listWorkspaceRequests(path: string): Promise<ListWorkspaceRequestsResponse>;
  getFileContent(path: string): Promise<GetFileContentResponse>;
  updateFile(request: { path: string; content: string }): Promise<void>;
  createFile(request: CreateFileRequest): Promise<GetFileContentResponse>;
  deleteFile(path: string): Promise<void>;
}

export function createWorkspaceService(context: ServiceContext): WorkspaceService {
  async function listWorkspaceFiles(
    additionalIgnore?: string[]
  ): Promise<ListWorkspaceFilesResponse> {
    // Scan for .http files and script files (.ts, .js, .mts, .mjs)
    const httpGlob = new Bun.Glob('**/*.http');
    const scriptGlob = new Bun.Glob('**/*.{ts,js,mts,mjs,py}');
    const ignorePatterns = [...DEFAULT_WORKSPACE_IGNORE_PATTERNS, ...(additionalIgnore ?? [])];

    const files: WorkspaceFile[] = [];

    // Helper to check if path should be ignored
    const shouldIgnorePath = (path: string): boolean => {
      return ignorePatterns.some((pattern) => {
        return path.startsWith(`${pattern}/`) || path.includes(`/${pattern}/`) || path === pattern;
      });
    };

    // Scan .http files
    for await (const path of httpGlob.scan({
      cwd: context.workspaceRoot,
      onlyFiles: true
    })) {
      if (shouldIgnorePath(path)) continue;

      const fullPath = resolve(context.workspaceRoot, path);
      try {
        const file = Bun.file(fullPath);
        const stat = await file.stat();
        if (!stat) continue;

        // Parse to get request count
        const content = await file.text();
        let requestCount = 0;
        try {
          const requests = parse(content);
          requestCount = requests.length;
        } catch {
          // File may be malformed, still list it with 0 requests
        }

        files.push({
          path,
          name: path.split('/').pop() ?? path,
          requestCount,
          lastModified: stat.mtime?.getTime() ?? Date.now()
        });
      } catch {
        // Skip files we can't read
      }
    }

    // Scan script files (TS/JS)
    for await (const path of scriptGlob.scan({
      cwd: context.workspaceRoot,
      onlyFiles: true
    })) {
      if (shouldIgnorePath(path)) continue;

      const fullPath = resolve(context.workspaceRoot, path);
      try {
        const file = Bun.file(fullPath);
        const stat = await file.stat();
        if (!stat) continue;

        // Scripts don't have a request count - use 0
        files.push({
          path,
          name: path.split('/').pop() ?? path,
          requestCount: 0,
          lastModified: stat.mtime?.getTime() ?? Date.now()
        });
      } catch {
        // Skip files we can't read
      }
    }

    // Sort by lastModified descending
    files.sort((a, b) => b.lastModified - a.lastModified);

    return {
      files,
      workspaceRoot: context.workspaceRoot
    };
  }

  async function listWorkspaceRequests(path: string): Promise<ListWorkspaceRequestsResponse> {
    if (!isPathSafe(context.workspaceRoot, path)) {
      throw new PathOutsideWorkspaceError(path);
    }

    const fullPath = resolve(context.workspaceRoot, path);
    const file = Bun.file(fullPath);
    const exists = await file.exists();

    if (!exists) {
      throw new FileNotFoundError(path);
    }

    const content = await file.text();
    let parsedRequests: ReturnType<typeof parse>;

    try {
      parsedRequests = parse(content);
    } catch (err) {
      throw new ParseError(err instanceof Error ? err.message : String(err));
    }

    const requests: WorkspaceRequest[] = parsedRequests.map((req, index) => ({
      index,
      name: req.name,
      method: req.method,
      url: req.url,
      ...(req.protocol ? { protocol: req.protocol } : {})
    }));

    return { path, requests };
  }

  async function getFileContent(path: string): Promise<GetFileContentResponse> {
    if (!isPathSafe(context.workspaceRoot, path)) {
      throw new PathOutsideWorkspaceError(path);
    }

    const fullPath = resolve(context.workspaceRoot, path);
    const file = Bun.file(fullPath);
    const exists = await file.exists();

    if (!exists) {
      throw new FileNotFoundError(path);
    }

    const content = await file.text();
    const stat = await file.stat();

    return {
      path,
      content,
      lastModified: stat.mtime?.getTime() ?? Date.now()
    };
  }

  async function updateFile(request: { path: string; content: string }): Promise<void> {
    if (!isPathSafe(context.workspaceRoot, request.path)) {
      throw new PathOutsideWorkspaceError(request.path);
    }

    const fileType = getFileType(request.path);
    if (fileType === 'other') {
      throw new ValidationError('Only .http, script, and test files can be updated');
    }

    const fullPath = resolve(context.workspaceRoot, request.path);
    const file = Bun.file(fullPath);
    const exists = await file.exists();

    if (!exists) {
      throw new FileNotFoundError(request.path);
    }

    await Bun.write(fullPath, request.content);
  }

  async function createFile(request: CreateFileRequest): Promise<GetFileContentResponse> {
    if (!isPathSafe(context.workspaceRoot, request.path)) {
      throw new PathOutsideWorkspaceError(request.path);
    }

    const fileType = getFileType(request.path);
    if (fileType === 'other') {
      throw new ValidationError('File must be .http, script, or test file');
    }

    const fullPath = resolve(context.workspaceRoot, request.path);
    const file = Bun.file(fullPath);
    const exists = await file.exists();

    if (exists) {
      throw new ValidationError(`File already exists: ${request.path}`);
    }

    // Ensure parent directory exists
    const parentDir = dirname(fullPath);
    await mkdir(parentDir, { recursive: true });

    // Write file with provided or empty content
    const content = request.content ?? '';
    await Bun.write(fullPath, content);

    const stat = await file.stat();

    return {
      path: request.path,
      content,
      lastModified: stat.mtime?.getTime() ?? Date.now()
    };
  }

  async function deleteFile(path: string): Promise<void> {
    if (!isPathSafe(context.workspaceRoot, path)) {
      throw new PathOutsideWorkspaceError(path);
    }

    const fileType = getFileType(path);
    if (fileType === 'other') {
      throw new ValidationError('Only .http, script, and test files can be deleted');
    }

    const fullPath = resolve(context.workspaceRoot, path);
    const file = Bun.file(fullPath);
    const exists = await file.exists();

    if (!exists) {
      throw new FileNotFoundError(path);
    }

    await file.delete();
  }

  return {
    listWorkspaceFiles,
    listWorkspaceRequests,
    getFileContent,
    updateFile,
    createFile,
    deleteFile
  };
}
