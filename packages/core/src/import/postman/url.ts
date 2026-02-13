import { buildUrl, type UrlParts } from '../normalize';
import type { PostmanUrl } from '../postman-types';
import { addDisabledDiagnostic, sourcePath } from './diagnostics';
import type { ConvertState } from './state';

function replacePathVariables(url: string): string {
  return url.replace(/\/:([A-Za-z_][A-Za-z0-9_]*)/g, '/{{$1}}');
}

function normalizePathSegments(path: string | string[] | undefined): string | string[] | undefined {
  if (path === undefined) {
    return undefined;
  }
  const normalizeSegment = (segment: string) => {
    if (segment.startsWith(':') && segment.length > 1) {
      return `{{${segment.slice(1)}}}`;
    }
    return segment;
  };
  if (Array.isArray(path)) {
    return path.map((segment) => normalizeSegment(segment));
  }
  return normalizeSegment(path);
}

export function convertUrl(
  state: ConvertState,
  pathParts: string[],
  url: string | PostmanUrl | undefined
): string {
  if (typeof url === 'string') {
    return replacePathVariables(url.trim());
  }
  if (!url) {
    return '';
  }

  const query: Array<{ key: string; value?: string; disabled?: boolean }> = [];
  for (const param of url.query ?? []) {
    if (param.disabled) {
      addDisabledDiagnostic(state, sourcePath(pathParts), 'query parameter');
      continue;
    }
    if (!param.key) {
      continue;
    }
    const next: { key: string; value?: string; disabled?: boolean } = {
      key: param.key,
      disabled: false
    };
    if (param.value !== undefined) {
      next.value = param.value;
    }
    query.push(next);
  }

  const parts: UrlParts = {};
  if (url.raw !== undefined) {
    parts.raw = url.raw;
  }
  if (url.protocol !== undefined) {
    parts.protocol = url.protocol;
  }
  if (url.host !== undefined) {
    parts.host = url.host;
  }
  if (url.port !== undefined) {
    parts.port = url.port;
  }

  const normalizedPath = normalizePathSegments(url.path);
  if (normalizedPath !== undefined) {
    parts.path = normalizedPath;
  }
  if (query.length > 0) {
    parts.query = query;
  }
  if (url.hash !== undefined) {
    parts.hash = url.hash;
  }

  const built = buildUrl(parts);
  const fallback = built || (url.raw?.trim() ?? '');
  return replacePathVariables(fallback);
}

export function appendQueryParam(url: string, key: string, value: string): string {
  const param = value === '' ? key : `${key}=${value}`;
  if (!url) {
    return `?${param}`;
  }
  return `${url}${url.includes('?') ? '&' : '?'}${param}`;
}
