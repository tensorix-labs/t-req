import type { ImportDiagnostic } from '../types';

export interface ParsedFormField {
  name: string;
  value: string;
  isFile: boolean;
  path?: string;
}

export interface ParsedCurlCommand {
  method?: string;
  url?: string;
  headers: Record<string, string>;
  dataParts: string[];
  dataUrlEncodedParts: string[];
  formData: ParsedFormField[];
  useGet: boolean;
  diagnostics: ImportDiagnostic[];
}

export interface TokenizeResult {
  tokens: string[];
  diagnostics: ImportDiagnostic[];
}
