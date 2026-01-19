// Runtime adapter interfaces for portability.
// Keep these small and capability-driven so the core logic stays centralized.

export type PathApi = {
  resolve: (...parts: string[]) => string;
  dirname: (p: string) => string;
  basename: (p: string) => string;
  extname: (p: string) => string;
  isAbsolute: (p: string) => boolean;
  sep: string;
};

export type IO = {
  readText: (path: string) => Promise<string>;
  readBinary: (path: string) => Promise<ArrayBuffer>;
  exists: (path: string) => Promise<boolean>;
  cwd: () => string;
  path: PathApi;
};

export type TransportCapabilities = {
  proxy: boolean;
  validateSSL: boolean;
};

export type TransportContext = {
  proxy?: string;
  validateSSL?: boolean;
};

export type Transport = {
  capabilities: TransportCapabilities;
  fetch: (url: string, init: RequestInit, ctx: TransportContext) => Promise<Response>;
};

export type CookieStore = {
  getCookieHeader: (url: string) => string | undefined | Promise<string | undefined>;
  setFromResponse: (url: string, response: Response) => void | Promise<void>;
};

export type EngineEvent =
  | { type: 'parseStarted'; source: 'string' | 'file' }
  | { type: 'parseFinished'; source: 'string' | 'file'; requestCount: number }
  | { type: 'interpolateStarted' }
  | { type: 'interpolateFinished' }
  | { type: 'compileStarted' }
  | { type: 'compileFinished' }
  | { type: 'fetchStarted'; method: string; url: string }
  | { type: 'fetchFinished'; method: string; url: string; status: number }
  | { type: 'error'; stage: string; message: string };

export type EventSink = (event: EngineEvent) => void;
