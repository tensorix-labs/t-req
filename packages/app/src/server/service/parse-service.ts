import { parse } from '@t-req/core';
import { resolveProjectConfig } from '@t-req/core/config';
import { dirname, isPathSafe, resolve } from '../../utils';
import { analyzeParsedContent, getDiagnosticsForBlock, parseBlocks } from '../diagnostics';
import { ContentOrPathRequiredError, ParseError, PathOutsideWorkspaceError } from '../errors';
import type { Diagnostic, ParsedRequestInfo, ParseRequest, ParseResponse } from '../schemas';
import type { ConfigService } from './config-service';
import type { ServiceContext } from './types';
import { contentTypeIndicatesFormData } from './utils';

export interface ParseService {
  parseRequest(request: ParseRequest): Promise<ParseResponse>;
}

export function createParseService(
  context: ServiceContext,
  configService: ConfigService
): ParseService {
  async function parseRequest(request: ParseRequest): Promise<ParseResponse> {
    let content: string;
    let httpFilePath: string | undefined;

    if (request.path !== undefined) {
      if (!isPathSafe(context.workspaceRoot, request.path)) {
        throw new PathOutsideWorkspaceError(request.path);
      }
      httpFilePath = request.path;
      const absolutePath = resolve(context.workspaceRoot, request.path);
      content = await Bun.file(absolutePath).text();
    } else if (request.content !== undefined) {
      content = request.content;
    } else {
      throw new ContentOrPathRequiredError();
    }

    // Resolve config for project root info
    const startDir = httpFilePath
      ? dirname(resolve(context.workspaceRoot, httpFilePath))
      : context.workspaceRoot;
    const resolvedConfig = await resolveProjectConfig({
      startDir,
      stopDir: context.workspaceRoot
    });

    const resolved = configService.getResolvedPaths(httpFilePath, resolvedConfig);
    let parsedRequests: ReturnType<typeof parse>;
    try {
      parsedRequests = parse(content);
    } catch (err) {
      throw new ParseError(err instanceof Error ? err.message : String(err));
    }

    // Analyze for diagnostics
    const includeDiagnostics = request.includeDiagnostics !== false;
    const allDiagnostics = analyzeParsedContent(content, { includeDiagnostics });
    const contentBlocks = parseBlocks(content);

    const blocks = parsedRequests.map(
      (req, index): { request?: ParsedRequestInfo; diagnostics: Diagnostic[] } => {
        // Get block info for this request (by index)
        const blockInfo = contentBlocks[index];
        const blockDiagnostics = blockInfo ? getDiagnosticsForBlock(allDiagnostics, blockInfo) : [];

        return {
          request: {
            index,
            name: req.name,
            method: req.method,
            url: req.url,
            headers: req.headers,
            hasBody: req.body !== undefined,
            hasFormData:
              (req.formData !== undefined && req.formData.length > 0) ||
              contentTypeIndicatesFormData(req.headers),
            hasBodyFile: req.bodyFile !== undefined,
            meta: req.meta
          },
          diagnostics: blockDiagnostics
        };
      }
    );

    return {
      requests: blocks,
      diagnostics: allDiagnostics,
      resolved
    };
  }

  return {
    parseRequest
  };
}
