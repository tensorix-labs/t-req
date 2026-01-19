import type { IO } from './runtime/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for loading a file body.
 */
export interface FileLoaderOptions {
  /**
   * Base path for resolving relative file paths.
   * File paths are validated to not escape this directory.
   * @default process.cwd()
   */
  basePath?: string;

  /**
   * Optional IO adapter for reading files (Node/Bun/Tauri).
   * If not provided, Bun runtime fallback is used when available.
   */
  io?: IO;
}

/**
 * Result of loading a file body.
 */
export interface LoadedFile {
  /** File content as string (text) or ArrayBuffer (binary) */
  content: string | ArrayBuffer;
  /** Whether the file was loaded as binary */
  isBinary: boolean;
  /** Inferred MIME type based on file extension */
  mimeType: string;
}

// ============================================================================
// MIME Type Detection
// ============================================================================

/**
 * Map of file extensions to MIME types.
 */
const EXTENSION_MIME_MAP: Record<string, string> = {
  // Text types
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.ts': 'application/typescript',
  '.csv': 'text/csv',
  '.md': 'text/markdown',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.svg': 'image/svg+xml',

  // Binary image types
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',

  // Binary document types
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  // Binary archive types
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',

  // Binary audio types
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',

  // Binary video types
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',

  // Other binary types
  '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream',
  '.exe': 'application/octet-stream',
  '.dll': 'application/octet-stream',
  '.so': 'application/octet-stream',
  '.dylib': 'application/octet-stream'
};

/**
 * Set of MIME types that should be treated as text (not binary).
 */
const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'text/plain',
  'text/html',
  'text/css',
  'text/csv',
  'text/xml',
  'text/markdown',
  'text/yaml',
  'image/svg+xml' // SVG is XML-based text
]);

/**
 * Infer MIME type from file path based on extension.
 *
 * @param filePath - Path to the file
 * @returns Inferred MIME type, or 'application/octet-stream' if unknown
 *
 * @example
 * ```typescript
 * inferMimeType('./data.json'); // 'application/json'
 * inferMimeType('./image.png'); // 'image/png'
 * inferMimeType('./unknown');   // 'application/octet-stream'
 * ```
 */
export function inferMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_MIME_MAP[ext] ?? 'application/octet-stream';
}

/**
 * Determine if a MIME type represents binary content.
 *
 * @param mimeType - The MIME type to check
 * @returns true if binary, false if text
 *
 * @example
 * ```typescript
 * isBinaryMimeType('application/json');        // false
 * isBinaryMimeType('image/png');               // true
 * isBinaryMimeType('application/octet-stream'); // true
 * ```
 */
export function isBinaryMimeType(mimeType: string): boolean {
  // text/* types are text
  if (mimeType.startsWith('text/')) {
    return false;
  }
  // Known text application types
  if (TEXT_MIME_TYPES.has(mimeType)) {
    return false;
  }
  // Everything else is binary
  return true;
}

// ============================================================================
// Path Utilities (runtime-neutral)
// ============================================================================

function sepForPath(p: string): string {
  return p.includes('\\') ? '\\' : '/';
}

function splitParts(p: string): string[] {
  return p.split(/[\\/]+/).filter(Boolean);
}

function isAbsolutePath(p: string): boolean {
  if (p.startsWith('/') || p.startsWith('\\')) return true;
  // Windows drive letters: C:\ or C:/
  if (/^[A-Za-z]:[\\/]/.test(p)) return true;
  // UNC paths: \\server\share
  if (p.startsWith('\\\\')) return true;
  return false;
}

function normalizeJoin(sep: string, parts: string[]): string {
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return (sep === '\\' ? '\\' : '/') + out.join(sep);
}

function resolvePath(basePath: string, relativePath: string): string {
  const sep = sepForPath(basePath);

  const baseIsDrive = /^[A-Za-z]:$/.test(basePath);
  const baseDriveMatch = basePath.match(/^([A-Za-z]:)[\\/]?/);
  const drive = baseDriveMatch?.[1];

  const baseParts = splitParts(basePath);
  const relParts = splitParts(relativePath);

  if (drive) {
    const normalized = normalizeJoin(sep, [...baseParts.slice(1), ...relParts]);
    return `${drive}${normalized}`;
  }

  if (baseIsDrive) {
    const normalized = normalizeJoin(sep, relParts);
    return `${basePath}${normalized}`;
  }

  return normalizeJoin(sep, [...baseParts, ...relParts]);
}

