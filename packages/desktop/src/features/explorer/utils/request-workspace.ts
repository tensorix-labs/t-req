type RequestSummary = {
  index: number;
  name?: string;
  method: string;
  url: string;
  protocol?: 'http' | 'sse' | 'ws';
};

export type RequestOption = {
  index: number;
  label: string;
  protocol?: 'http' | 'sse' | 'ws';
};

export function isHttpProtocol(protocol: string | undefined): boolean {
  return protocol === undefined || protocol === 'http';
}

export function toRequestOptionLabel(request: RequestSummary): string {
  const prefix = `${request.index + 1}.`;
  if (request.name) {
    return `${prefix} ${request.name}`;
  }
  return `${prefix} ${request.method.toUpperCase()} ${request.url}`;
}

export function toRequestOption(request: RequestSummary): RequestOption {
  return {
    index: request.index,
    label: toRequestOptionLabel(request),
    protocol: request.protocol
  };
}

export function toRequestIndex(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  return parsed;
}
