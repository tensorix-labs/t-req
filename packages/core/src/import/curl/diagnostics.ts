import type { ImportDiagnostic, ImportResult } from '../types';

const CURL_IMPORT_NAME = 'curl-import';

export function createDiagnostic(
  code: string,
  severity: ImportDiagnostic['severity'],
  message: string,
  details?: Record<string, unknown>
): ImportDiagnostic {
  return details === undefined ? { code, severity, message } : { code, severity, message, details };
}

export function failureResult(diagnostics: ImportDiagnostic[]): ImportResult {
  return {
    name: CURL_IMPORT_NAME,
    files: [],
    variables: {},
    diagnostics,
    stats: {
      requestCount: 0,
      fileCount: 0,
      diagnosticCount: diagnostics.length
    }
  };
}

export const CURL_IMPORT_RESULT_NAME = CURL_IMPORT_NAME;
