import { parseDocument } from '@t-req/core';

export function buildValidationVariables(
  content: string,
  resolvedVariables: Record<string, unknown>
): Record<string, unknown> {
  try {
    const parsed = parseDocument(content);
    // Match runtime precedence: file vars are available, but config/profile vars win.
    return { ...parsed.fileVariables, ...resolvedVariables };
  } catch {
    return { ...resolvedVariables };
  }
}
