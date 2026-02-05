import { executeWithTransport } from '../execute';
import { loadFileBody } from '../file-loader';
import { buildFormData, buildUrlEncoded, hasFileFields } from '../form-data-builder';
import { createInterpolator } from '../interpolate';
import { parse, parseFileWithIO } from '../parser';
import type { PluginManager } from '../plugin/manager';
import type {
  CompiledRequest,
  ErrorOutput,
  ParsedHttpFile,
  ResponseOutput,
  RetrySignal,
  TimingInfo
} from '../plugin/types';
import { getHandler } from '../protocols/registry';
import type { Protocol, ProtocolExecuteOptions } from '../protocols/types';
import { createAutoTransport } from '../runtime/auto-transport';
import type { CookieStore, EngineEvent, EventSink, IO, Transport } from '../runtime/types';
import type {
  ExecuteOptions,
  ExecuteRequest,
  FormField,
  ParsedRequest,
  Protocol as ProtocolType,
  Resolver,
  StreamResponse
} from '../types';
import { setOptional } from '../utils/optional';

// Import protocol handlers for side-effect registration
import '../protocols/http';
import '../protocols/sse';

export type EngineConfig = {
  transport?: Transport;
  io?: IO;
  cookieStore?: CookieStore;
  resolvers?: Record<string, Resolver>;
  onEvent?: EventSink;
  headerDefaults?: Record<string, string>;
  pluginManager?: PluginManager;
  maxRetries?: number;
};

export type EngineRunOptions = {
  variables?: Record<string, unknown>;
  timeoutMs?: number;
  signal?: AbortSignal;
  followRedirects?: boolean;
  validateSSL?: boolean;
  proxy?: string;
  basePath?: string;
  /** Force specific protocol (overrides auto-detection) */
  protocol?: ProtocolType;
  /** Last-Event-ID for SSE resumption */
  lastEventId?: string;
};

