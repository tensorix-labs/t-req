type ResponseHeader = {
  name: string;
  value: string;
};

export type ResponseBodyViewModel =
  | {
      kind: 'empty';
    }
  | {
      kind: 'json';
      text: string;
    }
  | {
      kind: 'text';
      text: string;
    };

export function isJsonContentType(contentType: string): boolean {
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase();
  if (!mediaType) {
    return false;
  }

  if (mediaType === 'application/json' || mediaType === 'text/json') {
    return true;
  }

  return mediaType.endsWith('+json');
}

export function toResponseBodyViewModel(
  body: string | undefined,
  headers: ReadonlyArray<ResponseHeader>
): ResponseBodyViewModel {
  if (!body) {
    return { kind: 'empty' };
  }

  const contentType = findHeaderValue(headers, 'content-type');
  const formattedJson = formatJsonBody(body);

  if (contentType && isJsonContentType(contentType)) {
    if (formattedJson) {
      return { kind: 'json', text: formattedJson };
    }
    return { kind: 'text', text: body };
  }

  if (formattedJson) {
    return { kind: 'json', text: formattedJson };
  }

  return { kind: 'text', text: body };
}

function findHeaderValue(
  headers: ReadonlyArray<ResponseHeader>,
  targetName: string
): string | undefined {
  const normalizedTarget = targetName.toLowerCase();
  for (const header of headers) {
    if (header.name.toLowerCase() === normalizedTarget) {
      return header.value;
    }
  }
  return undefined;
}

function formatJsonBody(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return undefined;
  }
}
