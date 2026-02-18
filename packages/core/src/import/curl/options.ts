import { z } from 'zod';
import type { ImportDiagnostic } from '../types';
import { createDiagnostic } from './diagnostics';

export interface CurlConvertOptions {
  /** Optional output filename base (without extension). @default "curl-request" */
  fileName?: string;
  /** Optional request name inside the generated .http file. @default "curl request" */
  requestName?: string;
}

export interface ResolvedCurlConvertOptions {
  fileName: string;
  requestName: string;
}

export const CurlConvertOptionsSchema = z.object({
  fileName: z.string().trim().min(1).optional(),
  requestName: z.string().trim().min(1).optional()
});

export type ResolveCurlOptionsResult =
  | { ok: true; value: ResolvedCurlConvertOptions }
  | { ok: false; diagnostics: ImportDiagnostic[] };

export function resolveCurlConvertOptions(
  options: CurlConvertOptions | undefined
): ResolveCurlOptionsResult {
  const parsed = CurlConvertOptionsSchema.safeParse(options ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      diagnostics: [
        createDiagnostic(
          'invalid-options',
          'error',
          issue ? `${issue.path.join('.') || 'options'}: ${issue.message}` : 'Invalid curl options.'
        )
      ]
    };
  }

  return {
    ok: true,
    value: {
      fileName: parsed.data.fileName ?? 'curl-request',
      requestName: parsed.data.requestName ?? 'curl request'
    }
  };
}
