/**
 * Extract the filename from a path string.
 * Returns the fallback value if the path is empty or extraction fails.
 */
export function extractFilename(path: string, fallback = ''): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || fallback;
}
