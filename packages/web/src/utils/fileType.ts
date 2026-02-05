export type FileType = 'http' | 'script' | 'test' | 'other';

// Script file extensions
const SCRIPT_EXTENSIONS = new Set(['.ts', '.js', '.mts', '.mjs', '.py']);
const HTTP_EXTENSIONS = new Set(['.http']);

// Test file patterns (common naming conventions)
const TEST_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /_test\.[jt]sx?$/,
  /_spec\.[jt]sx?$/,
  /test_.*\.py$/,
  /.*_test\.py$/
];

/**
 * Check if a file path is a test file based on common naming conventions.
 */
export function isTestFile(path: string): boolean {
  const fileName = path.split('/').pop() ?? path;
  return TEST_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}

/**
 * Determine the file type from a file path.
 */
export function getFileType(path: string): FileType {
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
  if (HTTP_EXTENSIONS.has(ext)) return 'http';
  if (isTestFile(path)) return 'test';
  if (SCRIPT_EXTENSIONS.has(ext)) return 'script';
  return 'other';
}

/**
 * Check if a file can be opened in the editor (any supported file type).
 */
export function isOpenableFile(path: string): boolean {
  return getFileType(path) !== 'other';
}
