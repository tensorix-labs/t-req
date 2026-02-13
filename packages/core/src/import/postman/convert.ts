import { z } from 'zod';
import { type PostmanCollection, PostmanCollectionSchema } from '../postman-types';
import type { Importer, ImportFile, ImportResult } from '../types';
import { isNoAuth } from './auth';
import { createDiagnostic, emitScriptDiagnostics } from './diagnostics';
import { asAuth, asEventArray, asItemArray } from './guards';
import type { ConvertState } from './state';
import { collectVariables } from './variables';
import { walkItems } from './walk';

export interface PostmanConvertOptions {
  /** @default 'request-per-file' */
  fileStrategy?: 'request-per-file' | 'folder-per-file';
  /** Emit diagnostics for disabled items rather than silently dropping. @default false */
  reportDisabled?: boolean;
}

export const PostmanConvertOptionsSchema = z.object({
  fileStrategy: z.enum(['request-per-file', 'folder-per-file']).optional(),
  reportDisabled: z.boolean().optional()
});

function parseOptions(options: PostmanConvertOptions | undefined): {
  fileStrategy: 'request-per-file' | 'folder-per-file';
  reportDisabled: boolean;
} {
  const parsedOptions = PostmanConvertOptionsSchema.safeParse(options ?? {});
  const resolvedOptions: {
    fileStrategy: 'request-per-file' | 'folder-per-file';
    reportDisabled: boolean;
  } = {
    fileStrategy: 'request-per-file',
    reportDisabled: false
  };

  if (parsedOptions.success) {
    if (parsedOptions.data.fileStrategy !== undefined) {
      resolvedOptions.fileStrategy = parsedOptions.data.fileStrategy;
    }
    if (parsedOptions.data.reportDisabled !== undefined) {
      resolvedOptions.reportDisabled = parsedOptions.data.reportDisabled;
    }
  }

  return resolvedOptions;
}

function invalidJsonResult(message: string): ImportResult {
  return {
    name: 'postman-collection',
    files: [],
    variables: {},
    diagnostics: [createDiagnostic('invalid-json', 'error', `Failed to parse JSON: ${message}`)],
    stats: {
      requestCount: 0,
      fileCount: 0,
      diagnosticCount: 1
    }
  };
}

function invalidCollectionResult(message: string): ImportResult {
  return {
    name: 'postman-collection',
    files: [],
    variables: {},
    diagnostics: [createDiagnostic('invalid-postman-collection', 'error', message)],
    stats: {
      requestCount: 0,
      fileCount: 0,
      diagnosticCount: 1
    }
  };
}

export function convertPostmanCollection(
  json: string,
  options?: PostmanConvertOptions
): ImportResult {
  const resolvedOptions = parseOptions(options);

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON input';
    return invalidJsonResult(message);
  }

  const parsedCollection = PostmanCollectionSchema.safeParse(raw);
  if (!parsedCollection.success) {
    const issue = parsedCollection.error.issues[0];
    const message = issue
      ? `${issue.path.join('.') || 'collection'}: ${issue.message}`
      : 'Invalid Postman collection schema';
    return invalidCollectionResult(message);
  }

  const envelope = parsedCollection.data;
  const collection = raw as PostmanCollection;
  const collectionName =
    (envelope.info.name ?? 'postman-collection').trim() || 'postman-collection';

  const state: ConvertState = {
    collectionName,
    fileStrategy: resolvedOptions.fileStrategy,
    reportDisabled: resolvedOptions.reportDisabled,
    diagnostics: [],
    variables: collectVariables(collection.variable),
    requestCount: 0,
    seenPaths: new Set<string>(),
    files: [],
    groupedFiles: new Map<string, ImportFile>()
  };

  emitScriptDiagnostics(state, [collectionName], asEventArray(collection.event));

  const collectionAuth = asAuth(collection.auth);
  const collectionItems = asItemArray(collection.item ?? envelope.item);

  walkItems(state, collectionItems, {
    folderSlugs: [],
    sourcePathParts: [collectionName],
    inheritedAuth: isNoAuth(collectionAuth) ? null : collectionAuth
  });

  return {
    name: collectionName,
    files: state.files,
    variables: state.variables,
    diagnostics: state.diagnostics,
    stats: {
      requestCount: state.requestCount,
      fileCount: state.files.length,
      diagnosticCount: state.diagnostics.length
    }
  };
}

export function createPostmanImporter(): Importer<PostmanConvertOptions> {
  return {
    source: 'postman',
    optionsSchema: PostmanConvertOptionsSchema as import('zod').ZodType<PostmanConvertOptions>,
    convert: convertPostmanCollection
  };
}
