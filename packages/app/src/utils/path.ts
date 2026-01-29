import { realpathSync as fsRealpathSync, existsSync as nodeExistsSync } from 'node:fs';
import {
  dirname as pathDirname,
  isAbsolute as pathIsAbsolute,
  join as pathJoin,
  resolve as pathResolve,
  sep as pathSep,
  relative
} from 'node:path';

// ============================================================================
// Path Utilities - Using Node.js fs for proper symlink resolution
// ============================================================================

export function dirname(p: string): string {
  return pathDirname(p);
}

export function isAbsolute(p: string): boolean {
  return pathIsAbsolute(p);
}

export function join(...parts: string[]): string {
  return pathJoin(...parts);
}

export function resolve(...parts: string[]): string {
  return pathResolve(...parts);
}

/**
 * Check if child path is contained within parent path.
 */
export function contains(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  // Inside (including exact match)
  if (rel === '') return true;

  // If relative() returns an absolute path (e.g., different drive on Windows), it's not contained.
  if (isAbsolute(rel)) return false;

  // Reject escaping the parent directory.
  // - rel === '..' means direct escape
  // - rel starts with '..' + sep means escape into sibling/parent
  if (rel === '..') return false;
  if (rel.startsWith(`..${pathSep}`)) return false;

  return true;
}

/**
 * Resolves the real path (following symlinks) using Node.js fs.realpathSync.
 * Throws if the path doesn't exist.
 */
export function realpathSync(p: string): string {
  return fsRealpathSync(p);
}

/**
 * Check if a file or directory exists.
 */
export function existsSync(p: string): boolean {
  return nodeExistsSync(p);
}

/**
 * Validates that a requested path is safe to access within a workspace.
 *
 * @param workspaceRoot - The root directory of the workspace
 * @param requestedPath - The path requested by the user (relative to workspace)
 * @returns true if the path is safe to access, false otherwise
 */
export function isPathSafe(workspaceRoot: string, requestedPath: string): boolean {
  // Reject absolute paths
  if (isAbsolute(requestedPath)) {
    return false;
  }

  // Reject traversal segments (segment-aware; allows filenames like "foo..bar.txt")
  // Also reject NUL bytes (defense-in-depth)
  if (requestedPath.includes('\0')) return false;
  const segments = requestedPath.split(/[\\/]+/).filter(Boolean);
  if (segments.some((s) => s === '..')) return false;

  const absolutePath = resolve(workspaceRoot, requestedPath);

  try {
    const realPath = realpathSync(absolutePath);
    const realWorkspace = realpathSync(workspaceRoot);
    return contains(realWorkspace, realPath);
  } catch {
    // File doesn't exist yet, check the parent directory
    const parentDir = dirname(absolutePath);
    try {
      const realParent = realpathSync(parentDir);
      const realWorkspace = realpathSync(workspaceRoot);
      return contains(realWorkspace, realParent);
    } catch {
      return false;
    }
  }
}

/**
 * Find the git root directory starting from a given path.
 */
export function findGitRoot(startPath: string): string | undefined {
  let current = startPath;
  while (current !== dirname(current)) {
    if (existsSync(join(current, '.git'))) {
      return current;
    }
    current = dirname(current);
  }
  return undefined;
}

/**
 * Find the project root (directory containing treq.config.ts/js).
 */
export function findProjectRoot(startPath: string): string {
  let current = startPath;
  while (current !== dirname(current)) {
    const configPath = join(current, 'treq.config.ts');
    if (existsSync(configPath)) {
      return current;
    }
    const jsConfigPath = join(current, 'treq.config.js');
    if (existsSync(jsConfigPath)) {
      return current;
    }
    current = dirname(current);
  }
  return startPath;
}

/**
 * Find the config file path in a project root.
 */
export function findConfigPath(projectRoot: string): string | undefined {
  const tsConfig = join(projectRoot, 'treq.config.ts');
  if (existsSync(tsConfig)) return tsConfig;
  const jsConfig = join(projectRoot, 'treq.config.js');
  if (existsSync(jsConfig)) return jsConfig;
  return undefined;
}

/**
 * Resolve workspace root from an optional override or find git root.
 */
export function resolveWorkspaceRoot(override?: string): string {
  if (override) {
    return resolve(override);
  }
  const gitRoot = findGitRoot(process.cwd());
  return gitRoot ?? process.cwd();
}
