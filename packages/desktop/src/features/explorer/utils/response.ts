type ResponseBody = {
  body?: string;
  encoding: 'utf-8' | 'base64';
};

export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }
  return `${(durationMs / 1000).toFixed(2)} s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function decodeResponseBody(response: ResponseBody): string | undefined {
  if (!response.body) {
    return undefined;
  }

  if (response.encoding === 'base64') {
    try {
      return atob(response.body);
    } catch {
      return response.body;
    }
  }

  return response.body;
}

export function formatResponseBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return body;
  }
}
