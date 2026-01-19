import { executeWithTransport } from '../execute';
import { loadFileBody } from '../file-loader';
import { buildFormData, buildUrlEncoded, hasFileFields } from '../form-data-builder';
import { createInterpolator } from '../interpolate';
import { parse, parseFileWithIO } from '../parser';
import { createAutoTransport } from '../runtime/auto-transport';
import type { CookieStore, EngineEvent, EventSink, IO, Transport } from '../runtime/types';
import type { ExecuteOptions, ExecuteRequest, FormField, Resolver } from '../types';
import { setOptional } from '../utils/optional';

export type EngineConfig = {
  transport?: Transport;
  io?: IO;
  cookieStore?: CookieStore;
  resolvers?: Record<string, Resolver>;
  onEvent?: EventSink;
  headerDefaults?: Record<string, string>;
};

export type EngineRunOptions = {
  variables?: Record<string, unknown>;
  timeoutMs?: number;
  signal?: AbortSignal;
  followRedirects?: boolean;
  validateSSL?: boolean;
  proxy?: string;

  /**
   * Base path for resolving file references when running from string content.
   * When running from file, this is derived from the .http file directory.
   */
  basePath?: string;
};

export type Engine = {
  parseString: (httpText: string) => ReturnType<typeof parse>;
  runString: (httpText: string, options?: EngineRunOptions) => Promise<Response>;
  runFile: (path: string, options?: EngineRunOptions) => Promise<Response>;
};

function emit(onEvent: EventSink | undefined, event: EngineEvent): void {
  onEvent?.(event);
}

function firstOrThrow<T>(arr: T[], ctx: string): T {
  const first = arr[0];
  if (!first) {
    throw new Error(ctx);
  }
  return first;
}

function dirnameFromPath(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  if (idx === -1) return '.';
  return idx === 0 ? p.slice(0, 1) : p.slice(0, idx);
}

function isAbsolutePath(p: string): boolean {
  if (p.startsWith('/') || p.startsWith('\\')) return true;
  if (/^[A-Za-z]:[\\/]/.test(p)) return true;
  if (p.startsWith('\\\\')) return true;
  return false;
}

function joinWithSep(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  const sep = a.includes('\\') ? '\\' : '/';
  const aTrim = a.endsWith('/') || a.endsWith('\\') ? a.slice(0, -1) : a;
  const bTrim = b.startsWith('/') || b.startsWith('\\') ? b.slice(1) : b;
  return `${aTrim}${sep}${bTrim}`;
}

function getFileBasePath(filePath: string, io?: IO): string {
  if (io) {
    return io.path.dirname(io.path.resolve(filePath));
  }

  const cwd =
    (globalThis as unknown as { process?: { cwd?: () => string } }).process?.cwd?.() ?? '.';
  const absolute = isAbsolutePath(filePath) ? filePath : joinWithSep(cwd, filePath);
  return dirnameFromPath(absolute);
}

function withCookieHeader(
  headers: Record<string, string>,
  cookie: string | undefined
): Record<string, string> {
  if (!cookie) return headers;
  const existing = headers['Cookie'] || headers['cookie'] || '';
  return {
    ...headers,
    Cookie: existing ? `${existing}; ${cookie}` : cookie
  };
}

