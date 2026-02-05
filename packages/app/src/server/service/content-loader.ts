import { type ParsedRequest, parse } from '@t-req/core';
import { dirname, isAbsolute, isPathSafe, resolve } from '../../utils';
import {
  ContentOrPathRequiredError,
  NoRequestsFoundError,
  ParseError,
  PathOutsideWorkspaceError,
  RequestIndexOutOfRangeError,
  RequestNotFoundError
} from '../errors';

export type LoadedContent = {
  content: string;
  httpFilePath: string | undefined;
  basePath: string;
};

export async function loadContent(
  workspaceRoot: string,
  request: { path?: string; content?: string; basePath?: string }
): Promise<LoadedContent> {
  if (request.path !== undefined) {
    if (!isPathSafe(workspaceRoot, request.path)) {
      throw new PathOutsideWorkspaceError(request.path);
    }
    const httpFilePath = request.path;
    const absolutePath = resolve(workspaceRoot, request.path);
    const content = await Bun.file(absolutePath).text();
    const basePath = dirname(absolutePath);
    return { content, httpFilePath, basePath };
  }

  if (request.content !== undefined) {
    let basePath: string;
    if (request.basePath !== undefined) {
      if (isAbsolute(request.basePath) || !isPathSafe(workspaceRoot, request.basePath)) {
        throw new PathOutsideWorkspaceError(request.basePath);
      }
      basePath = resolve(workspaceRoot, request.basePath);
    } else {
      basePath = workspaceRoot;
    }
    return { content: request.content, httpFilePath: undefined, basePath };
  }

  throw new ContentOrPathRequiredError();
}

export function parseContent(content: string): ReturnType<typeof parse> {
  try {
    return parse(content);
  } catch (err) {
    throw new ParseError(err instanceof Error ? err.message : String(err));
  }
}

export function selectRequest(
  parsedRequests: ParsedRequest[],
  selection: { requestName?: string; requestIndex?: number }
): { selectedRequest: ParsedRequest; selectedIndex: number } {
  if (parsedRequests.length === 0) {
    throw new NoRequestsFoundError();
  }

  let selectedIndex = 0;
  let selectedRequest = parsedRequests[0];

  if (selection.requestName !== undefined) {
    const found = parsedRequests.findIndex((r) => r.name === selection.requestName);
    if (found === -1) {
      throw new RequestNotFoundError(`name '${selection.requestName}'`);
    }
    selectedIndex = found;
    selectedRequest = parsedRequests[found];
  } else if (selection.requestIndex !== undefined) {
    if (selection.requestIndex < 0 || selection.requestIndex >= parsedRequests.length) {
      throw new RequestIndexOutOfRangeError(selection.requestIndex, parsedRequests.length - 1);
    }
    selectedIndex = selection.requestIndex;
    selectedRequest = parsedRequests[selection.requestIndex];
  }

  if (!selectedRequest) {
    throw new NoRequestsFoundError();
  }

  return { selectedRequest, selectedIndex };
}
