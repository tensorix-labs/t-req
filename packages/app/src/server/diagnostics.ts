import type { Diagnostic } from './schemas';

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
  FILE_REFERENCE_NOT_FOUND: 'file-reference-not-found',
  FORM_FILE_NOT_FOUND: 'form-file-not-found'
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
// Position Tracking
// ============================================================================

type Position = { line: number; column: number };

export function getLinePositions(content: string): number[] {
  const positions: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      positions.push(i + 1);
    }
  }
  return positions;
}

function offsetToPosition(offset: number, linePositions: number[]): Position {
  let line = 0;
  for (let i = 0; i < linePositions.length; i++) {
    const lineStart = linePositions[i];
    if (lineStart === undefined) continue;
    if (lineStart > offset) break;
    line = i;
  }
  const lineStart = linePositions[line] ?? 0;
  return { line, column: offset - lineStart };
}

function createRange(
  startOffset: number,
  endOffset: number,
  linePositions: number[]
): Diagnostic['range'] {
  return {
    start: offsetToPosition(startOffset, linePositions),
    end: offsetToPosition(endOffset, linePositions)
  };
}

// ============================================================================
// Block Detection
// ============================================================================

export type BlockInfo = {
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
};

/**
 * Parse content to identify request blocks (separated by ###)
 */
export function parseBlocks(content: string): BlockInfo[] {
  const lines = content.split('\n');
  const blocks: BlockInfo[] = [];
  let blockStartLine = 0;
  let blockStartOffset = 0;
  let currentOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineEnd = currentOffset + line.length;

    // Check if this line is a separator (###)
    if (line.trim().startsWith('###')) {
      // End previous block (if any content exists)
      if (i > blockStartLine || blockStartOffset < currentOffset) {
        blocks.push({
          startLine: blockStartLine,
          endLine: i - 1,
          startOffset: blockStartOffset,
          endOffset: currentOffset - 1
        });
      }
      // Start new block after separator
      blockStartLine = i + 1;
      blockStartOffset = lineEnd + 1;
    }

    currentOffset = lineEnd + 1; // +1 for newline
  }

  // Add final block
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
// Diagnostic Analyzers
// ============================================================================

/**
 * Check for unclosed variables: {{ without }}
 */
