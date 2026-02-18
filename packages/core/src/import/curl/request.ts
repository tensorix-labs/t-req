import type { SerializableRequest } from '../../serializer';
import type { ImportDiagnostic } from '../types';
import { createDiagnostic } from './diagnostics';
import { setHeaderIfMissing } from './headers';
import { appendQueryParam, normalizeFilePath } from './normalize';
import type { ParsedCurlCommand } from './types';

function hasPayloadData(parsed: ParsedCurlCommand): boolean {
  return parsed.dataParts.length > 0 || parsed.dataUrlEncodedParts.length > 0;
}

export function resolveMethod(parsed: ParsedCurlCommand): string {
  if (parsed.method) {
    return parsed.method;
  }
  if (parsed.formData.length > 0 || (hasPayloadData(parsed) && !parsed.useGet)) {
    return 'POST';
  }
  return 'GET';
}

export function applyGetDataToUrl(
  parsed: ParsedCurlCommand,
  baseUrl: string,
  diagnostics: ImportDiagnostic[]
): string {
  let url = baseUrl;
  if (!parsed.useGet) {
    return url;
  }

  const queryParams = [...parsed.dataParts, ...parsed.dataUrlEncodedParts];
  for (const param of queryParams) {
    if (param.startsWith('@')) {
      diagnostics.push(
        createDiagnostic(
          'unsupported-data-file',
          'warning',
          `Data file "${param}" cannot be mapped to a URL query parameter and was ignored.`,
          { param }
        )
      );
      continue;
    }
    url = appendQueryParam(url, param);
  }

  return url;
}

export function buildSerializableRequest(
  parsed: ParsedCurlCommand,
  requestName: string,
  method: string,
  url: string
): SerializableRequest {
  const request: SerializableRequest = {
    name: requestName,
    method,
    url,
    headers: parsed.headers
  };

  if (parsed.formData.length > 0) {
    request.formData = parsed.formData;
    return request;
  }

  if (!parsed.useGet && hasPayloadData(parsed)) {
    const singleData = parsed.dataParts.length === 1 ? parsed.dataParts[0] : undefined;
    if (singleData?.startsWith('@')) {
      request.bodyFile = { path: normalizeFilePath(singleData.slice(1).trim()) };
      return request;
    }

    request.body = [...parsed.dataParts, ...parsed.dataUrlEncodedParts].join('&');
    if (request.body !== '' && request.body !== undefined) {
      const headers = request.headers ?? {};
      request.headers = headers;
      setHeaderIfMissing(headers, 'Content-Type', 'application/x-www-form-urlencoded');
    }
  }

  return request;
}
