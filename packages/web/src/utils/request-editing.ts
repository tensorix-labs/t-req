import type { RequestDetailsRow } from './request-details';

export type ApplyRequestEditsResult =
  | {
      ok: true;
      content: string;
    }
  | {
      ok: false;
      error: string;
    };

type LineRecord = {
  text: string;
  ending: string;
  start: number;
};

type RequestSegmentResult =
  | {
      ok: true;
      startOffset: number;
      endOffset: number;
      segment: string;
    }
  | {
      ok: false;
      error: string;
    };

const REQUEST_LINE_PATTERN =
  /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s+(\S+)(?:\s+HTTP\/\d+(?:\.\d+)?)?\s*$/i;
const REQUEST_LINE_PARTS_PATTERN =
  /^(\s*)(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s+(\S+)(\s+HTTP\/\d+(?:\.\d+)?)?(\s*)$/i;
const HEADER_LINE_PATTERN = /^\s*[^:\s][^:]*:.*$/;

function splitLines(content: string): LineRecord[] {
  const lines: LineRecord[] = [];
  let offset = 0;

  while (offset < content.length) {
    const lineBreak = content.indexOf('\n', offset);
    if (lineBreak === -1) {
      lines.push({
        text: content.slice(offset),
        ending: '',
        start: offset
      });
      break;
    }

    const hasCarriageReturn = lineBreak > offset && content[lineBreak - 1] === '\r';
    const textEnd = hasCarriageReturn ? lineBreak - 1 : lineBreak;
    lines.push({
      text: content.slice(offset, textEnd),
      ending: hasCarriageReturn ? '\r\n' : '\n',
      start: offset
    });
    offset = lineBreak + 1;
  }

  return lines;
}

function isRequestLineCandidate(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('@')) {
    return false;
  }
  return REQUEST_LINE_PATTERN.test(trimmed);
}

function isHeaderLine(line: string): boolean {
  return HEADER_LINE_PATTERN.test(line);
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('#') || trimmed.startsWith('//');
}

function isHeaderSectionLine(line: string): boolean {
  return isHeaderLine(line) || isCommentLine(line);
}

function isUrlContinuationLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('?') || trimmed.startsWith('&');
}

function preferredLineEnding(lines: LineRecord[]): string {
  return lines.find((line) => line.ending.length > 0)?.ending ?? '\n';
}

function normalizeRows(rows: RequestDetailsRow[]): RequestDetailsRow[] {
  return rows
    .map((row) => ({ key: row.key.trim(), value: row.value.trim() }))
    .filter((row) => row.key.length > 0);
}

function serializeRows(rows: RequestDetailsRow[]): RequestDetailsRow[] {
  return normalizeRows(rows);
}

function toHeaderLineText(header: RequestDetailsRow): string {
  return `${header.key}${header.value.length > 0 ? `: ${header.value}` : ':'}`;
}

function buildRewrittenHeaderLines(
  headerSectionLines: LineRecord[],
  normalizedHeaders: RequestDetailsRow[]
): Array<{ text: string }> {
  const rewrittenLines: Array<{ text: string }> = [];
  let headerIndex = 0;

  for (const line of headerSectionLines) {
    if (isCommentLine(line.text)) {
      rewrittenLines.push({ text: line.text });
      continue;
    }

    if (!isHeaderLine(line.text)) {
      continue;
    }

    const nextHeader = normalizedHeaders[headerIndex];
    if (!nextHeader) {
      continue;
    }

    rewrittenLines.push({ text: toHeaderLineText(nextHeader) });
    headerIndex += 1;
  }

  while (headerIndex < normalizedHeaders.length) {
    const nextHeader = normalizedHeaders[headerIndex];
    if (!nextHeader) {
      break;
    }
    rewrittenLines.push({ text: toHeaderLineText(nextHeader) });
    headerIndex += 1;
  }

  return rewrittenLines;
}

