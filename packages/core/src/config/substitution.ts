import { accessSync, readFileSync, realpathSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// ============================================================================
// Types
// ============================================================================

export type SubstitutionOptions = {
  /**
   * Directory containing the config file (for relative path resolution)
   */
  configDir: string;

  /**
   * Workspace root for security scoping
   */
  workspaceRoot: string;

  /**
   * Allow file reads outside workspace (e.g., ~/.treq/token)
   * Default: false
   */
  allowExternalFiles?: boolean;
};

// ============================================================================
// Token patterns
// ============================================================================

// Matches {env:VAR_NAME}
const ENV_PATTERN = /\{env:([^}]+)\}/g;

// Matches {file:path}
const FILE_PATTERN = /\{file:([^}]+)\}/g;

// ============================================================================
// Path utilities
// ============================================================================

function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function isWithinWorkspace(filePath: string, workspaceRoot: string): boolean {
  const resolvedPath = path.resolve(filePath);
  const resolvedWorkspace = path.resolve(workspaceRoot);

  // Use relative path check
  const rel = path.relative(resolvedWorkspace, resolvedPath);

  // If relative path is empty, it's the workspace root itself
  if (rel === '') return true;

  // If relative path is absolute, it's outside
  if (path.isAbsolute(rel)) return false;

  // If it starts with '..', it's outside
  if (rel.startsWith('..')) return false;

  return true;
}

function realpathSafe(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function fileExists(p: string): boolean {
  try {
    accessSync(p);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Substitution functions
// ============================================================================

function substituteEnvVars(value: string): string {
  return value.replace(ENV_PATTERN, (_, varName: string) => {
    return process.env[varName] ?? '';
  });
}

function substituteFileRefs(value: string, options: SubstitutionOptions): string {
  return value.replace(FILE_PATTERN, (_match, filePath: string) => {
    // Expand ~ to home directory
    let expanded = expandHome(filePath.trim());

    // Resolve relative paths from config directory
    if (!path.isAbsolute(expanded)) {
      expanded = path.resolve(options.configDir, expanded);
    }

    // Check file exists before attempting to resolve symlinks
    if (!fileExists(expanded)) {
      throw new Error(`Config substitution failed: {file:${filePath}} not found at ${expanded}`);
    }

    const workspaceReal = realpathSafe(options.workspaceRoot);
    const fileReal = realpathSafe(expanded);

    // Security check: ensure file is within workspace (unless external files allowed)
    if (!options.allowExternalFiles) {
      if (!isWithinWorkspace(fileReal, workspaceReal)) {
        throw new Error(
          `Config substitution failed: {file:${filePath}} outside workspace ` +
            `(use security.allowExternalFiles to allow)`
        );
      }
    }

    // Read and return file contents with trimEnd
    try {
      const content = readFileSync(fileReal, 'utf-8');
      return content.trimEnd();
    } catch (err) {
      throw new Error(
        `Config substitution failed: {file:${filePath}} could not be read: ` +
          `${err instanceof Error ? err.message : String(err)}`
      );
    }
  });
}

function substituteString(value: string, options: SubstitutionOptions): string {
  // Apply env substitutions first
  let result = substituteEnvVars(value);

  // Then apply file substitutions
  result = substituteFileRefs(result, options);

  return result;
}

// ============================================================================
// Object traversal
// ============================================================================

/**
 * Apply substitutions to all string values in an object/array.
 * Only substitutes within string values, not keys.
 *
 * @param obj - The object to process
 * @param options - Substitution options
 * @returns A new object with substitutions applied
 */
export function applySubstitutions(obj: unknown, options: SubstitutionOptions): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return substituteString(obj, options);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => applySubstitutions(item, options));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Don't substitute keys, only values
      result[key] = applySubstitutions(value, options);
    }
    return result;
  }

  // Primitives (number, boolean) pass through unchanged
  return obj;
}
