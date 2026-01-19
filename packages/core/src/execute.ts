import { createAutoTransport } from './runtime/auto-transport';
import type { Transport, TransportContext } from './runtime/types';
import type { ExecuteOptions, ExecuteRequest } from './types';
import { setOptional } from './utils/optional';

/**
 * Determines if body should be attached to the request.
 * GET and HEAD requests should not have a body per HTTP spec.
 */
function shouldAttachBody(method: string, body: ExecuteRequest['body']): boolean {
  return body !== undefined && !['GET', 'HEAD'].includes(method.toUpperCase());
}

/**
 * Build standard fetch RequestInit from request and execution options.
 */
function buildRequestInit(
  request: ExecuteRequest,
  opts: {
    followRedirects: boolean;
    signal: AbortSignal;
  }
): RequestInit {
  const shouldIncludeBody =
    shouldAttachBody(request.method, request.body) && request.body !== undefined;

  return setOptional<RequestInit>({
    method: request.method,
    redirect: opts.followRedirects ? 'follow' : 'manual',
    signal: opts.signal
  })
    .ifDefined('headers', request.headers)
    .ifDefined('body', shouldIncludeBody ? request.body : undefined)
    .build();
}

/**
 * Create an AbortSignal for request execution.
 * Uses provided signal or creates an internal timeout-based signal.
 */
function createExecutionSignal(opts: { provided?: AbortSignal; timeout: number }): {
  signal: AbortSignal;
  isInternalTimeout: boolean;
  cleanup: () => void;
} {
  if (opts.provided) {
    return {
      signal: opts.provided,
      isInternalTimeout: false,
      cleanup: () => {}
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

  return {
    signal: controller.signal,
    isInternalTimeout: true,
    cleanup: () => clearTimeout(timeoutId)
  };
}

/**
 * Map execution errors to user-friendly messages.
 * Converts internal timeout AbortError to descriptive timeout error.
 */
function mapExecuteError(
  error: unknown,
  ctx: { timeout: number; isInternalTimeout: boolean }
): Error {
  if (error instanceof Error && error.name === 'AbortError') {
    if (ctx.isInternalTimeout) {
      return new Error(`Request timeout after ${ctx.timeout}ms`);
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}

// ============================================================================
// Main Execute Function
// ============================================================================

/**
 * Execute an HTTP request
 * Returns a native fetch Response
 */
export async function execute(
  request: ExecuteRequest,
  options: ExecuteOptions = {}
): Promise<Response> {
  return await executeWithTransport(request, options, createAutoTransport());
}

/**
 * Execute an HTTP request using an explicit transport.
 * Useful for renderer-safe environments (e.g. Tauri) or custom proxy/TLS handling.
 */
export async function executeWithTransport(
  request: ExecuteRequest,
  options: ExecuteOptions,
  transport: Transport
): Promise<Response> {
  const timeout = options.timeout ?? 30000;

  const executionSignalOpts = setOptional<{ timeout: number; provided?: AbortSignal }>({ timeout })
    .ifDefined('provided', options.signal)
    .build();

  const { signal, isInternalTimeout, cleanup } = createExecutionSignal(executionSignalOpts);

  const runOpts = setOptional<{
    followRedirects: boolean;
    signal: AbortSignal;
  }>({
    followRedirects: options.followRedirects ?? true,
    signal
  }).build();

  const requestInit = buildRequestInit(request, runOpts);

  try {
    const ctx = setOptional<TransportContext>({})
      .ifDefined('proxy', options.proxy)
      .ifDefined('validateSSL', options.validateSSL)
      .build();

    return await transport.fetch(request.url, requestInit, ctx);
  } catch (error) {
    throw mapExecuteError(error, { timeout, isInternalTimeout });
  } finally {
    cleanup();
  }
}
