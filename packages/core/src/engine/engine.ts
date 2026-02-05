import { executeWithTransport } from '../execute';
import { createInterpolator } from '../interpolate';
import { parse, parseFileWithIO } from '../parser';
import type { PluginManager } from '../plugin/manager';
import type {
  CompiledRequest,
  ErrorOutput,
  HookContext,
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
  ParsedRequest,
  Protocol as ProtocolType,
  Resolver,
  StreamResponse
} from '../types';
import { setOptional } from '../utils/optional';
import { delay, emit, firstOrThrow, getFileBasePath } from './engine-utils';
import { type PipelineConfig, prepareRequest } from './request-pipeline';

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

  // Build pipeline config conditionally to handle exactOptionalPropertyTypes
  const pipelineConfig: PipelineConfig = { interpolator, emitEvent };
  if (cookieStore) pipelineConfig.cookieStore = cookieStore;
  if (headerDefaults) pipelineConfig.headerDefaults = headerDefaults;
  if (io) pipelineConfig.io = io;
  if (pluginManager) pipelineConfig.pluginManager = pluginManager;

  function createHookCtx(retries: number, variables: Record<string, unknown>): HookContext {
    return (
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
      }
    );
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

    // Retry loop
    while (true) {
      try {
        const hookCtx = createHookCtx(retries, variables);
        const prepared = await prepareRequest(
          pipelineConfig,
          request,
          variables,
          basePath,
          hookCtx
        );

        if (prepared.skipped) {
          return new Response(null, { status: 204, statusText: 'Skipped by Plugin' });
        }

        // Execute the fetch
        emitEvent({
          type: 'fetchStarted',
          method: prepared.requestWithCookies.method,
          url: prepared.urlForCookies
        });

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
          response = await executeWithTransport(
            prepared.requestWithCookies,
            execOptions,
            transport
          );
          const ttfb = performance.now() - fetchStart;

          emitEvent({
            type: 'fetchFinished',
            method: prepared.requestWithCookies.method,
            url: prepared.urlForCookies,
            status: response.status,
            ttfb
          });

          // Update cookies
          if (cookieStore) {
            await cookieStore.setFromResponse(prepared.urlForCookies, response);
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

        // response.after hook
        let retry: RetrySignal | undefined;

        if (pluginManager) {
          const responseOutput: ResponseOutput = {};
          await pluginManager.triggerResponseAfter(
            { request: prepared.compiledRequest, response, timing, ctx: hookCtx },
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

        // Check for retry signal
        if (retry && retries < maxRetries) {
          retries++;
          await delay(retry.delayMs);
          continue;
        }

        return response;
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
              ctx: createHookCtx(retries, variables)
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

  /**
   * Compile a request and execute it via the appropriate protocol handler for streaming.
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
    const hookCtx = createHookCtx(0, variables);
    const prepared = await prepareRequest(pipelineConfig, request, variables, basePath, hookCtx);

    if (prepared.skipped) {
      throw new Error('Request skipped by plugin - cannot stream a skipped request');
    }

    emitEvent({
      type: 'fetchStarted',
      method: prepared.requestWithCookies.method,
      url: prepared.urlForCookies
    });

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
      const result = await handler.execute(prepared.requestWithCookies, execOptions, transport);
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
