import type { SerializableRequest } from '../../serializer';
import { deduplicatePath, slugify } from '../normalize';
import type { PostmanItem, PostmanRequest } from '../postman-types';
import type { ImportFile } from '../types';
import { applyAuth, resolveAuth } from './auth';
import { descriptionToText, mapBody } from './body';
import { addDisabledDiagnostic, emitScriptDiagnostics, sourcePath } from './diagnostics';
import { asAuth, asEventArray, asHeaders, asItemArray, asRequest } from './guards';
import { collectHeaders } from './headers';
import type { ConvertState, WalkContext } from './state';
import { convertUrl } from './url';

function toRequestObject(request: PostmanRequest | string): PostmanRequest {
  if (typeof request === 'string') {
    return {
      method: 'GET',
      url: request
    };
  }
  return request;
}

function addRequestToFiles(
  state: ConvertState,
  folderSlugs: string[],
  requestName: string,
  request: SerializableRequest
): void {
  if (state.fileStrategy === 'request-per-file') {
    const relativePath = deduplicatePath(
      [...folderSlugs, `${slugify(requestName)}.http`].join('/'),
      state.seenPaths
    );
    state.files.push({
      relativePath,
      document: { requests: [request] }
    });
    return;
  }

  const groupKey = folderSlugs.join('/');
  const existing = state.groupedFiles.get(groupKey);
  if (existing) {
    existing.document.requests.push(request);
    return;
  }

  const basePath = groupKey ? `${groupKey}.http` : `${slugify(state.collectionName)}.http`;
  const relativePath = deduplicatePath(basePath, state.seenPaths);

  const file: ImportFile = {
    relativePath,
    document: { requests: [request] }
  };
  state.groupedFiles.set(groupKey, file);
  state.files.push(file);
}

export function walkItems(state: ConvertState, items: PostmanItem[], context: WalkContext): void {
  for (const item of items) {
    const itemName =
      typeof item.name === 'string' && item.name.trim() !== '' ? item.name.trim() : 'untitled';
    const itemSourceParts = [...context.sourcePathParts, itemName];

    if (item.disabled) {
      addDisabledDiagnostic(state, sourcePath(itemSourceParts), 'request');
      continue;
    }

    emitScriptDiagnostics(state, itemSourceParts, asEventArray(item.event));

    const childItems = asItemArray(item.item);
    if (childItems.length > 0) {
      const folderAuth = resolveAuth(context.inheritedAuth, asAuth(item.auth));
      walkItems(state, childItems, {
        folderSlugs: [...context.folderSlugs, slugify(itemName)],
        sourcePathParts: itemSourceParts,
        inheritedAuth: folderAuth
      });
      continue;
    }

    const rawRequest = asRequest(item.request);
    if (!rawRequest) {
      continue;
    }

    const requestObject = toRequestObject(rawRequest);
    const requestAuth = resolveAuth(context.inheritedAuth, asAuth(requestObject.auth));
    const requestSourceParts = [...itemSourceParts];
    const requestName = itemName;

    const headers = collectHeaders(state, requestSourceParts, asHeaders(requestObject.header));
    let url = convertUrl(state, requestSourceParts, requestObject.url);

    const body = mapBody(state, requestObject, requestSourceParts, headers);
    const authApplied = applyAuth(state, requestSourceParts, requestAuth, headers, url);
    url = authApplied.url;

    const description =
      descriptionToText(requestObject.description) ?? descriptionToText(item.description);
    const method =
      typeof requestObject.method === 'string' && requestObject.method.trim() !== ''
        ? requestObject.method.toUpperCase()
        : 'GET';

    const convertedRequest: SerializableRequest = {
      name: requestName,
      method,
      url,
      headers: authApplied.headers
    };

    if (description) {
      convertedRequest.description = description;
    }
    if (body.body !== undefined) {
      convertedRequest.body = body.body;
    }
    if (body.bodyFile !== undefined) {
      convertedRequest.bodyFile = body.bodyFile;
    }
    if (body.formData !== undefined) {
      convertedRequest.formData = body.formData;
    }

    addRequestToFiles(state, context.folderSlugs, requestName, convertedRequest);
    state.requestCount += 1;
  }
}
