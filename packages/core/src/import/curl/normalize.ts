function isRelativePath(path: string): boolean {
  return path.startsWith('./') || path.startsWith('../');
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/');
}

function isTemplatePath(path: string): boolean {
  return path.startsWith('{{');
}

function shouldKeepFilePath(path: string): boolean {
  return isRelativePath(path) || isAbsolutePath(path) || isTemplatePath(path);
}

export function normalizeFilePath(path: string): string {
  if (shouldKeepFilePath(path)) {
    return path;
  }
  return `./${path}`;
}

export function looksLikeUrl(token: string): boolean {
  const hasScheme = token.includes('://');
  const isTemplateUrl = token.startsWith('{{');
  return hasScheme || isTemplateUrl;
}

export function appendQueryParam(url: string, value: string): string {
  if (!value) {
    return url;
  }
  return `${url}${url.includes('?') ? '&' : '?'}${value}`;
}
