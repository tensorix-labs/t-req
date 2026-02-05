/**
 * Completion data for HTTP editor autocomplete.
 */

export const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'TRACE',
  'CONNECT'
] as const;

export const COMMON_HEADERS = [
  'Accept',
  'Accept-Charset',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Connection',
  'Content-Disposition',
  'Content-Encoding',
  'Content-Length',
  'Content-Type',
  'Cookie',
  'Date',
  'ETag',
  'Expect',
  'Forwarded',
  'From',
  'Host',
  'If-Match',
  'If-Modified-Since',
  'If-None-Match',
  'If-Range',
  'If-Unmodified-Since',
  'Origin',
  'Pragma',
  'Proxy-Authorization',
  'Range',
  'Referer',
  'TE',
  'Trailer',
  'Transfer-Encoding',
  'Upgrade',
  'User-Agent',
  'Via',
  'Warning',
  'X-Api-Key',
  'X-Correlation-ID',
  'X-Forwarded-For',
  'X-Forwarded-Host',
  'X-Forwarded-Proto',
  'X-Request-ID',
  'X-Requested-With'
] as const;

export const CONTENT_TYPES = [
  'application/json',
  'application/xml',
  'application/x-www-form-urlencoded',
  'application/octet-stream',
  'application/pdf',
  'application/javascript',
  'application/graphql',
  'multipart/form-data',
  'text/plain',
  'text/html',
  'text/css',
  'text/csv',
  'text/xml',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/svg+xml'
] as const;

export const AUTH_SCHEMES = [
  'Bearer ',
  'Basic ',
  'Digest ',
  'OAuth ',
  'HOBA ',
  'Mutual ',
  'AWS4-HMAC-SHA256 '
] as const;

export const ACCEPT_TYPES = [
  'application/json',
  'application/xml',
  'text/html',
  'text/plain',
  '*/*'
] as const;

export const CACHE_CONTROL_VALUES = [
  'no-cache',
  'no-store',
  'max-age=0',
  'max-age=3600',
  'must-revalidate',
  'public',
  'private'
] as const;

export const BUILTIN_RESOLVERS = [
  { name: '$env(', description: 'Environment variable', detail: '$env(VAR_NAME)' },
  {
    name: '$uuid()',
    description: 'Generate UUID v4',
    detail: 'e.g., 550e8400-e29b-41d4-a716-446655440000'
  },
  { name: '$timestamp()', description: 'Current Unix timestamp', detail: 'Seconds since epoch' },
  {
    name: '$isoTimestamp()',
    description: 'Current ISO 8601 timestamp',
    detail: 'e.g., 2024-01-15T10:30:00.000Z'
  },
  { name: '$random(', description: 'Random number', detail: '$random(min, max)' },
  { name: '$randomString(', description: 'Random string', detail: '$randomString(length)' },
  { name: '$base64(', description: 'Base64 encode', detail: '$base64(text)' },
  { name: '$urlEncode(', description: 'URL encode', detail: '$urlEncode(text)' },
  { name: '$file(', description: 'Read file contents', detail: '$file(path)' },
  { name: '$prompt(', description: 'Prompt for input', detail: '$prompt(message)' }
] as const;

/**
 * Header-specific value completions
 */
export const HEADER_VALUE_COMPLETIONS: Record<string, readonly string[]> = {
  'content-type': CONTENT_TYPES,
  accept: ACCEPT_TYPES,
  'cache-control': CACHE_CONTROL_VALUES,
  authorization: AUTH_SCHEMES,
  connection: ['keep-alive', 'close'],
  'accept-encoding': ['gzip', 'deflate', 'br', 'identity', '*'],
  'content-encoding': ['gzip', 'deflate', 'br', 'identity']
};