function checkUnclosedVariables(content: string, linePositions: number[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // More precise check - find {{ and verify there's a matching }}
  let searchStart = 0;
  while (true) {
    const nextOpenAbs = content.indexOf('{{', searchStart);
    if (nextOpenAbs === -1) break;

    const absPos = nextOpenAbs;
    const afterOpen = content.slice(absPos + 2);
    const closePos = afterOpen.indexOf('}}');
    const nextOpen = afterOpen.indexOf('{{');

    // Unclosed if no }} found, or if another {{ comes before }}
    if (closePos === -1 || (nextOpen !== -1 && nextOpen < closePos)) {
      diagnostics.push({
        severity: 'error',
        code: DiagnosticCodes.UNCLOSED_VARIABLE,
        message: 'Unclosed variable reference - missing }}',
        range: createRange(absPos, absPos + 2, linePositions)
      });
    }
    searchStart = absPos + 2;
    if (searchStart >= content.length) break;
  }

  return diagnostics;
}

/**
 * Check for empty variables: {{}}
 */
function checkEmptyVariables(content: string, linePositions: number[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const regex = /\{\{\s*\}\}/g;
  let match: RegExpExecArray | null = regex.exec(content);
  while (match !== null) {
    diagnostics.push({
      severity: 'warning',
      code: DiagnosticCodes.EMPTY_VARIABLE,
      message: 'Empty variable reference',
      range: createRange(match.index, match.index + match[0].length, linePositions)
    });
    match = regex.exec(content);
  }

  return diagnostics;
}

/**
 * Check for missing URL after method
 */
function checkMissingUrl(content: string, linePositions: number[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = content.split('\n');
  let currentOffset = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments, separators, headers, and metadata
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('@') || trimmed.includes(':')) {
      currentOffset += line.length + 1;
      continue;
    }

    // Check if line looks like a request line (starts with HTTP method)
    const methodMatch = trimmed.match(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\b/i);
    if (methodMatch) {
      const afterMethod = trimmed.slice(methodMatch[0].length).trim();
      // If nothing after the method, or just whitespace
      if (!afterMethod) {
        const methodStart = currentOffset + line.indexOf(methodMatch[0]);
        diagnostics.push({
          severity: 'error',
          code: DiagnosticCodes.MISSING_URL,
          message: `Missing URL after ${methodMatch[0]} method`,
          range: createRange(methodStart, methodStart + methodMatch[0].length, linePositions)
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
function checkInvalidMethod(content: string, linePositions: number[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = content.split('\n');
  let currentOffset = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines, comments, separators, and metadata
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('@')) {
      currentOffset += line.length + 1;
      continue;
    }

    // Check if line looks like a header (word followed by colon at the start)
    // Headers are like "Content-Type: value", not "METHOD url"
    if (/^[\w-]+:\s/.test(trimmed)) {
      currentOffset += line.length + 1;
      continue;
    }

    // Check if line starts with what looks like a method followed by URL/path
    const wordMatch = trimmed.match(/^([A-Z]{2,10})\s+\S/);
    if (wordMatch) {
      const maybeMethod = wordMatch[1];
      if (maybeMethod && !VALID_METHODS.has(maybeMethod)) {
        const suggestion = METHOD_TYPOS[maybeMethod];
        const methodStart = currentOffset + line.indexOf(maybeMethod);
        diagnostics.push({
          severity: 'warning',
          code: DiagnosticCodes.INVALID_METHOD,
          message: suggestion
            ? `Invalid HTTP method '${maybeMethod}' - did you mean '${suggestion}'?`
            : `Invalid HTTP method '${maybeMethod}'`,
          range: createRange(methodStart, methodStart + maybeMethod.length, linePositions)
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
function checkDuplicateHeaders(content: string, linePositions: number[]): Diagnostic[] {
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

      // Empty line marks start of body
      if (!trimmed) {
        inBody = true;
        lineOffset += line.length + 1;
        continue;
      }

      // Skip if we're in body, or if it's a comment/separator/request line
      if (
        inBody ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('@') ||
        /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s/i.test(trimmed)
      ) {
        lineOffset += line.length + 1;
        continue;
      }

      // Check for header pattern: Name: Value
      const headerMatch = trimmed.match(/^([^:]+):\s*.*/);
      if (headerMatch) {
        const headerName = headerMatch[1]?.toLowerCase();
        if (headerName) {
          const existing = headers.get(headerName);
          if (existing) {
            const headerStart = lineOffset + (line.indexOf(headerMatch[1] ?? '') || 0);
            diagnostics.push({
              severity: 'warning',
              code: DiagnosticCodes.DUPLICATE_HEADER,
              message: `Duplicate header '${headerMatch[1]}' (first defined on line ${existing.line + 1})`,
              range: createRange(
                headerStart,
                headerStart + (headerMatch[1]?.length ?? 0),
                linePositions
              )
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
function checkMalformedHeaders(content: string, linePositions: number[]): Diagnostic[] {
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

      // Empty line marks start of body
      if (!trimmed) {
        if (sawRequestLine) inBody = true;
        lineOffset += line.length + 1;
        continue;
      }

      // Skip body, comments, separators, metadata
      if (inBody || trimmed.startsWith('#') || trimmed.startsWith('@')) {
        lineOffset += line.length + 1;
        continue;
      }

      // Check for request line
      if (/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s/i.test(trimmed)) {
        sawRequestLine = true;
        lineOffset += line.length + 1;
        continue;
      }

      // After request line, non-empty lines should be headers (have colon)
      if (sawRequestLine && !trimmed.includes(':')) {
        // Could be a continuation of URL or body marker - skip if looks like data
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[') && !trimmed.startsWith('<')) {
          diagnostics.push({
            severity: 'error',
            code: DiagnosticCodes.MALFORMED_HEADER,
            message: `Malformed header - missing ':' separator`,
            range: createRange(lineOffset, lineOffset + line.length, linePositions)
          });
        }
      }

      lineOffset += line.length + 1;
    }
  }

  return diagnostics;
}

// ============================================================================
// Main Analyzer
// ============================================================================

export type AnalyzeOptions = {
  includeDiagnostics?: boolean;
};

/**
 * Analyze parsed content and return all diagnostics
 */
export function analyzeParsedContent(content: string, options: AnalyzeOptions = {}): Diagnostic[] {
  if (options.includeDiagnostics === false) {
    return [];
  }

  const linePositions = getLinePositions(content);
  const diagnostics: Diagnostic[] = [];

  // Run all checks
  diagnostics.push(...checkUnclosedVariables(content, linePositions));
  diagnostics.push(...checkEmptyVariables(content, linePositions));
  diagnostics.push(...checkMissingUrl(content, linePositions));
  diagnostics.push(...checkInvalidMethod(content, linePositions));
  diagnostics.push(...checkDuplicateHeaders(content, linePositions));
  diagnostics.push(...checkMalformedHeaders(content, linePositions));

  // Sort by position
  diagnostics.sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) {
      return a.range.start.line - b.range.start.line;
    }
    return a.range.start.column - b.range.start.column;
  });

  return diagnostics;
}

/**
 * Filter diagnostics to those within a specific block
 */
export function getDiagnosticsForBlock(diagnostics: Diagnostic[], block: BlockInfo): Diagnostic[] {
  return diagnostics.filter((d) => {
    const line = d.range.start.line;
    return line >= block.startLine && line <= block.endLine;
  });
}
