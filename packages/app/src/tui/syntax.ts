import { SyntaxStyle } from '@opentui/core';
import { theme } from './theme';

/** General-purpose syntax rules — works for any tree-sitter grammar */
export const syntaxStyle = SyntaxStyle.fromTheme([
  { scope: ['string'], style: { foreground: theme.success } },
  { scope: ['number'], style: { foreground: theme.primary } },
  { scope: ['constant.builtin', 'boolean'], style: { foreground: theme.accent } },
  { scope: ['keyword'], style: { foreground: theme.accent, italic: true } },
  { scope: ['punctuation.bracket'], style: { foreground: theme.textMuted } },
  { scope: ['punctuation.delimiter'], style: { foreground: theme.textMuted } }
]);

/**
 * Detect the tree-sitter filetype from an HTTP content-type header.
 * Returns undefined for unsupported/unknown types (renders as plain text).
 */
export function detectFiletype(contentType?: string, content?: string): string | undefined {
  const ct = contentType?.toLowerCase();
  if (ct?.includes('application/json') || ct?.includes('+json')) return 'json';

  // No content-type — sniff JSON from content
  if (!ct && content) {
    const trimmed = content.trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        JSON.parse(content);
        return 'json';
      } catch {
        /* not json */
      }
    }
  }
  return undefined;
}
