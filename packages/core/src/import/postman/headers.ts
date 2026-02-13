import type { PostmanHeader } from '../postman-types';
import { addDisabledDiagnostic, sourcePath } from './diagnostics';
import type { ConvertState } from './state';

function hasHeader(headers: Record<string, string>, headerName: string): boolean {
  const needle = headerName.toLowerCase();
  return Object.keys(headers).some((name) => name.toLowerCase() === needle);
}

export function setHeaderIfMissing(
  headers: Record<string, string>,
  headerName: string,
  value: string
): void {
  if (!hasHeader(headers, headerName)) {
    headers[headerName] = value;
  }
}

export function collectHeaders(
  state: ConvertState,
  sourceParts: string[],
  headers: Array<PostmanHeader | string> | undefined
): Record<string, string> {
  const output: Record<string, string> = {};

  for (const header of headers ?? []) {
    if (typeof header === 'string') {
      const index = header.indexOf(':');
      if (index === -1) {
        continue;
      }
      const key = header.slice(0, index).trim();
      const value = header.slice(index + 1).trim();
      if (key) {
        output[key] = value;
      }
      continue;
    }

    if (header.disabled) {
      addDisabledDiagnostic(state, sourcePath(sourceParts), 'header');
      continue;
    }

    const key = header.key?.trim();
    if (!key) {
      continue;
    }
    output[key] = (header.value ?? '').trim();
  }

  return output;
}
