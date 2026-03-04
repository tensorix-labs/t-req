export type FileType = 'http' | 'script' | 'test' | 'other';

const SCRIPT_EXTENSIONS = new Set(['.ts', '.js', '.mts', '.mjs', '.py']);
const HTTP_EXTENSIONS = new Set(['.http']);

const TEST_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /_test\.[jt]sx?$/,
  /_spec\.[jt]sx?$/,
  /^test_.*\.py$/,
  /.*_test\.py$/
];

export function isTestFile(path: string): boolean {
  const fileName = path.split('/').pop() ?? path;
  return TEST_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}

export function getFileType(path: string): FileType {
  const dotIndex = path.lastIndexOf('.');
  const ext = dotIndex !== -1 ? path.substring(dotIndex).toLowerCase() : '';
  if (HTTP_EXTENSIONS.has(ext)) return 'http';
  if (isTestFile(path)) return 'test';
  if (SCRIPT_EXTENSIONS.has(ext)) return 'script';
  return 'other';
}

export function isRunnableScript(path: string): boolean {
  return getFileType(path) === 'script';
}

export function isHttpFile(path: string): boolean {
  return getFileType(path) === 'http';
}
