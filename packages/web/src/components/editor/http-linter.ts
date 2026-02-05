/**
 * HTTP editor linter for CodeMirror 6.
 * Ports logic from packages/app/src/server/diagnostics.ts for client-side validation.
 */

import { type Diagnostic, linter } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';

// ============================================================================
// Diagnostic Codes
// ============================================================================

export const DiagnosticCodes = {
  UNCLOSED_VARIABLE: 'unclosed-variable',
  EMPTY_VARIABLE: 'empty-variable',
  MISSING_URL: 'missing-url',
  INVALID_METHOD: 'invalid-method',
  DUPLICATE_HEADER: 'duplicate-header',
  MALFORMED_HEADER: 'malformed-header',
  JSON_SYNTAX_ERROR: 'json-syntax-error'
} as const;

// Valid HTTP methods
const VALID_METHODS = new Set([
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'HEAD',
  'OPTIONS',
  'TRACE',
  'CONNECT'
]);

// Common method typos
const METHOD_TYPOS: Record<string, string> = {
  DELTE: 'DELETE',
  DELEET: 'DELETE',
  DELET: 'DELETE',
  PSOT: 'POST',
  POTS: 'POST',
  POSTT: 'POST',
  GTE: 'GET',
  GTT: 'GET',
  GETT: 'GET',
  PUY: 'PUT',
  PUTT: 'PUT',
  PTCH: 'PATCH',
  PTACH: 'PATCH',
  PACTH: 'PATCH',
  OPTINOS: 'OPTIONS',
  OPTOINS: 'OPTIONS'
};

// ============================================================================
// Block Detection
// ============================================================================

type BlockInfo = {
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
};

/**
 * Parse content to identify request blocks (separated by ###)
 */
function parseBlocks(content: string): BlockInfo[] {
  const lines = content.split('\n');
  const blocks: BlockInfo[] = [];
  let blockStartLine = 0;
  let blockStartOffset = 0;
  let currentOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineEnd = currentOffset + line.length;

    if (line.trim().startsWith('###')) {
      if (i > blockStartLine || blockStartOffset < currentOffset) {
        blocks.push({
          startLine: blockStartLine,
          endLine: i - 1,
          startOffset: blockStartOffset,
          endOffset: currentOffset - 1
        });
      }
      blockStartLine = i + 1;
      blockStartOffset = lineEnd + 1;
    }

    currentOffset = lineEnd + 1;
  }

  if (blockStartOffset < content.length) {
    blocks.push({
      startLine: blockStartLine,
      endLine: lines.length - 1,
      startOffset: blockStartOffset,
      endOffset: content.length
    });
  }

  return blocks;
}

// ============================================================================
// Diagnostic Checkers
// ============================================================================

/**
 * Check for unclosed variables: {{ without }}
 */
function checkUnclosedVariables(content: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  let searchStart = 0;

  while (true) {
    const openPos = content.indexOf('{{', searchStart);
    if (openPos === -1) break;

    const afterOpen = content.slice(openPos + 2);
    const closePos = afterOpen.indexOf('}}');
    const nextOpen = afterOpen.indexOf('{{');

    if (closePos === -1 || (nextOpen !== -1 && nextOpen < closePos)) {
      diagnostics.push({
        from: openPos,
        to: openPos + 2,
        severity: 'error',
        message: 'Unclosed variable reference - missing }}',
        source: DiagnosticCodes.UNCLOSED_VARIABLE
      });
    }
    searchStart = openPos + 2;
    if (searchStart >= content.length) break;
  }

  return diagnostics;
}

/**
 * Check for empty variables: {{}}
 */
function checkEmptyVariables(content: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const regex = /\{\{\s*\}\}/g;

  for (const match of content.matchAll(regex)) {
    const index = match.index ?? 0;
    diagnostics.push({
      from: index,
      to: index + match[0].length,
      severity: 'warning',
      message: 'Empty variable reference',
      source: DiagnosticCodes.EMPTY_VARIABLE
    });
  }

  return diagnostics;
}

