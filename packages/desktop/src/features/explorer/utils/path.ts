export function normalizeRelativePath(path: string): string {
  return path.replaceAll('\\', '/').split('/').filter(Boolean).join('/');
}

export function parentDirectory(path: string): string {
  const index = path.lastIndexOf('/');
  if (index <= 0) {
    return '';
  }
  return path.slice(0, index);
}

export function pathFilename(path: string): string {
  return path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
}

export function trimHttpExtension(filename: string): string {
  return filename.toLowerCase().endsWith('.http') ? filename.slice(0, -5) : filename;
}
