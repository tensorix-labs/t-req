/**
 * HTTP method badge utilities
 * Provides consistent styling for HTTP method indicators across the app
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Get the color value for an HTTP method
 */
export function getMethodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return '#22c55e';
    case 'POST':
      return '#3b82f6';
    case 'PUT':
      return '#eab308';
    case 'PATCH':
      return '#a855f7';
    case 'DELETE':
      return '#ef4444';
    default:
      return '#64748b';
  }
}

/**
 * Get Tailwind classes for an HTTP method badge
 * @param method - HTTP method string
 * @param size - Badge size variant ('sm' for compact, 'md' for default)
 */
export function getMethodClasses(method: string, size: 'sm' | 'md' = 'md'): string {
  const sizeClasses =
    size === 'sm' ? 'text-[0.625rem] px-1.5 py-0.5 min-w-12' : 'text-xs px-2 py-1 min-w-16';

  const base = `font-mono font-semibold rounded uppercase text-center ${sizeClasses}`;

  switch (method.toUpperCase()) {
    case 'GET':
      return `${base} bg-http-get/15 text-http-get`;
    case 'POST':
      return `${base} bg-http-post/15 text-http-post`;
    case 'PUT':
      return `${base} bg-http-put/15 text-http-put`;
    case 'PATCH':
      return `${base} bg-http-patch/15 text-http-patch`;
    case 'DELETE':
      return `${base} bg-http-delete/15 text-http-delete`;
    default:
      return `${base} bg-treq-border-light text-treq-text-muted dark:bg-treq-dark-border-light dark:text-treq-dark-text-muted`;
  }
}

/**
 * Get classes for a selected state method badge (white on colored background)
 */
export function getMethodClassesSelected(size: 'sm' | 'md' = 'md'): string {
  const sizeClasses =
    size === 'sm' ? 'text-[0.625rem] px-1.5 py-0.5 min-w-12' : 'text-xs px-2 py-1 min-w-16';

  return `font-mono font-semibold rounded uppercase text-center ${sizeClasses} bg-white/20 text-white`;
}
