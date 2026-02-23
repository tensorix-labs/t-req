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

const REQUEST_LINE_PATTERN = /^([A-Za-z]+)\s+(\S+)(?:\s+HTTP\/\d+(?:\.\d+)?)?\s*$/;
const REQUEST_LINE_PARTS_PATTERN = /^(\s*)([A-Za-z]+)\s+(\S+)(\s+HTTP\/\d+(?:\.\d+)?)?(\s*)$/;
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

function normalizeRows(rows: RequestDetailsRow[]): RequestDetailsRow[] {
  return rows
    .map((row) => ({ key: row.key.trim(), value: row.value }))
    .filter((row) => row.key.length > 0);
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

function preferredLineEnding(lines: LineRecord[]): string {
  return lines.find((line) => line.ending.length > 0)?.ending ?? '\n';
}

function serializeRows(rows: RequestDetailsRow[]): RequestDetailsRow[] {
  return normalizeRows(rows).map((row) => ({
    key: row.key,
    value: row.value
  }));
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

  let headerEndIndex = 0;
  while (headerEndIndex < restLines.length && isHeaderLine(restLines[headerEndIndex]?.text ?? '')) {
    headerEndIndex += 1;
  }

  const remainingLines = restLines.slice(headerEndIndex);
  const normalizedHeaders = serializeRows(nextHeaders);
  const lineEnding = preferredLineEnding(lines);
  const requestLineEnding =
    requestLine.ending ||
    (normalizedHeaders.length > 0 || remainingLines.length > 0 ? lineEnding : '');

  let updatedSegment = `${rebuiltRequestLine}${requestLineEnding}`;
  for (let index = 0; index < normalizedHeaders.length; index += 1) {
    const header = normalizedHeaders[index];
    if (!header) {
      continue;
    }

    const isLastHeader = index === normalizedHeaders.length - 1;
    const ending = isLastHeader
      ? remainingLines.length > 0
        ? lineEnding
        : (restLines[headerEndIndex - 1]?.ending ?? '')
      : lineEnding;
    updatedSegment += `${header.key}${header.value.length > 0 ? `: ${header.value}` : ':'}${ending}`;
  }

  for (const line of remainingLines) {
    updatedSegment += `${line.text}${line.ending}`;
  }

  return {
    ok: true,
    content: updatedSegment
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

export function buildUrlWithParams(url: string, params: RequestDetailsRow[]): string {
  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hashSuffix = hashIndex === -1 ? '' : url.slice(hashIndex);

  const queryIndex = beforeHash.indexOf('?');
  const base = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
  const normalizedParams = normalizeRows(params);
  if (normalizedParams.length === 0) {
    return `${base}${hashSuffix}`;
  }

  const query = normalizedParams
    .map((param) => {
      const key = encodeURIComponent(param.key);
      if (param.value.length === 0) {
        return key;
      }
      return `${key}=${encodeURIComponent(param.value)}`;
    })
    .join('&');

  return `${base}?${query}${hashSuffix}`;
}

export function applyRequestEditsToContent(
  content: string,
  requestIndex: number,
  nextUrl: string,
  nextHeaders: RequestDetailsRow[]
): ApplyRequestEditsResult {
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

  const segment = content.slice(startOffset, endOffset);
  const rewritten = rewriteRequestSegment(segment, nextUrl, nextHeaders);
  if (!rewritten.ok) {
    return rewritten;
  }

  return {
    ok: true,
    content: `${content.slice(0, startOffset)}${rewritten.content}${content.slice(endOffset)}`
  };
}