function rewriteRequestSegment(
  segment: string,
  nextUrl: string,
  nextHeaders: RequestDetailsRow[]
): ApplyRequestEditsResult {
  const lines = splitLines(segment);
  const requestLine = lines[0];
  if (!requestLine) {
    return {
      ok: false,
      error: 'Selected request content is empty.'
    };
  }

  const requestMatch = requestLine.text.match(REQUEST_LINE_PARTS_PATTERN);
  if (!requestMatch) {
    return {
      ok: false,
      error: 'Unable to locate request line for selected request.'
    };
  }

  const [, indent, method, , suffix = '', trailing = ''] = requestMatch;
  const rebuiltRequestLine = `${indent}${method} ${nextUrl}${suffix}${trailing}`;
  const restLines = lines.slice(1);

  // URL continuation lines immediately after the request line are folded by parser.
  // Drop them from the rewritten segment to avoid duplicate/malformed URLs.
  let continuationEndIndex = 0;
  while (
    continuationEndIndex < restLines.length &&
    isUrlContinuationLine(restLines[continuationEndIndex]?.text ?? '')
  ) {
    continuationEndIndex += 1;
  }

  const requestDetailLines = restLines.slice(continuationEndIndex);
  let headerEndIndex = 0;
  while (
    headerEndIndex < requestDetailLines.length &&
    isHeaderSectionLine(requestDetailLines[headerEndIndex]?.text ?? '')
  ) {
    headerEndIndex += 1;
  }

  const headerSectionLines = requestDetailLines.slice(0, headerEndIndex);
  const remainingLines = requestDetailLines.slice(headerEndIndex);
  const normalizedHeaders = serializeRows(nextHeaders);
  const lineEnding = preferredLineEnding(lines);
  const requestLineEnding =
    requestLine.ending ||
    (normalizedHeaders.length > 0 || remainingLines.length > 0 ? lineEnding : '');

  let updatedSegment = `${rebuiltRequestLine}${requestLineEnding}`;
  const combinedHeaderLines = buildRewrittenHeaderLines(headerSectionLines, normalizedHeaders);

  for (let index = 0; index < combinedHeaderLines.length; index += 1) {
    const line = combinedHeaderLines[index];
    if (!line) {
      continue;
    }

    const isLastLine = index === combinedHeaderLines.length - 1;
    const ending = isLastLine
      ? remainingLines.length > 0
        ? lineEnding
        : headerEndIndex > 0
          ? (requestDetailLines[headerEndIndex - 1]?.ending ?? '')
          : ''
      : lineEnding;

    updatedSegment += `${line.text}${ending}`;
  }

  for (const line of remainingLines) {
    updatedSegment += `${line.text}${line.ending}`;
  }

  return {
    ok: true,
    content: updatedSegment
  };
}

function findRequestSegment(content: string, requestIndex: number): RequestSegmentResult {
  const lines = splitLines(content);
  const requestLineIndexes = lines.flatMap((line, index) =>
    isRequestLineCandidate(line.text) ? [index] : []
  );

  if (requestIndex < 0 || requestIndex >= requestLineIndexes.length) {
    return {
      ok: false,
      error: `Request #${requestIndex + 1} could not be located in file content.`
    };
  }

  const startLineIndex = requestLineIndexes[requestIndex];
  if (startLineIndex === undefined) {
    return {
      ok: false,
      error: 'Selected request line was not found.'
    };
  }

  const nextLineIndex = requestLineIndexes[requestIndex + 1];
  const startOffset = lines[startLineIndex]?.start ?? 0;
  const endOffset =
    nextLineIndex !== undefined ? (lines[nextLineIndex]?.start ?? content.length) : content.length;

  return {
    ok: true,
    startOffset,
    endOffset,
    segment: content.slice(startOffset, endOffset)
  };
}

export function cloneRequestRows(rows: RequestDetailsRow[]): RequestDetailsRow[] {
  return rows.map((row) => ({ key: row.key, value: row.value }));
}

export function areRequestRowsEqual(
  first: RequestDetailsRow[],
  second: RequestDetailsRow[]
): boolean {
  if (first.length !== second.length) {
    return false;
  }

  for (let index = 0; index < first.length; index += 1) {
    const firstRow = first[index];
    const secondRow = second[index];
    if (!firstRow || !secondRow) {
      return false;
    }
    if (firstRow.key !== secondRow.key || firstRow.value !== secondRow.value) {
      return false;
    }
  }

  return true;
}

export function applyRequestEditsToContent(
  content: string,
  requestIndex: number,
  nextUrl: string,
  nextHeaders: RequestDetailsRow[]
): ApplyRequestEditsResult {
  const requestSegment = findRequestSegment(content, requestIndex);
  if (!requestSegment.ok) {
    return requestSegment;
  }

  const rewritten = rewriteRequestSegment(requestSegment.segment, nextUrl, nextHeaders);
  if (!rewritten.ok) {
    return rewritten;
  }

  return {
    ok: true,
    content: `${content.slice(0, requestSegment.startOffset)}${rewritten.content}${content.slice(requestSegment.endOffset)}`
  };
}