/**
 * Check for missing URL after method
 */
function checkMissingUrl(content: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = content.split('\n');
  let currentOffset = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('@') || trimmed.includes(':')) {
      currentOffset += line.length + 1;
      continue;
    }

    const methodMatch = trimmed.match(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\b/i);
    if (methodMatch) {
      const afterMethod = trimmed.slice(methodMatch[0].length).trim();
      if (!afterMethod) {
        const methodStart = currentOffset + line.indexOf(methodMatch[0]);
        diagnostics.push({
          from: methodStart,
          to: methodStart + methodMatch[0].length,
          severity: 'error',
          message: `Missing URL after ${methodMatch[0]} method`,
          source: DiagnosticCodes.MISSING_URL
        });
      }
    }

    currentOffset += line.length + 1;
  }

  return diagnostics;
}

/**
 * Check for invalid/typo methods
 */
function checkInvalidMethod(content: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = content.split('\n');
  let currentOffset = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('@')) {
      currentOffset += line.length + 1;
      continue;
    }

    if (/^[\w-]+:\s/.test(trimmed)) {
      currentOffset += line.length + 1;
      continue;
    }

    const wordMatch = trimmed.match(/^([A-Z]{2,10})\s+\S/);
    if (wordMatch) {
      const maybeMethod = wordMatch[1];
      if (maybeMethod && !VALID_METHODS.has(maybeMethod)) {
        const suggestion = METHOD_TYPOS[maybeMethod];
        const methodStart = currentOffset + line.indexOf(maybeMethod);
        diagnostics.push({
          from: methodStart,
          to: methodStart + maybeMethod.length,
          severity: 'warning',
          message: suggestion
            ? `Invalid HTTP method '${maybeMethod}' - did you mean '${suggestion}'?`
            : `Invalid HTTP method '${maybeMethod}'`,
          source: DiagnosticCodes.INVALID_METHOD
        });
      }
    }

    currentOffset += line.length + 1;
  }

  return diagnostics;
}

/**
 * Check for duplicate headers within a request block
 */
function checkDuplicateHeaders(content: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const blocks = parseBlocks(content);

  for (const block of blocks) {
    const blockContent = content.slice(block.startOffset, block.endOffset);
    const blockLines = blockContent.split('\n');
    const headers = new Map<string, { line: number; offset: number }>();
    let lineOffset = block.startOffset;
    let inBody = false;

    for (let i = 0; i < blockLines.length; i++) {
      const line = blockLines[i] ?? '';
      const trimmed = line.trim();

      if (!trimmed) {
        inBody = true;
        lineOffset += line.length + 1;
        continue;
      }

      if (
        inBody ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('@') ||
        /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s/i.test(trimmed)
      ) {
        lineOffset += line.length + 1;
        continue;
      }

      const headerMatch = trimmed.match(/^([^:]+):\s*.*/);
      if (headerMatch) {
        const headerName = headerMatch[1]?.toLowerCase();
        if (headerName) {
          const existing = headers.get(headerName);
          if (existing) {
            const headerStart = lineOffset + (line.indexOf(headerMatch[1] ?? '') || 0);
            diagnostics.push({
              from: headerStart,
              to: headerStart + (headerMatch[1]?.length ?? 0),
              severity: 'warning',
              message: `Duplicate header '${headerMatch[1]}' (first defined on line ${existing.line + 1})`,
              source: DiagnosticCodes.DUPLICATE_HEADER
            });
          } else {
            headers.set(headerName, {
              line: block.startLine + i,
              offset: lineOffset
            });
          }
        }
      }

      lineOffset += line.length + 1;
    }
  }

  return diagnostics;
}

/**
 * Check for malformed headers (missing colon)
 */
