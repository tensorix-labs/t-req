import type { ParsedRequest as CoreParsedRequest } from '@t-req/core';
import type { BlockInfo } from '../diagnostics';
import type { ParsedRequestBody, ParsedRequestSpans, RequestOffsetSpan } from '../schemas';

const REQUEST_METHOD_PATTERN = /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\b/i;
const REQUEST_LINE_FULL_PATTERN =
  /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s+(\S+)(\s+HTTP\/[\d.]+)?$/i;
const REQUEST_LINE_SIMPLE_PATTERN =
  /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s+(.+)$/i;
const HEADER_LINE_PATTERN = /^([^:]+):\s*(.*)$/;

type LineRecord = {
  text: string;
  start: number;
  end: number;
  fullEnd: number;
};

function toHalfOpenBlockSpan(block: BlockInfo, contentLength: number): RequestOffsetSpan {
  const startOffset = Math.max(0, Math.min(contentLength, block.startOffset));
  const endOffset =
    block.endOffset >= contentLength
      ? contentLength
      : Math.max(startOffset, Math.min(contentLength, block.endOffset + 1));
  return { startOffset, endOffset };
}

function splitLinesWithOffsets(content: string, startOffset: number): LineRecord[] {
  const lines: LineRecord[] = [];
  let offset = 0;

  while (offset < content.length) {
    const lineBreak = content.indexOf('\n', offset);
    if (lineBreak === -1) {
      lines.push({
        text: content.slice(offset),
        start: startOffset + offset,
        end: startOffset + content.length,
        fullEnd: startOffset + content.length
      });
      break;
    }

    const hasCarriageReturn = lineBreak > offset && content[lineBreak - 1] === '\r';
    const textEnd = hasCarriageReturn ? lineBreak - 1 : lineBreak;
    lines.push({
      text: content.slice(offset, textEnd),
      start: startOffset + offset,
      end: startOffset + textEnd,
      fullEnd: startOffset + lineBreak + 1
    });
    offset = lineBreak + 1;
  }

  return lines;
}

function isRequestLine(line: string): boolean {
  return REQUEST_LINE_FULL_PATTERN.test(line) || REQUEST_LINE_SIMPLE_PATTERN.test(line);
}

function getContentType(headers: Record<string, string>): string | undefined {
  const direct = headers['Content-Type'] ?? headers['content-type'];
  if (direct !== undefined) {
    return direct;
  }

  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === 'content-type') {
      return value;
    }
  }

  return undefined;
}

function contentTypeIndicatesJson(contentType: string | undefined): boolean {
  if (!contentType) {
    return false;
  }
  const normalized = contentType.toLowerCase();
  return normalized.includes('/json') || normalized.includes('+json');
}