function normalizeBase(basePath: string): string {
  if (basePath === '') return '/';
  const sep = sepForPath(basePath);
  const driveMatch = basePath.match(/^([A-Za-z]:)[\\/]?/);
  const drive = driveMatch?.[1];
  const parts = splitParts(basePath);
  if (drive) {
    const normalized = normalizeJoin(sep, parts.slice(1));
    return `${drive}${normalized}`;
  }
  return normalizeJoin(sep, parts);
}

function extname(p: string): string {
  const base = basename(p);
  const idx = base.lastIndexOf('.');
  if (idx <= 0) return '';
  return base.slice(idx);
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  const last = parts[parts.length - 1];
  return last ?? '';
}

/**
 * Validate that a file path is safe and doesn't escape the base directory.
 *
 * @param filePath - The file path to validate
 * @param basePath - The base directory to constrain paths within
 * @returns The resolved absolute path if valid
 * @throws Error if path is absolute or escapes the base directory
 *
 * @example
 * ```typescript
 * validateFilePath('./data.json', '/app');
 * // Returns '/app/data.json'
 *
 * validateFilePath('../../../etc/passwd', '/app');
 * // Throws: 'Path escapes base directory: ../../../etc/passwd'
 *
 * validateFilePath('/etc/passwd', '/app');
 * // Throws: 'Absolute paths not allowed: /etc/passwd'
 * ```
 */
export function validateFilePath(filePath: string, basePath: string): string {
  // Reject absolute paths
  if (isAbsolutePath(filePath)) {
    throw new Error(`Absolute paths not allowed: ${filePath}`);
  }

  // Resolve and ensure within basePath
  const resolved = resolvePath(basePath, filePath);
  const normalizedBase = normalizeBase(basePath);
  const sep = sepForPath(normalizedBase);

  // Check that resolved path starts with base path
  // Need to handle both exact match and subdirectory cases
  if (resolved !== normalizedBase && !resolved.startsWith(normalizedBase + sep)) {
    throw new Error(`Path escapes base directory: ${filePath}`);
  }

  return resolved;
}

// ============================================================================
// File Loading
// ============================================================================

/**
 * Load a file body for use in HTTP requests.
 *
 * Automatically determines whether to load as text or binary based on
 * the file's MIME type (inferred from extension).
 *
 * @param filePath - Relative path to the file
 * @param options - Options including basePath for path resolution
 * @returns Loaded file content, binary flag, and MIME type
 * @throws Error if path validation fails or file doesn't exist
 *
 * @example
 * ```typescript
 * // Load JSON (text)
 * const jsonFile = await loadFileBody('./data.json', { basePath: '/app' });
 * // { content: '{"key": "value"}', isBinary: false, mimeType: 'application/json' }
 *
 * // Load image (binary)
 * const imageFile = await loadFileBody('./logo.png', { basePath: '/app' });
 * // { content: ArrayBuffer, isBinary: true, mimeType: 'image/png' }
 * ```
 */
export async function loadFileBody(
  filePath: string,
  options: FileLoaderOptions = {}
): Promise<LoadedFile> {
  const basePath =
    options.basePath ??
    options.io?.cwd() ??
    (globalThis as unknown as { process?: { cwd?: () => string } }).process?.cwd?.() ??
    '.';

  // Validate path security
  const resolvedPath = validateFilePath(filePath, basePath);

  // Determine MIME type and binary mode
  const mimeType = inferMimeType(filePath);
  const isBinary = isBinaryMimeType(mimeType);

  let content: string | ArrayBuffer;

  if (options.io) {
    const exists = await options.io.exists(resolvedPath);
    if (!exists) {
      throw new Error(`File not found: ${filePath}`);
    }
    content = isBinary
      ? await options.io.readBinary(resolvedPath)
      : await options.io.readText(resolvedPath);
  } else if (typeof (globalThis as Record<string, unknown>)['Bun'] !== 'undefined') {
    type BunFile = {
      exists: () => Promise<boolean>;
      text: () => Promise<string>;
      arrayBuffer: () => Promise<ArrayBuffer>;
    };
    type BunGlobal = { file: (p: string) => BunFile };

    const bun = (globalThis as unknown as { Bun: BunGlobal }).Bun;
    const file = bun.file(resolvedPath);
    const exists = await file.exists();
    if (!exists) {
      throw new Error(`File not found: ${filePath}`);
    }
    content = isBinary ? await file.arrayBuffer() : await file.text();
  } else {
    throw new Error(
      'No IO adapter provided. Provide `options.io` (Node/Bun/Tauri) to load file bodies.'
    );
  }

  return {
    content,
    isBinary,
    mimeType
  };
}