export type Engine = {
  parseString: (httpText: string) => ReturnType<typeof parse>;
  runString: (httpText: string, options?: EngineRunOptions) => Promise<Response>;
  runFile: (path: string, options?: EngineRunOptions) => Promise<Response>;
  /** Execute a streaming request (SSE, WebSocket, etc.) from string content */
  streamString: (httpText: string, options?: EngineRunOptions) => Promise<StreamResponse>;
  /** Execute a streaming request (SSE, WebSocket, etc.) from a file */
  streamFile: (path: string, options?: EngineRunOptions) => Promise<StreamResponse>;
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

/**
 * Delay for retry.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createEngine(config: EngineConfig = {}): Engine {
  const transport = config.transport ?? createAutoTransport();
  const io = config.io;
  const cookieStore = config.cookieStore;
  const onEvent = config.onEvent;
  const headerDefaults = config.headerDefaults;
  const pluginManager = config.pluginManager;
  const maxRetries = config.maxRetries ?? 3;

  const interpolator = createInterpolator({ resolvers: config.resolvers ?? {} });

  // Helper to emit to both event sink and plugin manager
  function emitEvent(event: EngineEvent): void {
    emit(onEvent, event);
    pluginManager?.emitEngineEvent(event);
  }

  async function compileFromString(
    httpText: string,
    options: EngineRunOptions
  ): Promise<{
    requests: ParsedRequest[];
    filePath?: string;
    basePath: string;
  }> {
    emitEvent({ type: 'parseStarted', source: 'string' });
    const requests = parse(httpText);
    emitEvent({ type: 'parseFinished', source: 'string', requestCount: requests.length });

    const basePath =
      options.basePath ??
      io?.cwd() ??
      (globalThis as unknown as { process?: { cwd?: () => string } }).process?.cwd?.() ??
      '.';

    // Trigger parse.after hook if plugin manager exists
    if (pluginManager) {
      const parsedFile: ParsedHttpFile = {
        path: 'string',
        requests
      };
      const parseOutput = { file: parsedFile };
      await pluginManager.triggerParseAfter({ file: parsedFile, path: 'string' }, parseOutput);
      // Use potentially modified requests
      return { requests: parseOutput.file.requests, basePath };
    }

    return { requests, basePath };
  }

  async function compileFromFile(
    path: string,
    _options: EngineRunOptions
  ): Promise<{
    requests: ParsedRequest[];
    filePath: string;
    basePath: string;
  }> {
    emitEvent({ type: 'parseStarted', source: 'file' });
    const requests = await parseFileWithIO(path, io);
    emitEvent({ type: 'parseFinished', source: 'file', requestCount: requests.length });

    const basePath = getFileBasePath(path, io);

    // Trigger parse.after hook if plugin manager exists
    if (pluginManager) {
      const parsedFile: ParsedHttpFile = {
        path,
        requests
      };
      const parseOutput = { file: parsedFile };
      await pluginManager.triggerParseAfter({ file: parsedFile, path }, parseOutput);
      // Use potentially modified requests
      return { requests: parseOutput.file.requests, filePath: path, basePath };
    }

    return { requests, filePath: path, basePath };
  }

  async function processRequest(
    request: ParsedRequest,
    options: EngineRunOptions,
    basePath: string
  ): Promise<Response> {
    const variables = options.variables ?? {};
    let retries = 0;

    // Create hook context
    const createCtx = () =>
      pluginManager?.createHookContext({
        retries,
        maxRetries,
        variables
      }) ?? {
        retries,
        maxRetries,
        session: { id: 'default', variables: {} },
        variables,
        config: {
          projectRoot: '.',
          variables: {},
          security: { allowExternalFiles: false, allowPluginsOutsideProject: false }
        },
        projectRoot: '.'
      };

    // Retry loop
    while (true) {
      try {
        const result = await executeRequest(request, options, basePath, createCtx(), retries);

        // Check for retry signal
        if (result.retry && retries < maxRetries) {
          retries++;
          await delay(result.retry.delayMs);
          // Update cookies before retry (default behavior)
          continue;
        }

        return result.response;
      } catch (error) {
        // Handle error with error hook
        if (pluginManager) {
          const compiledRequest: CompiledRequest = {
            method: request.method,
            url: request.url,
            headers: request.headers,
            ...(request.body !== undefined ? { body: request.body } : {})
          };

          const errorOutput: ErrorOutput = {
            error: error instanceof Error ? error : new Error(String(error)),
            suppress: false
          };

          await pluginManager.triggerError(
            {
              request: compiledRequest,
              error: error instanceof Error ? error : new Error(String(error)),
              ctx: createCtx()
            },
            errorOutput
          );

          // Check for retry signal from error hook
          if (errorOutput.retry && retries < maxRetries) {
            retries++;
            await delay(errorOutput.retry.delayMs);
            continue;
          }

          // Suppress error if requested
          if (errorOutput.suppress) {
            // Return a synthetic error response
            return new Response(errorOutput.error.message, {
              status: 0,
              statusText: 'Suppressed Error'
            });
          }

          throw errorOutput.error;
        }

        throw error;
      }
    }
  }

  async function executeRequest(
    request: ParsedRequest,
    options: EngineRunOptions,
    basePath: string,
    ctx: ReturnType<
      typeof pluginManager extends undefined
        ? never
        : NonNullable<typeof pluginManager>['createHookContext']
    >,
    _retries: number
  ): Promise<{ response: Response; retry?: RetrySignal }> {
    // Step 1: request.before hook (before interpolation)
    let requestData: {
      method: string;
      url: string;
      headers: Record<string, string>;
      body?: string;
    } = {
      method: request.method,
      url: request.url,
      headers: { ...request.headers },
      ...(request.body !== undefined ? { body: request.body } : {})
    };

    if (pluginManager) {
      const beforeOutput = { request: requestData, skip: false };
      const result = await pluginManager.triggerRequestBefore(
        { request: requestData, variables: options.variables ?? {}, ctx },
        beforeOutput
      );

      if (result.skip) {
        // Return a synthetic "skipped" response (use 204 No Content as placeholder)
        return {
          response: new Response(null, { status: 204, statusText: 'Skipped by Plugin' })
        };
      }

      requestData = beforeOutput.request;
    }

    // Step 2: Interpolation
    emitEvent({ type: 'interpolateStarted' });
    const mergedVars = { ...(options.variables ?? {}) };
    const toInterpolate = {
      method: requestData.method,
      url: requestData.url,
      headers: requestData.headers,
      ...(requestData.body !== undefined ? { body: requestData.body } : {}),
      ...(request.name !== undefined ? { name: request.name } : {}),
      raw: request.raw,
      meta: request.meta,
      ...(request.bodyFile !== undefined ? { bodyFile: request.bodyFile } : {}),
      ...(request.formData !== undefined ? { formData: request.formData } : {})
    };
    const interpolated = await interpolator.interpolate(toInterpolate, mergedVars);
    emitEvent({ type: 'interpolateFinished' });

    // Step 3: Compile to ExecuteRequest
    emitEvent({ type: 'compileStarted' });
    const { executeRequest } = await compileExecuteRequest(
      interpolated,
      setOptional<{ basePath: string; io?: IO; headerDefaults?: Record<string, string> }>({
        basePath
      })
        .ifDefined('io', io)
        .ifDefined('headerDefaults', headerDefaults)
        .build()
    );
    emitEvent({ type: 'compileFinished' });

    // Step 4: request.compiled hook (after interpolation, for signing)
    let compiledRequest: CompiledRequest = {
      method: executeRequest.method,
      url: executeRequest.url,
      headers: executeRequest.headers ?? {},
      ...(executeRequest.body !== undefined ? { body: executeRequest.body } : {})
    };

    if (pluginManager) {
      const compiledOutput = { request: compiledRequest };
      await pluginManager.triggerRequestCompiled(
        { request: compiledRequest, variables: mergedVars, ctx },
        compiledOutput
      );
      compiledRequest = compiledOutput.request;
    }

    // Step 5: request.after hook (read-only, logging/metrics)
    if (pluginManager) {
      await pluginManager.triggerRequestAfter({ request: compiledRequest, ctx });
    }

    // Step 6: Execute request
    const urlForCookies = compiledRequest.url;
    const headers = compiledRequest.headers;

    const cookieHeader = cookieStore ? await cookieStore.getCookieHeader(urlForCookies) : undefined;
    const headersWithCookies = cookieStore ? withCookieHeader(headers, cookieHeader) : headers;

    // Convert Buffer to ArrayBuffer for ExecuteRequest compatibility
    let bodyForRequest: ExecuteRequest['body'];
    if (compiledRequest.body !== undefined) {
      if (compiledRequest.body instanceof Buffer) {
        // Create a new ArrayBuffer from the Buffer's data
        const buf = compiledRequest.body;
        const arrayBuffer = new ArrayBuffer(buf.byteLength);
        new Uint8Array(arrayBuffer).set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
        bodyForRequest = arrayBuffer;
      } else {
        // Pass through string, ArrayBuffer, FormData, or URLSearchParams
        // Buffer is handled above, so this is safe
        bodyForRequest = compiledRequest.body as ExecuteRequest['body'];
      }
    }

    const requestWithCookies: ExecuteRequest = {
      method: compiledRequest.method,
      url: compiledRequest.url,
      headers: headersWithCookies,
      ...(bodyForRequest !== undefined ? { body: bodyForRequest } : {})
    };

    emitEvent({ type: 'fetchStarted', method: requestWithCookies.method, url: urlForCookies });

    const startTime = Date.now();
    let response: Response;

    try {
      const execOptions = setOptional<ExecuteOptions>({})
        .ifDefined('timeout', options.timeoutMs)
        .ifDefined('signal', options.signal)
        .ifDefined('followRedirects', options.followRedirects)
        .ifDefined('validateSSL', options.validateSSL)
        .ifDefined('proxy', options.proxy)
        .build();

      const fetchStart = performance.now();
      response = await executeWithTransport(requestWithCookies, execOptions, transport);
      const ttfb = performance.now() - fetchStart;

      emitEvent({
        type: 'fetchFinished',
        method: requestWithCookies.method,
        url: urlForCookies,
        status: response.status,
        ttfb
      });

      // Update cookies
      if (cookieStore) {
        await cookieStore.setFromResponse(urlForCookies, response);
      }
    } catch (e) {
      emitEvent({
        type: 'error',
        stage: 'fetch',
        message: e instanceof Error ? e.message : String(e)
      });
      throw e;
    }

    const timing: TimingInfo = {
      total: Date.now() - startTime
    };

    // Step 7: response.after hook
    let retry: RetrySignal | undefined;

    if (pluginManager) {
      const responseOutput: ResponseOutput = {};
      await pluginManager.triggerResponseAfter(
        { request: compiledRequest, response, timing, ctx },
        responseOutput
      );

      retry = responseOutput.retry;

      // Reconstruct response if modified
      if (
        responseOutput.status !== undefined ||
        responseOutput.statusText !== undefined ||
        responseOutput.headers !== undefined ||
        responseOutput.body !== undefined
      ) {
        const newHeaders = new Headers(response.headers);
        if (responseOutput.headers) {
          for (const [key, value] of Object.entries(responseOutput.headers)) {
            newHeaders.set(key, value);
          }
        }

        let newBody: BodyInit | null = null;
        if (responseOutput.body !== undefined) {
          if (typeof responseOutput.body === 'string') {
            newBody = responseOutput.body;
          } else if (responseOutput.body instanceof Buffer) {
            // Convert Buffer to Uint8Array for BodyInit compatibility
            newBody = new Uint8Array(responseOutput.body);
          } else if (responseOutput.body instanceof ReadableStream) {
            newBody = responseOutput.body;
          }
        }

        response = new Response(newBody ?? response.body, {
          status: responseOutput.status ?? response.status,
          statusText: responseOutput.statusText ?? response.statusText,
          headers: newHeaders
        });
      }
    }

    return {
      response,
      ...(retry !== undefined ? { retry } : {})
    };
  }

  /**
   * Compile a request and execute it via the appropriate protocol handler for streaming.
   * Used by streamString and streamFile methods.
   */
  async function processStreamRequest(
    request: ParsedRequest,
    options: EngineRunOptions,
    basePath: string
  ): Promise<StreamResponse> {
    // Determine protocol (explicit override > parsed > error)
    const protocol: Protocol = (options.protocol ?? request.protocol ?? 'http') as Protocol;

    // Validate this is a streaming protocol
    if (protocol === 'http') {
      throw new Error(
        `Request protocol is 'http' but expected a streaming protocol (sse, ws). ` +
          `Use runString() for HTTP requests or add @sse directive.`
      );
    }

    const handler = getHandler(protocol);
    if (!handler) {
      throw new Error(`No handler registered for protocol: ${protocol}`);
    }

    const variables = options.variables ?? {};

    // Create hook context
    const ctx = pluginManager?.createHookContext({
      retries: 0,
      maxRetries,
      variables
    }) ?? {
      retries: 0,
      maxRetries,
      session: { id: 'default', variables: {} },
      variables,
      config: {
        projectRoot: '.',
        variables: {},
        security: { allowExternalFiles: false, allowPluginsOutsideProject: false }
      },
      projectRoot: '.'
    };

    // Step 1: request.before hook (before interpolation)
    let requestData: {
      method: string;
      url: string;
      headers: Record<string, string>;
      body?: string;
    } = {
      method: request.method,
      url: request.url,
      headers: { ...request.headers },
      ...(request.body !== undefined ? { body: request.body } : {})
    };

    if (pluginManager) {
      const beforeOutput = { request: requestData, skip: false };
      const result = await pluginManager.triggerRequestBefore(
        { request: requestData, variables, ctx },
        beforeOutput
      );

      if (result.skip) {
        throw new Error('Request skipped by plugin - cannot stream a skipped request');
      }

      requestData = beforeOutput.request;
    }

    // Step 2: Interpolation
    emitEvent({ type: 'interpolateStarted' });
    const mergedVars = { ...variables };
    const toInterpolate = {
      method: requestData.method,
      url: requestData.url,
      headers: requestData.headers,
      ...(requestData.body !== undefined ? { body: requestData.body } : {}),
      ...(request.name !== undefined ? { name: request.name } : {}),
      raw: request.raw,
      meta: request.meta,
      ...(request.bodyFile !== undefined ? { bodyFile: request.bodyFile } : {}),
      ...(request.formData !== undefined ? { formData: request.formData } : {})
    };
    const interpolated = await interpolator.interpolate(toInterpolate, mergedVars);
    emitEvent({ type: 'interpolateFinished' });

    // Step 3: Compile to ExecuteRequest
    emitEvent({ type: 'compileStarted' });
    const { executeRequest: compiledExecReq } = await compileExecuteRequest(
      interpolated,
      setOptional<{ basePath: string; io?: IO; headerDefaults?: Record<string, string> }>({
        basePath
      })
        .ifDefined('io', io)
        .ifDefined('headerDefaults', headerDefaults)
        .build()
    );
    emitEvent({ type: 'compileFinished' });

    // Step 4: request.compiled hook (after interpolation, for signing)
    let compiledRequest: CompiledRequest = {
      method: compiledExecReq.method,
      url: compiledExecReq.url,
      headers: compiledExecReq.headers ?? {},
      ...(compiledExecReq.body !== undefined ? { body: compiledExecReq.body } : {})
    };

    if (pluginManager) {
      const compiledOutput = { request: compiledRequest };
      await pluginManager.triggerRequestCompiled(
        { request: compiledRequest, variables: mergedVars, ctx },
        compiledOutput
      );
      compiledRequest = compiledOutput.request;
    }

    // Step 5: request.after hook (read-only, logging/metrics)
    if (pluginManager) {
      await pluginManager.triggerRequestAfter({ request: compiledRequest, ctx });
    }

    // Step 6: Add cookies
    const urlForCookies = compiledRequest.url;
    const headers = compiledRequest.headers;

    const cookieHeader = cookieStore ? await cookieStore.getCookieHeader(urlForCookies) : undefined;
    const headersWithCookies = cookieStore ? withCookieHeader(headers, cookieHeader) : headers;

    // Build final request
    const requestWithCookies: ExecuteRequest = {
      method: compiledRequest.method,
      url: compiledRequest.url,
      headers: headersWithCookies
    };

    emitEvent({ type: 'fetchStarted', method: requestWithCookies.method, url: urlForCookies });

    // Build protocol-specific options
    const execOptions: ProtocolExecuteOptions = setOptional<ProtocolExecuteOptions>({})
      .ifDefined('timeout', options.timeoutMs)
      .ifDefined('signal', options.signal)
      .ifDefined('followRedirects', options.followRedirects)
      .ifDefined('validateSSL', options.validateSSL)
      .ifDefined('proxy', options.proxy)
      .ifDefined('lastEventId', options.lastEventId ?? request.protocolOptions?.lastEventId)
      .build();

    try {
      const result = await handler.execute(requestWithCookies, execOptions, transport);

      // For streaming, we return immediately - no cookie update or response hooks
      // since the stream is ongoing
      return result as StreamResponse;
    } catch (e) {
      emitEvent({
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
      const { requests, basePath } = await compileFromString(httpText, options);
      const request = firstOrThrow(requests, 'No valid requests found in provided content.');
      return await processRequest(request, options, basePath);
    },
    async runFile(path, options = {}) {
      const { requests, basePath } = await compileFromFile(path, options);
      const request = firstOrThrow(requests, `No valid requests found in file: ${path}`);
      return await processRequest(request, options, basePath);
    },
    async streamString(httpText, options = {}) {
      const { requests, basePath } = await compileFromString(httpText, options);
      const request = firstOrThrow(requests, 'No valid requests found in provided content.');
      return await processStreamRequest(request, options, basePath);
    },
    async streamFile(path, options = {}) {
      const { requests, basePath } = await compileFromFile(path, options);
      const request = firstOrThrow(requests, `No valid requests found in file: ${path}`);
      return await processStreamRequest(request, options, basePath);
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
