import type { FileReference, FormField } from './types';

export interface SerializableDirective {
  name: string;
  value: string;
}

export interface SerializableRequest {
  name?: string;
  description?: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  bodyFile?: FileReference;
  formData?: FormField[];
  directives?: SerializableDirective[];
}

export interface SerializableDocument {
  requests: SerializableRequest[];
  fileVariables?: Record<string, string>;
}

interface SerializeRequestOptions {
  includeSeparator: boolean;
  includeNameDirective: boolean;
}

function formatDirective(directive: SerializableDirective): string {
  return directive.value === ''
    ? `# @${directive.name}`
    : `# @${directive.name} ${directive.value}`;
}

function formatHeader(name: string, value: string): string {
  return value === '' ? `${name}:` : `${name}: ${value}`;
}

function formatFormField(field: FormField): string {
  if (!field.isFile) {
    return `${field.name} = ${field.value}`;
  }

  const normalizedPath = (field.path ?? '').startsWith('@')
    ? (field.path ?? '').slice(1)
    : (field.path ?? '');
  const base = `${field.name} = @${normalizedPath}`;
  return field.filename ? `${base} | ${field.filename}` : base;
}

function serializeBody(request: SerializableRequest): string | undefined {
  if (request.formData && request.formData.length > 0) {
    return request.formData.map((field) => formatFormField(field)).join('\n');
  }

  if (request.bodyFile) {
    return `< ${request.bodyFile.path}`;
  }

  if (request.body !== undefined && request.body !== '') {
    return request.body;
  }

  return undefined;
}

function collectDirectives(
  request: SerializableRequest,
  includeNameDirective: boolean
): SerializableDirective[] {
  const directives = request.directives ? [...request.directives] : [];
  const names = new Set(directives.map((directive) => directive.name));
  const synthetic: SerializableDirective[] = [];

  if (includeNameDirective && request.name !== undefined && !names.has('name')) {
    synthetic.push({ name: 'name', value: request.name });
  }

  if (request.description !== undefined && !names.has('description')) {
    synthetic.push({ name: 'description', value: request.description });
  }

  return synthetic.concat(directives);
}

function serializeRequestBlock(
  request: SerializableRequest,
  options: SerializeRequestOptions
): string {
  const lines: string[] = [];

  if (options.includeSeparator) {
    lines.push(request.name ? `### ${request.name}` : '###');
  }

  const directives = collectDirectives(request, options.includeNameDirective);
  for (const directive of directives) {
    lines.push(formatDirective(directive));
  }

  lines.push(`${request.method} ${request.url}`);

  for (const [headerName, headerValue] of Object.entries(request.headers ?? {})) {
    lines.push(formatHeader(headerName, headerValue));
  }

  const body = serializeBody(request);
  if (body !== undefined) {
    lines.push('');
    lines.push(body);
  }

  return lines.join('\n');
}

export function serializeRequest(request: SerializableRequest): string {
  return serializeRequestBlock(request, {
    includeSeparator: false,
    includeNameDirective: true
  });
}

export function serializeDocument(document: SerializableDocument): string {
  const chunks: string[] = [];

  const fileVariableLines = Object.entries(document.fileVariables ?? {}).map(
    ([key, value]) => `@${key} = ${value}`
  );

  if (fileVariableLines.length > 0) {
    chunks.push(fileVariableLines.join('\n'));
    if (document.requests.length > 0) {
      chunks.push('\n\n');
    }
  }

  const isMultiRequest = document.requests.length > 1;
  for (const request of document.requests) {
    chunks.push(
      `${serializeRequestBlock(request, {
        includeSeparator: isMultiRequest,
        includeNameDirective: !isMultiRequest
      })}\n`
    );
  }

  return chunks.join('');
}
