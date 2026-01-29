/**
 * HTTP status badge utilities
 * Provides consistent styling for HTTP status code indicators
 */

export type StatusCategory = 'success' | 'redirect' | 'client-error' | 'server-error' | 'unknown';

/**
 * Get the category for an HTTP status code
 */
export function getStatusCategory(status: number): StatusCategory {
  if (status >= 200 && status < 300) return 'success';
  if (status >= 300 && status < 400) return 'redirect';
  if (status >= 400 && status < 500) return 'client-error';
  if (status >= 500) return 'server-error';
  return 'unknown';
}

/**
 * Get the color value for an HTTP status code
 */
export function getStatusColor(status: number): string {
  switch (getStatusCategory(status)) {
    case 'success':
      return '#22c55e'; // green
    case 'redirect':
      return '#3b82f6'; // blue
    case 'client-error':
      return '#eab308'; // yellow
    case 'server-error':
      return '#ef4444'; // red
    default:
      return '#64748b'; // gray
  }
}

/**
 * Get Tailwind classes for an HTTP status badge
 * @param status - HTTP status code
 * @param size - Badge size variant ('sm' for compact, 'md' for default)
 */
export function getStatusClasses(status: number, size: 'sm' | 'md' = 'md'): string {
  const sizeClasses = size === 'sm' ? 'text-[0.625rem] px-1.5 py-0.5' : 'text-xs px-1.5 py-0.5';

  const base = `font-mono font-semibold rounded ${sizeClasses}`;

  switch (getStatusCategory(status)) {
    case 'success':
      return `${base} bg-http-get/15 text-http-get`;
    case 'redirect':
      return `${base} bg-http-post/15 text-http-post`;
    case 'client-error':
      return `${base} bg-http-put/15 text-http-put`;
    case 'server-error':
      return `${base} bg-http-delete/15 text-http-delete`;
    default:
      return `${base} bg-treq-border-light text-treq-text-muted dark:bg-treq-dark-border-light dark:text-treq-dark-text-muted`;
  }
}

/**
 * Get classes for a selected state status badge (white on colored background)
 */
export function getStatusClassesSelected(size: 'sm' | 'md' = 'md'): string {
  const sizeClasses = size === 'sm' ? 'text-[0.625rem] px-1.5 py-0.5' : 'text-xs px-1.5 py-0.5';

  return `font-mono font-semibold rounded ${sizeClasses} bg-white/20 text-white`;
}

/**
 * Get classes for execution status (pending/running/success/failed)
 */
export function getExecutionStatusClasses(
  status: 'pending' | 'running' | 'success' | 'failed',
  isSelected: boolean = false
): string {
  const base = 'font-mono text-xs font-semibold px-1.5 py-0.5 rounded';

  if (isSelected) return `${base} bg-white/20 text-white`;

  switch (status) {
    case 'success':
      return `${base} bg-http-get/15 text-http-get`;
    case 'failed':
      return `${base} bg-http-delete/15 text-http-delete`;
    case 'pending':
    case 'running':
    default:
      return base;
  }
}
