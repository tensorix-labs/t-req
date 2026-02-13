export type AuthType = 'bearer' | 'basic' | 'apikey';

export interface AuthParams {
  token?: string;
  username?: string;
  password?: string;
  key?: string;
  value?: string;
  in?: 'header' | 'query';
}

export interface UrlQueryParam {
  key: string;
  value?: string;
  disabled?: boolean;
}

export interface UrlParts {
  raw?: string;
  protocol?: string;
  host?: string | string[];
  port?: string | number;
  path?: string | string[];
  query?: UrlQueryParam[];
  hash?: string;
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

function splitPath(path: string): { dir: string; file: string } {
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash === -1) {
    return { dir: '', file: path };
  }

  return {
    dir: path.slice(0, lastSlash + 1),
    file: path.slice(lastSlash + 1)
  };
}

function splitFileExtension(filename: string): { base: string; ext: string } {
  if (filename.startsWith('.') && filename.indexOf('.', 1) === -1) {
    return { base: filename, ext: '' };
  }

  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0) {
    return { base: filename, ext: '' };
  }

  return {
    base: filename.slice(0, lastDot),
    ext: filename.slice(lastDot)
  };
}

function encodeBase64(value: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf-8').toString('base64');
  }

  if (typeof btoa !== 'undefined') {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  throw new Error('No base64 encoder available in this runtime');
}

function normalizeHost(host: string | string[] | undefined): string {
  if (host === undefined) {
    return '';
  }
  if (Array.isArray(host)) {
    return host
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join('.');
  }
  return host.trim();
}

function normalizePath(path: string | string[] | undefined): string {
  if (path === undefined) {
    return '';
  }
  if (Array.isArray(path)) {
    return path
      .map((segment) => trimSlashes(segment.trim()))
      .filter(Boolean)
      .join('/');
  }
  return trimSlashes(path.trim());
}

export function slugify(name: string): string {
  const normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'untitled';
}

export function deduplicatePath(path: string, existing: Set<string>): string {
  if (!existing.has(path)) {
    existing.add(path);
    return path;
  }

  const { dir, file } = splitPath(path);
  const { base, ext } = splitFileExtension(file);

  let count = 2;
  let candidate = `${dir}${base}-${count}${ext}`;
  while (existing.has(candidate)) {
    count += 1;
    candidate = `${dir}${base}-${count}${ext}`;
  }

  existing.add(candidate);
  return candidate;
}

export function buildAuthHeaders(type: AuthType, params: AuthParams): Record<string, string> {
  if (type === 'bearer') {
    if (!params.token) {
      return {};
    }
    return { Authorization: `Bearer ${params.token}` };
  }

  if (type === 'basic') {
    if (params.username === undefined || params.password === undefined) {
      return {};
    }
    const encoded = encodeBase64(`${params.username}:${params.password}`);
    return { Authorization: `Basic ${encoded}` };
  }

  if (params.in === 'query') {
    return {};
  }
  if (!params.key || params.value === undefined) {
    return {};
  }
  return { [params.key]: params.value };
}

export function buildUrl(parts: UrlParts): string {
  const host = normalizeHost(parts.host);
  const path = normalizePath(parts.path);
  const protocol = parts.protocol?.trim();
  const port = parts.port === undefined ? '' : String(parts.port).trim();

  let url = '';
  if (host) {
    url = protocol ? `${protocol}://${host}` : host;
    if (port) {
      url += `:${port}`;
    }
    if (path) {
      url += `/${path}`;
    }
  } else if (path) {
    url = `/${path}`;
  } else if (parts.raw?.trim()) {
    url = parts.raw.trim();
  }

  const query = (parts.query ?? [])
    .filter((item) => !item.disabled && item.key !== '')
    .map((item) =>
      item.value === undefined || item.value === '' ? item.key : `${item.key}=${item.value}`
    )
    .join('&');

  if (query) {
    url += url.includes('?') ? `&${query}` : `?${query}`;
  }

  const hash = parts.hash?.trim();
  if (hash) {
    url += hash.startsWith('#') ? hash : `#${hash}`;
  }

  return url;
}