export function createEngine(config: EngineConfig = {}): Engine {
  const transport = config.transport ?? createAutoTransport();
  const io = config.io;
  const cookieStore = config.cookieStore;
  const onEvent = config.onEvent;
  const headerDefaults = config.headerDefaults;

  const interpolator = createInterpolator({ resolvers: config.resolvers ?? {} });

  async function compileFromString(
    httpText: string,
    options: EngineRunOptions
  ): Promise<{
    executeRequest: ExecuteRequest;
    baseUrl: string;
  }> {
    emit(onEvent, { type: 'parseStarted', source: 'string' });
    const requests = parse(httpText);
    emit(onEvent, { type: 'parseFinished', source: 'string', requestCount: requests.length });

    const request = firstOrThrow(requests, 'No valid requests found in provided content.');

    emit(onEvent, { type: 'interpolateStarted' });
    const mergedVars = { ...(options.variables ?? {}) };
    const interpolated = await interpolator.interpolate(request, mergedVars);
    emit(onEvent, { type: 'interpolateFinished' });

    emit(onEvent, { type: 'compileStarted' });
    const basePath =
      options.basePath ??
      io?.cwd() ??
      (globalThis as unknown as { process?: { cwd?: () => string } }).process?.cwd?.() ??
      '.';

    const { executeRequest } = await compileExecuteRequest(
      interpolated,
      setOptional<{ basePath: string; io?: IO; headerDefaults?: Record<string, string> }>({
        basePath
      })
        .ifDefined('io', io)
        .ifDefined('headerDefaults', headerDefaults)
        .build()
    );
    emit(onEvent, { type: 'compileFinished' });

    return { executeRequest, baseUrl: interpolated.url };
  }

  async function compileFromFile(
    path: string,
    options: EngineRunOptions
  ): Promise<{
    executeRequest: ExecuteRequest;
    baseUrl: string;
  }> {
    emit(onEvent, { type: 'parseStarted', source: 'file' });
    const requests = await parseFileWithIO(path, io);
    emit(onEvent, { type: 'parseFinished', source: 'file', requestCount: requests.length });

    const request = firstOrThrow(requests, `No valid requests found in file: ${path}`);

    emit(onEvent, { type: 'interpolateStarted' });
    const mergedVars = { ...(options.variables ?? {}) };
    const interpolated = await interpolator.interpolate(request, mergedVars);
    emit(onEvent, { type: 'interpolateFinished' });

    emit(onEvent, { type: 'compileStarted' });
    const basePath = getFileBasePath(path, io);
    const { executeRequest } = await compileExecuteRequest(
      interpolated,
      setOptional<{ basePath: string; io?: IO; headerDefaults?: Record<string, string> }>({
        basePath
      })
        .ifDefined('io', io)
        .ifDefined('headerDefaults', headerDefaults)
        .build()
    );
    emit(onEvent, { type: 'compileFinished' });

    return { executeRequest, baseUrl: interpolated.url };
  }

  async function runCompiled(
    executeRequest: ExecuteRequest,
    urlForCookies: string,
    options: EngineRunOptions
  ): Promise<Response> {
    const headers = executeRequest.headers ?? {};

    const cookieHeader = cookieStore ? await cookieStore.getCookieHeader(urlForCookies) : undefined;
    const headersWithCookies = cookieStore ? withCookieHeader(headers, cookieHeader) : headers;

    const requestWithCookies: ExecuteRequest = {
      ...executeRequest,
      headers: headersWithCookies
    };

    emit(onEvent, { type: 'fetchStarted', method: requestWithCookies.method, url: urlForCookies });

    try {
      const execOptions = setOptional<ExecuteOptions>({})
        .ifDefined('timeout', options.timeoutMs)
        .ifDefined('signal', options.signal)
        .ifDefined('followRedirects', options.followRedirects)
        .ifDefined('validateSSL', options.validateSSL)
        .ifDefined('proxy', options.proxy)
        .build();

      const response = await executeWithTransport(requestWithCookies, execOptions, transport);

      emit(onEvent, {
        type: 'fetchFinished',
        method: requestWithCookies.method,
        url: urlForCookies,
        status: response.status
      });

      if (cookieStore) {
        await cookieStore.setFromResponse(urlForCookies, response);
      }

      return response;
    } catch (e) {
      emit(onEvent, {
        type: 'error',
        stage: 'fetch',
        message: e instanceof Error ? e.message : String(e)
      });
      throw e;
    }
  }

  return {
    parseString: parse,
    async runString(httpText, options = {}) {
      const { executeRequest, baseUrl } = await compileFromString(httpText, options);
      return await runCompiled(executeRequest, baseUrl, options);
    },
    async runFile(path, options = {}) {
      const { executeRequest, baseUrl } = await compileFromFile(path, options);
      return await runCompiled(executeRequest, baseUrl, options);
    }
  };
}

async function compileExecuteRequest(
  interpolated: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
    bodyFile?: { path: string };
    formData?: FormField[];
  },
  ctx: { basePath: string; io?: IO; headerDefaults?: Record<string, string> }
): Promise<{ executeRequest: ExecuteRequest }> {
  const headers: Record<string, string> = {
    ...(ctx.headerDefaults ?? {}),
    ...(interpolated.headers ?? {})
  };

  let body: ExecuteRequest['body'] = interpolated.body;

  if (interpolated.bodyFile) {
    const loadedFile = await loadFileBody(
      interpolated.bodyFile.path,
      setOptional<{ basePath: string; io?: IO }>({ basePath: ctx.basePath })
        .ifDefined('io', ctx.io)
        .build()
    );

    body = loadedFile.content;

    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = loadedFile.mimeType;
    }
  } else if (interpolated.formData && interpolated.formData.length > 0) {
    const hasFiles = hasFileFields(interpolated.formData);

    if (hasFiles) {
      body = await buildFormData(
        interpolated.formData,
        setOptional<{ basePath: string; io?: IO }>({ basePath: ctx.basePath })
          .ifDefined('io', ctx.io)
          .build()
      );
      delete headers['Content-Type'];
      delete headers['content-type'];
    } else {
      body = buildUrlEncoded(interpolated.formData);
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }
  }

  const executeRequest: ExecuteRequest = {
    method: interpolated.method,
    url: interpolated.url,
    headers,
    ...(body !== undefined ? { body } : {})
  };

  return { executeRequest };
}
