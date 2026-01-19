import { loadFileBody } from './file-loader';
import type { IO } from './runtime/types';
import type { FormField } from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for building form data.
 */
export interface BuildFormDataOptions {
  /**
   * Base path for resolving relative file paths.
   * @default process.cwd()
   */
  basePath?: string;

  /**
   * Optional IO adapter for reading files and path operations.
   */
  io?: IO;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Check if any field in the array is a file upload.
 *
 * @param fields - Array of form fields
 * @returns true if any field is a file upload
 */
export function hasFileFields(fields: FormField[]): boolean {
  return fields.some((field) => field.isFile);
}

// ============================================================================
// Form Data Building
// ============================================================================

/**
 * Build FormData object from form fields.
 * Used for multipart/form-data requests (file uploads).
 *
 * @param fields - Array of form fields
 * @param options - Options including basePath for file resolution
 * @returns FormData ready for use with fetch
 *
 * @example
 * ```typescript
 * const fields: FormField[] = [
 *   { name: 'title', value: 'Report', isFile: false },
 *   { name: 'document', value: '', isFile: true, path: './report.pdf' },
 * ];
 *
 * const formData = await buildFormData(fields, { basePath: '/app' });
 * ```
 */
export async function buildFormData(
  fields: FormField[],
  options: BuildFormDataOptions = {}
): Promise<FormData> {
  const form = new FormData();
  const basePath =
    options.basePath ??
    options.io?.cwd() ??
    (globalThis as unknown as { process?: { cwd?: () => string } }).process?.cwd?.() ??
    '.';

  for (const field of fields) {
    if (field.isFile && field.path) {
      // Load file content
      const loadedFile = await loadFileBody(
        field.path,
        options.io ? { basePath, io: options.io } : { basePath }
      );

      // Determine filename: custom filename if provided, otherwise basename of path
      const filename =
        field.filename ?? options.io?.path.basename(field.path) ?? basename(field.path);

      // Create Blob with appropriate MIME type
      const blob = new Blob([loadedFile.content], { type: loadedFile.mimeType });

      // Append as file
      form.append(field.name, blob, filename);
    } else {
      // Append as text field
      form.append(field.name, field.value);
    }
  }

  return form;
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  const last = parts[parts.length - 1];
  return last ?? '';
}

/**
 * Build URLSearchParams from form fields.
 * Used for application/x-www-form-urlencoded requests.
 *
 * Note: File fields should not be present - use buildFormData for files.
 *
 * @param fields - Array of form fields (should not contain file fields)
 * @returns URLSearchParams ready for use with fetch
 *
 * @example
 * ```typescript
 * const fields: FormField[] = [
 *   { name: 'username', value: 'john', isFile: false },
 *   { name: 'password', value: 'secret', isFile: false },
 * ];
 *
 * const params = buildUrlEncoded(fields);
 * // username=john&password=secret
 * ```
 */
export function buildUrlEncoded(fields: FormField[]): URLSearchParams {
  const params = new URLSearchParams();

  for (const field of fields) {
    // Skip file fields - they can't be URL encoded
    if (field.isFile) {
      continue;
    }
    params.append(field.name, field.value);
  }

  return params;
}
