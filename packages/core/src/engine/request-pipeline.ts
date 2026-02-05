import type { createInterpolator } from '../interpolate';
import type { PluginManager } from '../plugin/manager';
import type { CompiledRequest, HookContext } from '../plugin/types';
import type { CookieStore, EngineEvent, IO } from '../runtime/types';
import type { ExecuteRequest, ParsedRequest } from '../types';
import { setOptional } from '../utils/optional';
import { compileExecuteRequest } from './compile-request';
import { withCookieHeader } from './engine-utils';

export type PipelineConfig = {
  interpolator: ReturnType<typeof createInterpolator>;
  cookieStore?: CookieStore;
  headerDefaults?: Record<string, string>;
  io?: IO;
  pluginManager?: PluginManager;
  emitEvent: (event: EngineEvent) => void;
};

export type PreparedRequest = {
  compiledRequest: CompiledRequest;
  requestWithCookies: ExecuteRequest;
  urlForCookies: string;
  mergedVars: Record<string, unknown>;
  skipped: boolean;
};

export async function prepareRequest(
  config: PipelineConfig,
  request: ParsedRequest,
  variables: Record<string, unknown>,
  basePath: string,
  hookCtx: HookContext
): Promise<PreparedRequest> {
  const { interpolator, cookieStore, headerDefaults, io, pluginManager, emitEvent } = config;

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
      { request: requestData, variables, ctx: hookCtx },
      beforeOutput
    );

    if (result.skip) {
      // Return a skipped result — caller decides what to do
      return {
        compiledRequest: {
          method: requestData.method,
          url: requestData.url,
          headers: requestData.headers
        },
        requestWithCookies: {
          method: requestData.method,
          url: requestData.url,
          headers: requestData.headers
        },
        urlForCookies: requestData.url,
        mergedVars: { ...variables },
        skipped: true
      };
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
      { request: compiledRequest, variables: mergedVars, ctx: hookCtx },
      compiledOutput
    );
    compiledRequest = compiledOutput.request;
  }

  // Step 5: request.after hook (read-only, logging/metrics)
  if (pluginManager) {
    await pluginManager.triggerRequestAfter({ request: compiledRequest, ctx: hookCtx });
  }

  // Step 6: Cookie injection + body conversion
  const urlForCookies = compiledRequest.url;
  const headers = compiledRequest.headers;

  const cookieHeader = cookieStore ? await cookieStore.getCookieHeader(urlForCookies) : undefined;
  const headersWithCookies = cookieStore ? withCookieHeader(headers, cookieHeader) : headers;

  // Convert Buffer to ArrayBuffer for ExecuteRequest compatibility
  let bodyForRequest: ExecuteRequest['body'];
  if (compiledRequest.body !== undefined) {
    if (compiledRequest.body instanceof Buffer) {
      const buf = compiledRequest.body;
      const arrayBuffer = new ArrayBuffer(buf.byteLength);
      new Uint8Array(arrayBuffer).set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      bodyForRequest = arrayBuffer;
    } else {
      bodyForRequest = compiledRequest.body as ExecuteRequest['body'];
    }
  }

  const requestWithCookies: ExecuteRequest = {
    method: compiledRequest.method,
    url: compiledRequest.url,
    headers: headersWithCookies,
    ...(bodyForRequest !== undefined ? { body: bodyForRequest } : {})
  };

  return {
    compiledRequest,
    requestWithCookies,
    urlForCookies,
    mergedVars,
    skipped: false
  };
}
