import type { IO } from './runtime/types';
import type {
  FileReference,
  FormField,
  ParsedRequest,
  Protocol,
  ProtocolOptions,
  SSEOptions
} from './types';
import { setOptional } from './utils/optional';

// Pattern to match form field lines: name = value or name=value
const FORM_LINE_PATTERN = /^([^=]+?)\s*=\s*(.*)$/;

/**
 * Check if body content matches form data syntax.
 * All non-empty lines must match the `name = value` pattern.
 *
 * This detects our friendly form syntax (multiline, spaces around =):
 *   username = john
 *   password = secret
 *
 * NOT traditional URL-encoded format (single line, & separators):
 *   username=john&password=secret
 */
function isFormBody(body: string, contentType?: string): boolean {
  // Explicit non-form Content-Type → not form
  if (
    contentType &&
    !contentType.includes('form-data') &&
    !contentType.includes('x-www-form-urlencoded')
  ) {
    return false;
  }

  // Empty body is not form
  const lines = body.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return false;

  // Single line with & is traditional URL-encoded format, not our form syntax
  if (lines.length === 1 && lines[0]?.includes('&')) {
    return false;
  }

  // All lines must match form pattern
  return lines.every((line) => FORM_LINE_PATTERN.test(line));
}

/**
 * Parse form body into FormField array.
 */
function parseFormBody(body: string): FormField[] {
  const fields: FormField[] = [];
  const lines = body.split(/\r?\n/).filter((l) => l.trim());

  for (const line of lines) {
    const match = line.match(FORM_LINE_PATTERN);
    if (!match) continue;

    const nameRaw = match[1];
    const valueRaw = match[2];
    if (!nameRaw) continue;

    const name = nameRaw.trim();
    let value = (valueRaw ?? '').trim();

    // File reference: @./ or @{{ for variable paths
    const isFile = value.startsWith('@./') || value.startsWith('@{{');

    if (isFile) {
      // Remove @ prefix
      value = value.slice(1);

      // Check for custom filename: @./path | filename
      let filePath = value;
      let filename: string | undefined;

      const pipeIndex = value.indexOf(' | ');
      if (pipeIndex !== -1) {
        filePath = value.slice(0, pipeIndex).trim();
        filename = value.slice(pipeIndex + 3).trim();
      }

      fields.push(
        setOptional<FormField>({
          name,
          value: '',
          isFile: true,
          path: filePath
        })
          .ifDefined('filename', filename)
          .build()
      );
    } else {
      fields.push({ name, value, isFile: false });
    }
  }

  return fields;
}

/**
 * Detect protocol from meta directives and headers.
 * Priority: explicit directive > Accept header > default HTTP
 */
function detectProtocol(
  headers: Record<string, string>,
  meta: Record<string, string>
): { protocol: Protocol; protocolOptions?: ProtocolOptions } {
  // Priority 1: Explicit @sse directive
  if (meta['sse'] !== undefined) {
    const options: SSEOptions = { type: 'sse' };

    // Parse optional timeout from meta
    if (meta['timeout']) {
      const timeout = parseInt(meta['timeout'], 10);
      if (!Number.isNaN(timeout)) {
        options.timeout = timeout;
      }
    }

    // Parse optional lastEventId from meta
    if (meta['lastEventId']) {
      options.lastEventId = meta['lastEventId'];
    }

    return { protocol: 'sse', protocolOptions: options };
  }

  // Priority 2: Auto-detect from Accept header
  const accept = headers['Accept'] || headers['accept'];
  if (accept?.includes('text/event-stream')) {
    return { protocol: 'sse', protocolOptions: { type: 'sse' } };
  }

  // Default: HTTP
  return { protocol: 'http' };
}

/**
 * Parse .http file content into structured request objects
 */