function bodyLooksLikeJson(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function computeUrlSpan(requestLine: LineRecord): RequestOffsetSpan {
  const fallback = {
    startOffset: requestLine.start,
    endOffset: requestLine.end
  };

  const lineText = requestLine.text;
  const trimmed = lineText.trim();
  const methodMatch = trimmed.match(REQUEST_METHOD_PATTERN);
  if (!methodMatch) {
    return fallback;
  }

  const leadingWhitespace = lineText.length - lineText.trimStart().length;
  let cursor = methodMatch[0].length;
  while (cursor < trimmed.length && /\s/.test(trimmed[cursor] ?? '')) {
    cursor += 1;
  }
  if (cursor >= trimmed.length) {
    return fallback;
  }

  let urlEnd = trimmed.length;
  const versionMatch = trimmed.slice(cursor).match(/\s+HTTP\/[\d.]+\s*$/i);
  if (versionMatch) {
    urlEnd = Math.max(cursor, trimmed.length - versionMatch[0].length);
  }
  while (urlEnd > cursor && /\s/.test(trimmed[urlEnd - 1] ?? '')) {
    urlEnd -= 1;
  }
  if (urlEnd <= cursor) {
    return fallback;
  }

  return {
    startOffset: requestLine.start + leadingWhitespace + cursor,
    endOffset: requestLine.start + leadingWhitespace + urlEnd
  };
}

export function toParsedRequestBody(request: CoreParsedRequest): ParsedRequestBody {
  const contentType = getContentType(request.headers);

  if (request.formData !== undefined && request.formData.length > 0) {
    return {
      kind: 'form-data',
      fields: request.formData.map((field) => ({
        name: field.name,
        value: field.value,
        isFile: field.isFile,
        ...(field.path !== undefined ? { path: field.path } : {}),
        ...(field.filename !== undefined ? { filename: field.filename } : {})
      })),
      ...(contentType !== undefined ? { contentType } : {})
    };
  }

  if (request.bodyFile !== undefined) {
    return {
      kind: 'file',
      path: request.bodyFile.path,
      ...(contentType !== undefined ? { contentType } : {})
    };
  }

  if (request.body !== undefined) {
    return {
      kind: 'inline',
      text: request.body,
      ...(contentType !== undefined ? { contentType } : {}),
      isJsonLike: contentTypeIndicatesJson(contentType) || bodyLooksLikeJson(request.body)
    };
  }

  return { kind: 'none' };
}

export function toParsedRequestSpans(
  content: string,
  blockInfo: BlockInfo | undefined,
  request: CoreParsedRequest
): ParsedRequestSpans | undefined {
  if (!blockInfo) {
    return undefined;
  }

  const blockSpan = toHalfOpenBlockSpan(blockInfo, content.length);
  const blockText = content.slice(blockSpan.startOffset, blockSpan.endOffset);
  const lines = splitLinesWithOffsets(blockText, blockSpan.startOffset);

  let requestLineIndex: number | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    const trimmed = line.text.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      continue;
    }
    if (isRequestLine(trimmed)) {
      requestLineIndex = index;
      break;
    }
  }

  if (requestLineIndex === undefined) {
    return undefined;
  }

  const requestLine = lines[requestLineIndex];
  if (!requestLine) {
    return undefined;
  }

  let bodyStartIndex: number | undefined;
  const headerLineIndexes: number[] = [];
  let inBody = false;

  for (let index = requestLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    const trimmed = line.text.trim();

    if (inBody) {
      continue;
    }

    if (trimmed === '') {
      inBody = true;
      bodyStartIndex = index + 1;
      continue;
    }

    if (HEADER_LINE_PATTERN.test(line.text)) {
      headerLineIndexes.push(index);
    }
  }

  let headersSpan: RequestOffsetSpan | undefined;
  if (headerLineIndexes.length > 0) {
    const firstHeader = lines[headerLineIndexes[0] ?? 0];
    const lastHeader = lines[headerLineIndexes[headerLineIndexes.length - 1] ?? 0];
    if (firstHeader && lastHeader) {
      headersSpan = {
        startOffset: firstHeader.start,
        endOffset: lastHeader.end
      };
    }
  }

  let bodySpan: RequestOffsetSpan | undefined;
  const hasBodyDefinition =
    request.body !== undefined ||
    request.bodyFile !== undefined ||
    (request.formData !== undefined && request.formData.length > 0);
  if (hasBodyDefinition && bodyStartIndex !== undefined && bodyStartIndex < lines.length) {
    let bodyEndIndex = lines.length - 1;
    while (bodyEndIndex >= bodyStartIndex && (lines[bodyEndIndex]?.text.trim() ?? '') === '') {
      bodyEndIndex -= 1;
    }

    const startLine = lines[bodyStartIndex];
    const endLine = lines[bodyEndIndex];
    if (startLine && endLine && bodyEndIndex >= bodyStartIndex) {
      bodySpan = {
        startOffset: startLine.start,
        endOffset: endLine.end
      };
    }
  }

  return {
    block: blockSpan,
    requestLine: {
      startOffset: requestLine.start,
      endOffset: requestLine.end
    },
    url: computeUrlSpan(requestLine),
    ...(headersSpan !== undefined ? { headers: headersSpan } : {}),
    ...(bodySpan !== undefined ? { body: bodySpan } : {})
  };
}
