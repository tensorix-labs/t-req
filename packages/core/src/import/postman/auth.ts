import { type AuthParams, buildAuthHeaders } from '../normalize';
import type { PostmanAuth, PostmanAuthAttribute } from '../postman-types';
import { createDiagnostic, sourcePath } from './diagnostics';
import { isObjectRecord } from './guards';
import { setHeaderIfMissing } from './headers';
import type { ConvertState } from './state';
import { appendQueryParam } from './url';

function extractAuthValue(
  attributes: PostmanAuthAttribute[] | undefined,
  key: string
): string | undefined {
  for (const rawAttribute of attributes ?? []) {
    if (!isObjectRecord(rawAttribute)) {
      continue;
    }
    const attribute = rawAttribute as PostmanAuthAttribute;
    if (!attribute.disabled && (attribute.key ?? '').toLowerCase() === key) {
      return attribute.value;
    }
  }
  return undefined;
}

export function isNoAuth(auth: PostmanAuth | undefined): boolean {
  return (auth?.type ?? '').toLowerCase() === 'noauth';
}

export function resolveAuth(
  inherited: PostmanAuth | null | undefined,
  own: PostmanAuth | undefined
): PostmanAuth | null | undefined {
  if (!own) {
    return inherited;
  }
  if (isNoAuth(own)) {
    return null;
  }
  return own;
}

export function applyAuth(
  state: ConvertState,
  sourceParts: string[],
  auth: PostmanAuth | null | undefined,
  headers: Record<string, string>,
  url: string
): { headers: Record<string, string>; url: string } {
  if (!auth) {
    return { headers, url };
  }

  const type = (auth.type ?? '').toLowerCase();
  if (type === '' || type === 'noauth') {
    return { headers, url };
  }

  if (type === 'bearer') {
    const token = extractAuthValue(auth.bearer, 'token') ?? extractAuthValue(auth.bearer, 'value');
    if (token) {
      const authHeaders = buildAuthHeaders('bearer', { token });
      for (const [key, value] of Object.entries(authHeaders)) {
        setHeaderIfMissing(headers, key, value);
      }
    }
    return { headers, url };
  }

  if (type === 'basic') {
    const username = extractAuthValue(auth.basic, 'username');
    const password = extractAuthValue(auth.basic, 'password');
    if ((username ?? '').includes('{{') || (password ?? '').includes('{{')) {
      state.diagnostics.push(
        createDiagnostic(
          'templated-basic-auth',
          'warning',
          'Templated basic auth values cannot be safely base64-encoded automatically.',
          sourcePath(sourceParts)
        )
      );
      return { headers, url };
    }

    const basicParams: AuthParams = {};
    if (username !== undefined) {
      basicParams.username = username;
    }
    if (password !== undefined) {
      basicParams.password = password;
    }

    const authHeaders = buildAuthHeaders('basic', basicParams);
    for (const [key, value] of Object.entries(authHeaders)) {
      setHeaderIfMissing(headers, key, value);
    }
    return { headers, url };
  }

  if (type === 'apikey') {
    const key = extractAuthValue(auth.apikey, 'key');
    const value = extractAuthValue(auth.apikey, 'value') ?? '';
    const where = (extractAuthValue(auth.apikey, 'in') ?? 'header').toLowerCase();
    const authParams: AuthParams = {
      value,
      in: where === 'query' ? 'query' : 'header'
    };
    if (key !== undefined) {
      authParams.key = key;
    }

    if (authParams.in === 'query') {
      if (key) {
        return { headers, url: appendQueryParam(url, key, value) };
      }
      return { headers, url };
    }

    const authHeaders = buildAuthHeaders('apikey', authParams);
    for (const [headerName, headerValue] of Object.entries(authHeaders)) {
      setHeaderIfMissing(headers, headerName, headerValue);
    }
    return { headers, url };
  }

  state.diagnostics.push(
    createDiagnostic(
      'unsupported-auth',
      'warning',
      `Postman auth type "${type}" is not supported and was ignored.`,
      sourcePath(sourceParts),
      { type }
    )
  );
  return { headers, url };
}