function checkMalformedHeaders(content: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const blocks = parseBlocks(content);

  for (const block of blocks) {
    const blockContent = content.slice(block.startOffset, block.endOffset);
    const blockLines = blockContent.split('\n');
    let lineOffset = block.startOffset;
    let inBody = false;
    let sawRequestLine = false;

    for (let i = 0; i < blockLines.length; i++) {
      const line = blockLines[i] ?? '';
      const trimmed = line.trim();

      if (!trimmed) {
        if (sawRequestLine) inBody = true;
        lineOffset += line.length + 1;
        continue;
      }

      if (inBody || trimmed.startsWith('#') || trimmed.startsWith('@')) {
        lineOffset += line.length + 1;
        continue;
      }

      if (/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s/i.test(trimmed)) {
        sawRequestLine = true;
        lineOffset += line.length + 1;
        continue;
      }

      if (sawRequestLine && !trimmed.includes(':')) {
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[') && !trimmed.startsWith('<')) {
          diagnostics.push({
            from: lineOffset,
            to: lineOffset + line.length,
            severity: 'error',
            message: `Malformed header - missing ':' separator`,
            source: DiagnosticCodes.MALFORMED_HEADER
          });
        }
      }

      lineOffset += line.length + 1;
    }
  }

  return diagnostics;
}

/**
 * Check for JSON syntax errors in request body
 */
function checkJsonSyntax(content: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const blocks = parseBlocks(content);

  for (const block of blocks) {
    const blockContent = content.slice(block.startOffset, block.endOffset);
    const blockLines = blockContent.split('\n');
    let lineOffset = block.startOffset;
    let inBody = false;
    let sawRequestLine = false;
    let bodyStart = -1;
    const bodyLines: string[] = [];

    for (let i = 0; i < blockLines.length; i++) {
      const line = blockLines[i] ?? '';
      const trimmed = line.trim();

      if (!inBody) {
        if (!trimmed && sawRequestLine) {
          inBody = true;
          bodyStart = lineOffset + line.length + 1;
        } else if (/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s/i.test(trimmed)) {
          sawRequestLine = true;
        }
      } else {
        bodyLines.push(line);
      }

      lineOffset += line.length + 1;
    }

    if (bodyLines.length > 0 && bodyStart !== -1) {
      const bodyContent = bodyLines.join('\n').trim();
      // Only check if it looks like JSON
      if (bodyContent.startsWith('{') || bodyContent.startsWith('[')) {
        // Replace variables with placeholder values for JSON validation
        const sanitized = bodyContent.replace(/\{\{[^}]*\}\}/g, '"__var__"');
        try {
          JSON.parse(sanitized);
        } catch (e) {
          if (e instanceof SyntaxError) {
            // Extract position from error message if possible
            diagnostics.push({
              from: bodyStart,
              to: Math.min(bodyStart + bodyContent.length, content.length),
              severity: 'error',
              message: `JSON syntax error: ${e.message}`,
              source: DiagnosticCodes.JSON_SYNTAX_ERROR
            });
          }
        }
      }
    }
  }

  return diagnostics;
}

// ============================================================================
// Main Linter
// ============================================================================

/**
 * HTTP linter function for CodeMirror.
 */
function httpLinter(view: EditorView): Diagnostic[] {
  const content = view.state.doc.toString();
  const diagnostics: Diagnostic[] = [];

  diagnostics.push(...checkUnclosedVariables(content));
  diagnostics.push(...checkEmptyVariables(content));
  diagnostics.push(...checkMissingUrl(content));
  diagnostics.push(...checkInvalidMethod(content));
  diagnostics.push(...checkDuplicateHeaders(content));
  diagnostics.push(...checkMalformedHeaders(content));
  diagnostics.push(...checkJsonSyntax(content));

  // Sort by position
  diagnostics.sort((a, b) => a.from - b.from);

  return diagnostics;
}

/**
 * HTTP lint extension for CodeMirror.
 */
export function httpLintExtension() {
  return linter(httpLinter, { delay: 300 });
}
