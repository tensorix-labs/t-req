import { type PluginDiagnostic, parse } from '@t-req/core';
import {
  type AssertDiagnosticCode,
  type AssertLineOccurrence,
  REQUEST_LINE_PATTERN
} from '../domain/types';

type RequestBlock = {
  startLine: number;
  lines: string[];
};

function splitRequestBlocks(content: string): RequestBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: RequestBlock[] = [];

  let currentStartLine = 0;
  let currentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const separatorMatch = line.match(/^###\s*(.*)$/);

    if (separatorMatch) {
      blocks.push({ startLine: currentStartLine, lines: currentLines });
      currentStartLine = i + 1;
      currentLines = [];
      continue;
    }

    currentLines.push(line);
  }

  blocks.push({ startLine: currentStartLine, lines: currentLines });
  return blocks;
}

function collectValidDirectiveLines(content: string, directiveName: string): Set<number> {
  const validLines = new Set<number>();

  for (const block of splitRequestBlocks(content)) {
    const parsed = parse(block.lines.join('\n'));

    for (const request of parsed) {
      for (const directive of request.directives ?? []) {
        if (directive.name !== directiveName) continue;
        validLines.add(block.startLine + directive.line);
      }
    }
  }

  return validLines;
}

export function makeDiagnostic(
  line: number,
  startColumn: number,
  endColumn: number,
  code: AssertDiagnosticCode,
  message: string
): PluginDiagnostic {
  return {
    severity: 'error',
    code,
    message,
    range: {
      start: { line, column: startColumn },
      end: { line, column: Math.max(startColumn + 1, endColumn) }
    }
  };
}

export function scanAssertLines(content: string, directiveName: string): AssertLineOccurrence[] {
  const lines = content.split(/\r?\n/);
  const validDirectiveLines = collectValidDirectiveLines(content, directiveName);
  const occurrences: AssertLineOccurrence[] = [];

  let blockLine = 0;
  let requestLineInBlock: number | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const separatorMatch = line.match(/^###\s*(.*)$/);

    if (separatorMatch) {
      blockLine = 0;
      requestLineInBlock = undefined;
      continue;
    }

    const trimmed = line.trim();
    if (requestLineInBlock === undefined && REQUEST_LINE_PATTERN.test(trimmed)) {
      requestLineInBlock = blockLine;
    }

    const match = line.match(/^\s*(#|\/\/)\s*@([\w-]+)\s*(.*)$/);
    if (match) {
      const name = match[2];
      if (name === directiveName) {
        const directiveColumn = line.indexOf(`@${directiveName}`);
        const trailing = match[3] ?? '';
        const expression = trailing.trim();
        const expressionColumn =
          line.length - trailing.length + (trailing.length - trailing.trimStart().length);

        const afterRequestCandidate =
          requestLineInBlock !== undefined && blockLine > requestLineInBlock;

        occurrences.push({
          line: i,
          directiveColumn: directiveColumn === -1 ? 0 : directiveColumn,
          expressionColumn,
          expression,
          afterRequestLine: afterRequestCandidate && !validDirectiveLines.has(i)
        });
      }
    }

    blockLine++;
  }

  return occurrences;
}
