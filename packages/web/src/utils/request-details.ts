import type { PostParseResponses } from '@t-req/sdk/client';

type ParseResponse = PostParseResponses[200];

export type ParseRequestBlock = ParseResponse['requests'][number];
export type ParsedRequest = NonNullable<ParseRequestBlock['request']>;
export type ParsedRequestSpans = ParsedRequest['spans'];

export type RequestDetailsRow = {
  key: string;
  value: string;
};

export type RequestBodyField = {
  name: string;
  value: string;
  isFile: boolean;
  path?: string;
  filename?: string;
};

export type RequestBodySummary = {
  kind: 'none' | 'inline' | 'form-data' | 'file';
  hasBody: boolean;
  hasFormData: boolean;
  hasBodyFile: boolean;
  description: string;
  text?: string;
  contentType?: string;
  isJsonLike?: boolean;
  fields?: RequestBodyField[];
  filePath?: string;
  spans?: ParsedRequestSpans;
};

function decodeQueryComponent(value: string): string {
  const normalized = value.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

function extractQuery(url: string): string | undefined {
  const queryStart = url.indexOf('?');
  if (queryStart === -1 || queryStart === url.length - 1) {
    return undefined;
  }

  const hashStart = url.indexOf('#', queryStart + 1);
  if (hashStart === -1) {
    return url.slice(queryStart + 1);
  }
  return url.slice(queryStart + 1, hashStart);
}

export function toRequestParams(url: string): RequestDetailsRow[] {
  const query = extractQuery(url);
  if (!query) {
    return [];
  }

  return query
    .split('&')
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const separator = segment.indexOf('=');
      const rawKey = separator === -1 ? segment : segment.slice(0, separator);
      const rawValue = separator === -1 ? '' : segment.slice(separator + 1);
      return {
        key: decodeQueryComponent(rawKey),
        value: decodeQueryComponent(rawValue)
      };
    });
}

export function toRequestHeaders(headers: Record<string, string>): RequestDetailsRow[] {
  return Object.entries(headers).map(([key, value]) => ({ key, value }));
}

export function findRequestBlock(
  blocks: ParseRequestBlock[],
  requestIndex: number
): ParseRequestBlock | undefined {
  return blocks.find((block) => block.request?.index === requestIndex);
}

export function toRequestBodySummary(request: ParsedRequest | undefined): RequestBodySummary {
  const hasBody = request?.hasBody ?? false;
  const hasFormData = request?.hasFormData ?? false;
  const hasBodyFile = request?.hasBodyFile ?? false;
  const parsedBody = request?.body;

  if (parsedBody?.kind === 'inline') {
    return {
      kind: 'inline',
      hasBody: true,
      hasFormData,
      hasBodyFile,
      description: 'Request includes an inline body payload.',
      text: parsedBody.text,
      ...(parsedBody.contentType !== undefined ? { contentType: parsedBody.contentType } : {}),
      isJsonLike: parsedBody.isJsonLike,
      ...(request?.spans !== undefined ? { spans: request.spans } : {})
    };
  }

  if (parsedBody?.kind === 'form-data') {
    const hasFormDataFields = parsedBody.fields.length > 0;
    return {
      kind: 'form-data',
      hasBody,
      hasFormData: true,
      hasBodyFile,
      description: !hasFormDataFields
        ? 'No form-data fields were parsed for this request.'
        : hasBodyFile || parsedBody.fields.some((field) => field.isFile)
          ? 'Request includes form data fields and file references.'
          : 'Request includes form data fields.',
      fields: parsedBody.fields.map((field) => ({
        name: field.name,
        value: field.value,
        isFile: field.isFile,
        ...(field.path !== undefined ? { path: field.path } : {}),
        ...(field.filename !== undefined ? { filename: field.filename } : {})
      })),
      ...(parsedBody.contentType !== undefined ? { contentType: parsedBody.contentType } : {}),
      ...(request?.spans !== undefined ? { spans: request.spans } : {})
    };
  }

  if (parsedBody?.kind === 'file') {
    return {
      kind: 'file',
      hasBody,
      hasFormData,
      hasBodyFile: true,
      description: 'Request body is loaded from a file reference.',
      filePath: parsedBody.path,
      ...(parsedBody.contentType !== undefined ? { contentType: parsedBody.contentType } : {}),
      ...(request?.spans !== undefined ? { spans: request.spans } : {})
    };
  }

  if (hasFormData && hasBodyFile) {
    return {
      kind: 'form-data',
      hasBody,
      hasFormData,
      hasBodyFile,
      fields: [],
      description: 'No form-data fields were parsed for this request.'
    };
  }

  if (hasFormData) {
    return {
      kind: 'form-data',
      hasBody,
      hasFormData,
      hasBodyFile,
      description: 'No form-data fields were parsed for this request.'
    };
  }

  if (hasBodyFile) {
    return {
      kind: 'file',
      hasBody,
      hasFormData,
      hasBodyFile,
      description: 'Request body is loaded from a file reference.'
    };
  }

  if (hasBody) {
    return {
      kind: 'inline',
      hasBody,
      hasFormData,
      hasBodyFile,
      description: 'Request body content is unavailable for this request.',
      ...(request?.spans !== undefined ? { spans: request.spans } : {})
    };
  }

  return {
    kind: 'none',
    hasBody,
    hasFormData,
    hasBodyFile,
    description: 'No body is defined for this request.'
  };
}
