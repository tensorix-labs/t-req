import type { SerializableDocument } from '../serializer';

/**
 * A diagnostic emitted during import.
 * Source-agnostic — works for Postman, OpenAPI, curl, or any future importer.
 */
export interface ImportDiagnostic {
  /** Machine-readable code: 'unsupported-auth', 'script-ignored', 'missing-file', etc. */
  code: string;
  /** Severity level */
  severity: 'info' | 'warning' | 'error';
  /** Human-readable message */
  message: string;
  /** Path within the source format (e.g. "My Collection / Auth / Login") */
  sourcePath?: string;
  /** Structured details for programmatic consumption (optional) */
  details?: Record<string, unknown>;
}

/** A single file to be created during import. */
export interface ImportFile {
  /** Relative path from output root (e.g. "users/list-users.http") */
  relativePath: string;
  /** The serializable document for this file */
  document: SerializableDocument;
}

/** Summary stats for consistent UX across surfaces. */
export interface ImportStats {
  requestCount: number;
  fileCount: number;
  diagnosticCount: number;
}

/**
 * The result of converting an external format into t-req's structure.
 * Every importer returns this. Surfaces consume it uniformly.
 */
export interface ImportResult {
  /** Collection/project name */
  name: string;
  /** Files to write */
  files: ImportFile[];
  /** Variables to potentially add to treq config */
  variables: Record<string, unknown>;
  /** Diagnostics (warnings, errors, info) from conversion */
  diagnostics: ImportDiagnostic[];
  /** Summary stats for consistent UX across surfaces */
  stats: ImportStats;
}

export interface Importer<TOptions = unknown> {
  /** Unique source identifier: 'postman', 'openapi', 'curl' */
  source: string;
  /**
   * Zod schema for validating source-specific options.
   * Runtime schema value is passed at registration.
   */
  optionsSchema?: import('zod').ZodType<TOptions>;
  /** Convert raw input to ImportResult */
  convert(input: string, options?: TOptions): ImportResult;
}

export interface ImporterRegistry {
  register(importer: Importer): void;
  get(source: string): Importer | undefined;
  sources(): string[];
}
