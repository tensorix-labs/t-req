import { parse, parseDocument } from '@t-req/core';
import type * as vscode from 'vscode';
import type { DocumentRequest } from './execution/types';

const FILE_VARIABLE_PATTERN = /^@([A-Za-z_][\w.]*)\s*=\s*(.+)$/;
const METHOD_PATTERN = /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\b/i;

type ParsedDocumentInfo = {
  requests: DocumentRequest[];
  fileVariables: Record<string, string>;
};

type BlockInfo = {
  startLine: number;
  endLine: number;
  lines: string[];
};

function toLineArray(content: string): string[] {
  return content.split(/\r?\n/);
}

function stripFileVariables(content: string): {
  cleanedLines: string[];
  cleanToOriginalLine: number[];
} {
  const lines = toLineArray(content);
  const cleanedLines: string[] = [];
  const cleanToOriginalLine: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trim().match(FILE_VARIABLE_PATTERN)) {
      continue;
    }
    cleanToOriginalLine.push(i);
    cleanedLines.push(line);
  }

  return { cleanedLines, cleanToOriginalLine };
}

function parseBlocks(cleanedLines: string[]): BlockInfo[] {
  const blocks: BlockInfo[] = [];
  let currentStart = 0;

  for (let i = 0; i < cleanedLines.length; i++) {
    const line = cleanedLines[i] ?? '';
    if (line.match(/^###\s*(.*)$/)) {
      if (i > currentStart) {
        blocks.push({
          startLine: currentStart,
          endLine: i - 1,
          lines: cleanedLines.slice(currentStart, i)
        });
      }
      currentStart = i + 1;
    }
  }

  if (currentStart < cleanedLines.length) {
    blocks.push({
      startLine: currentStart,
      endLine: cleanedLines.length - 1,
      lines: cleanedLines.slice(currentStart)
    });
  }

  return blocks;
}

function findMethodLine(block: BlockInfo): number {
  for (let i = 0; i < block.lines.length; i++) {
    const line = block.lines[i] ?? '';
    if (METHOD_PATTERN.test(line.trim())) {
      return block.startLine + i;
    }
  }
  return block.startLine;
}

export function parseDocumentRequests(content: string): ParsedDocumentInfo {
  const parsed = parseDocument(content);
  const { cleanedLines, cleanToOriginalLine } = stripFileVariables(content);
  const blocks = parseBlocks(cleanedLines);

  const requests: DocumentRequest[] = [];
  let requestIndex = 0;

  for (const block of blocks) {
    const rawBlock = block.lines.join('\n');
    const parsedBlock = parse(rawBlock);
    if (parsedBlock.length === 0) {
      continue;
    }

    const req = parsed.requests[requestIndex];
    const parsedReq = parsedBlock[0];
    if (!req || !parsedReq) {
      continue;
    }

    const methodLineInClean = findMethodLine(block);
    const methodLine = cleanToOriginalLine[methodLineInClean] ?? 0;
    const startLine = cleanToOriginalLine[block.startLine] ?? methodLine;
    const endLine = cleanToOriginalLine[block.endLine] ?? methodLine;

    requests.push({
      index: requestIndex,
      name: req.name,
      method: req.method,
      url: req.url,
      startLine,
      methodLine,
      endLine,
      raw: req.raw,
      protocol: req.protocol
    });

    requestIndex += 1;
  }

  return {
    requests,
    fileVariables: parsed.fileVariables
  };
}

export function findNearestRequestIndex(
  requests: DocumentRequest[],
  line: number
): number | undefined {
  if (requests.length === 0) {
    return undefined;
  }

  const containing = requests.find((req) => line >= req.startLine && line <= req.endLine);
  if (containing) {
    return containing.index;
  }

  const sorted = [...requests].sort(
    (a, b) => Math.abs(a.methodLine - line) - Math.abs(b.methodLine - line)
  );
  return sorted[0]?.index;
}

export function parseEditorDocument(document: vscode.TextDocument): ParsedDocumentInfo {
  return parseDocumentRequests(document.getText());
}
