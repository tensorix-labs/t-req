export type RequestLineDraft = {
  method: string;
  url: string;
};

export const FALLBACK_REQUEST_METHOD = 'GET';
export const FALLBACK_REQUEST_URL = 'https://api.example.com';

const REQUEST_LINE_PATTERN = /^([A-Za-z]+)\s+(\S+)(?:\s+HTTP\/\d+(?:\.\d+)?)?$/;

function shouldSkipLine(line: string): boolean {
  return line.startsWith('#') || line.startsWith('//') || line.startsWith('@');
}

export function deriveRequestLineFromContent(content?: string): RequestLineDraft {
  if (!content) {
    return { method: FALLBACK_REQUEST_METHOD, url: FALLBACK_REQUEST_URL };
  }

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || shouldSkipLine(line)) {
      continue;
    }

    const match = line.match(REQUEST_LINE_PATTERN);
    if (!match) {
      continue;
    }

    return {
      method: match[1].toUpperCase(),
      url: match[2]
    };
  }

  return { method: FALLBACK_REQUEST_METHOD, url: FALLBACK_REQUEST_URL };
}