export function parse(content: string): ParsedRequest[] {
  const requests: ParsedRequest[] = [];

  // Split by request separators (###)
  // The regex captures the optional name after ###
  // Handle both LF and CRLF line endings
  const lines = content.split(/\r?\n/);
  const blocks: Array<{ name?: string; lines: string[] }> = [];
  let currentBlock: { name?: string; lines: string[] } = { lines: [] };

  for (const line of lines) {
    const separatorMatch = line.match(/^###\s*(.*)$/);
    if (separatorMatch) {
      // Save current block if it has content
      if (currentBlock.lines.length > 0 || blocks.length === 0) {
        blocks.push(currentBlock);
      }
      // Start new block with optional name from separator
      const blockName = separatorMatch[1]?.trim();
      currentBlock = setOptional<{ name?: string; lines: string[] }>({ lines: [] })
        .ifDefined('name', blockName || undefined)
        .build();
    } else {
      currentBlock.lines.push(line);
    }
  }

  // Don't forget the last block
  blocks.push(currentBlock);

  // Parse each block
  for (const block of blocks) {
    if (block.lines.length === 0 && !block.name) {
      continue;
    }

    const blockContent = block.lines.join('\n');
    const request = parseRequestBlock(blockContent, block.name);
    if (request) {
      requests.push(request);
    }
  }

  return requests;
}

/**
 * Parse a single request block
 */
function parseRequestBlock(block: string, defaultName?: string): ParsedRequest | null {
  const lines = block.split(/\r?\n/);
  const meta: Record<string, string> = {};
  let name = defaultName;
  let method = '';
  let url = '';
  const headers: Record<string, string> = {};
  let body: string | undefined;
  let bodyFile: FileReference | undefined;
  let formData: FormField[] | undefined;
  let inBody = false;
  const bodyLines: string[] = [];
  let requestLineFound = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const trimmedLine = line.trim();

    // Skip empty lines before request line
    if (!requestLineFound && trimmedLine === '') {
      continue;
    }

    // Handle comments and directives
    if (!requestLineFound && (trimmedLine.startsWith('#') || trimmedLine.startsWith('//'))) {
      const commentContent = trimmedLine.replace(/^(#|\/\/)\s*/, '');

      // Check for @directive
      const directiveMatch = commentContent.match(/^@(\w+)\s*(.*)?$/);
      if (directiveMatch) {
        const [, directive, value] = directiveMatch;
        if (directive === 'name') {
          name = value?.trim() || name;
        } else if (directive) {
          meta[directive] = value?.trim() || '';
        }
      }
      continue;
    }

    // Parse request line (METHOD URL HTTP/VERSION)
    if (!requestLineFound) {
      const requestLineMatch = trimmedLine.match(
        /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s+(\S+)(\s+HTTP\/[\d.]+)?$/i
      );
      if (requestLineMatch) {
        const methodMatch = requestLineMatch[1];
        const urlMatch = requestLineMatch[2];
        if (!methodMatch || !urlMatch) continue;
        method = methodMatch.toUpperCase();
        url = urlMatch;
        requestLineFound = true;
        continue;
      }

      // Also support just METHOD URL without HTTP version
      const simpleRequestMatch = trimmedLine.match(
        /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s+(.+)$/i
      );
      if (simpleRequestMatch) {
        const methodMatch = simpleRequestMatch[1];
        const urlMatch = simpleRequestMatch[2];
        if (!methodMatch || !urlMatch) continue;
        method = methodMatch.toUpperCase();
        url = urlMatch.trim();
        requestLineFound = true;
        continue;
      }

      // Skip non-matching lines before request
      continue;
    }

    // After request line - handle headers and body
    if (inBody) {
      bodyLines.push(line);
    } else if (trimmedLine === '') {
      // Empty line marks start of body
      inBody = true;
    } else {
      // Parse header
      const headerMatch = line.match(/^([^:]+):\s*(.*)$/);
      if (headerMatch) {
        const headerName = headerMatch[1];
        if (!headerName) continue;
        const headerValue = headerMatch[2] ?? '';
        headers[headerName.trim()] = headerValue.trim();
      }
    }
  }

  // No valid request found
  if (!method || !url) {
    return null;
  }

  // Process body
  if (bodyLines.length > 0) {
    // Remove trailing empty lines
    while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1]?.trim() === '') {
      bodyLines.pop();
    }

    // Check for file reference syntax: < ./path
    if (bodyLines.length === 1) {
      const fileRefMatch = bodyLines[0]?.trim().match(/^<\s+(.+)$/);
      if (fileRefMatch) {
        const filePath = fileRefMatch[1];
        if (filePath) {
          bodyFile = { path: filePath };
        }
      } else if (bodyLines[0]?.trim()) {
        body = bodyLines[0];
      }
    } else if (bodyLines.length > 0) {
      body = bodyLines.join('\n');
    }
  }

  // Check if body matches form data syntax
  // Get Content-Type header (case-insensitive)
  const contentType = headers['Content-Type'] || headers['content-type'];

  if (body && isFormBody(body, contentType)) {
    formData = parseFormBody(body);
    body = undefined; // Clear body since we're using formData
  }

  // Detect protocol from meta directives and headers
  const { protocol, protocolOptions } = detectProtocol(headers, meta);

  return setOptional<ParsedRequest>({
    method,
    url,
    headers,
    raw: block,
    meta
  })
    .ifDefined('name', name)
    .ifDefined('body', body)
    .ifDefined('bodyFile', bodyFile)
    .ifDefined('formData', formData)
    .ifDefined('protocol', protocol !== 'http' ? protocol : undefined)
    .ifDefined('protocolOptions', protocolOptions?.type !== undefined ? protocolOptions : undefined)
    .build();
}

/**
 * Parse .http file from filesystem
 */
export async function parseFile(path: string): Promise<ParsedRequest[]> {
  return await parseFileWithIO(path);
}

/**
 * Parse .http file from filesystem using an IO adapter.
 * If `io` is omitted, Bun runtime fallback is used when available.
 */
export async function parseFileWithIO(path: string, io?: IO): Promise<ParsedRequest[]> {
  if (io) {
    const content = await io.readText(path);
    return parse(content);
  }

  if (typeof (globalThis as Record<string, unknown>)['Bun'] !== 'undefined') {
    type BunFile = { text: () => Promise<string> };
    type BunGlobal = { file: (p: string) => BunFile };

    const bun = (globalThis as unknown as { Bun: BunGlobal }).Bun;
    const file = bun.file(path);
    const content = await file.text();
    return parse(content);
  }

  throw new Error('No IO adapter provided. Use parseFileWithIO(path, io) in this runtime.');
}
