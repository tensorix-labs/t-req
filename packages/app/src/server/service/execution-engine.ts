import { createEngine, parse, type SSEMessage } from '@t-req/core';
import { buildEngineOptions, resolveProjectConfig } from '@t-req/core/config';
import { createCookieJar } from '@t-req/core/cookies';
import { createCookieJarManager, scheduleCookieJarSave } from '@t-req/core/cookies/persistence';
import type { CookieStore } from '@t-req/core/runtime';
import { createCookieStoreFromJar, dirname, isAbsolute, isPathSafe, resolve } from '../../utils';
import {
  ContentOrPathRequiredError,
  ExecuteError,
  FlowNotFoundError,
  NoRequestsFoundError,
  ParseError,
  PathOutsideWorkspaceError,
  RequestIndexOutOfRangeError,
  RequestNotFoundError,
  SessionNotFoundError
} from '../errors';
import type {
  ExecuteRequest,
  ExecuteResponse,
  ExecuteSSERequest,
  ExecutionSource,
  ExecutionStatus
} from '../schemas';
import type { ConfigService } from './config-service';
import type { FlowManager } from './flow-manager';
import { type SessionManager, withSessionLock } from './session-manager';
import type { PluginHookInfo, ServiceContext, Session, StoredExecution } from './types';
import {
  concatUint8,
  type FetchResponse,
  generateId,
  generateReqExecId,
  isBinaryContent,
  restoreCookieJarFromData
} from './utils';

export interface ExecutionEngine {
  execute(request: ExecuteRequest): Promise<ExecuteResponse>;
  executeSSE(request: ExecuteSSERequest): AsyncIterable<SSEMessage>;
}

export function createExecutionEngine(
  context: ServiceContext,
  sessionManager: SessionManager,
  flowManager: FlowManager,
  configService: ConfigService
): ExecutionEngine {
  const bumpTime = (prev: number): number => {
    const n = context.now();
    return n > prev ? n : prev + 1;
  };

  async function execute(request: ExecuteRequest): Promise<ExecuteResponse> {
    const runId = generateId();
    const startTime = Date.now();

    // Flow tracking - generate reqExecId if flowId is provided
    const flowId = request.flowId;
    const flow = flowId ? flowManager.get(flowId) : undefined;
    const reqExecId = flow ? generateReqExecId() : undefined;

    // Validate flow exists if flowId provided
    if (flowId && !flow) {
      throw new FlowNotFoundError(flowId);
    }

    // Execution tracker - mutable state updated by engine events
    const execTracker = {
      urlResolved: undefined as string | undefined,
      status: 'pending' as ExecutionStatus,
      error: undefined as { stage: string; message: string } | undefined,
      failureEmitted: false
    };

    const failExecution = (stage: string, message: string) => {
      execTracker.status = 'failed';
      execTracker.error = { stage, message };

      if (flow && reqExecId) {
        const exec = flow.executions.get(reqExecId);
        if (exec) {
          exec.status = 'failed';
          exec.error = execTracker.error;
          const endTime = Date.now();
          exec.timing.endTime = endTime;
          exec.timing.durationMs = endTime - startTime;
        }

        if (!execTracker.failureEmitted) {
          execTracker.failureEmitted = true;
          flowManager.emitEvent(flow, runId, reqExecId, {
            type: 'executionFailed',
            stage,
            message
          });
        }
      }
    };

    let content: string;
    let httpFilePath: string | undefined;
    let basePath: string;

    // Load content
    if (request.path !== undefined) {
      if (!isPathSafe(context.workspaceRoot, request.path)) {
        throw new PathOutsideWorkspaceError(request.path);
      }
      httpFilePath = request.path;
      const absolutePath = resolve(context.workspaceRoot, request.path);
      content = await Bun.file(absolutePath).text();
      basePath = dirname(absolutePath);
    } else if (request.content !== undefined) {
      content = request.content;
      if (request.basePath !== undefined) {
        // basePath must be workspace-scoped (security boundary)
        // - Reject absolute basePath (path.resolve would ignore workspaceRoot)
        // - Reject traversal / symlink escape via isPathSafe(realpath containment)
        if (isAbsolute(request.basePath) || !isPathSafe(context.workspaceRoot, request.basePath)) {
          throw new PathOutsideWorkspaceError(request.basePath);
        }
        basePath = resolve(context.workspaceRoot, request.basePath);
      } else {
        basePath = context.workspaceRoot;
      }
    } else {
      throw new ContentOrPathRequiredError();
    }

    // Resolve project config
    const startDir = httpFilePath
      ? dirname(resolve(context.workspaceRoot, httpFilePath))
      : context.workspaceRoot;

    // Build layered overrides from session + request variables (last wins)
    const sessionVars = request.sessionId
      ? (sessionManager.getInternal(request.sessionId)?.variables ?? {})
      : {};
    const overrideLayers: Array<{
      name: string;
      overrides: { variables: Record<string, unknown> };
    }> = [];

    if (Object.keys(sessionVars).length > 0) {
      overrideLayers.push({ name: 'session', overrides: { variables: sessionVars } });
    }

    if (request.variables && Object.keys(request.variables).length > 0) {
      overrideLayers.push({ name: 'request', overrides: { variables: request.variables } });
    }

    const resolvedConfig = await resolveProjectConfig({
      startDir,
      stopDir: context.workspaceRoot,
      profile: request.profile,
      overrideLayers
    });

    const { config: projectConfig } = resolvedConfig;

    // Parse and select request
    let parsedRequests: ReturnType<typeof parse>;
    try {
      parsedRequests = parse(content);
    } catch (err) {
      throw new ParseError(err instanceof Error ? err.message : String(err));
    }

    if (parsedRequests.length === 0) {
      throw new NoRequestsFoundError();
    }

    let selectedIndex = 0;
    let selectedRequest = parsedRequests[0];

    if (request.requestName !== undefined) {
      const found = parsedRequests.findIndex((r) => r.name === request.requestName);
      if (found === -1) {
        throw new RequestNotFoundError(`name '${request.requestName}'`);
      }
      selectedIndex = found;
      selectedRequest = parsedRequests[found];
    } else if (request.requestIndex !== undefined) {
      if (request.requestIndex < 0 || request.requestIndex >= parsedRequests.length) {
        throw new RequestIndexOutOfRangeError(request.requestIndex, parsedRequests.length - 1);
      }
      selectedIndex = request.requestIndex;
      selectedRequest = parsedRequests[request.requestIndex];
    }

    if (!selectedRequest) {
      throw new NoRequestsFoundError();
    }

    // Build execution source info
    const executionSource: ExecutionSource | undefined = request.path
      ? {
          kind: 'file' as const,
          path: request.path,
          requestIndex: selectedIndex,
          requestName: request.requestName
        }
      : {
          kind: 'string' as const,
          requestIndex: selectedIndex,
          requestName: request.requestName
        };

    // Emit requestQueued and create pending execution record if flow tracking enabled
    if (flow && reqExecId) {
      // Create pending execution record
      const pendingExecution: StoredExecution = {
        reqExecId,
        flowId: flow.id,
        sessionId: request.sessionId,
        reqLabel: request.reqLabel ?? request.path,
        source: executionSource,
        rawHttpBlock: selectedRequest.raw,
        method: selectedRequest.method,
        urlTemplate: selectedRequest.url,
        urlResolved: undefined, // Will be set by fetchStarted event
        headers: Object.entries(selectedRequest.headers).map(([name, value]) => ({ name, value })),
        bodyPreview: selectedRequest.body?.slice(0, 1000),
        timing: {
          startTime,
          endTime: undefined,
          durationMs: undefined
        },
        response: undefined,
        status: 'pending',
        error: undefined
      };

      flowManager.storeExecution(flow.id, pendingExecution);

      // Emit requestQueued event
      flowManager.emitEvent(flow, runId, reqExecId, {
        type: 'requestQueued',
        reqLabel: request.reqLabel ?? request.path,
        source: executionSource
      });
    }

    // Create flow-aware event handler that captures urlResolved and updates execution status
    const createFlowEventHandler = (sessionId: string | undefined) => {
      return (event: { type: string } & Record<string, unknown>) => {
        // Capture resolved URL from fetchStarted
        if (event.type === 'fetchStarted' && typeof event.url === 'string') {
          execTracker.urlResolved = event.url;
          execTracker.status = 'running';

          // Update stored execution with resolved URL and running status
          if (flow && reqExecId) {
            const exec = flow.executions.get(reqExecId);
            if (exec) {
              exec.urlResolved = event.url;
              exec.status = 'running';
            }
          }
        }

        // Capture TTFB from fetchFinished
        if (event.type === 'fetchFinished' && typeof event.ttfb === 'number') {
          if (flow && reqExecId) {
            const exec = flow.executions.get(reqExecId);
            if (exec) {
              exec.timing.ttfb = event.ttfb;
            }
          }
        }

        // Capture errors
        if (event.type === 'error') {
          const stage = String(event.stage ?? 'unknown');
          const message = String(event.message ?? 'Unknown error');
          failExecution(stage, message);
        }

        // Capture plugin hook execution info
        if (event.type === 'pluginHookFinished' && flow && reqExecId) {
          const exec = flow.executions.get(reqExecId);
          if (exec) {
            const hookInfo: PluginHookInfo = {
              pluginName: String(event.name ?? 'unknown'),
              hook: String(event.hook ?? 'unknown'),
              durationMs: typeof event.durationMs === 'number' ? event.durationMs : 0,
              modified: Boolean(event.modified)
            };
            exec.pluginHooks = exec.pluginHooks ?? [];
            exec.pluginHooks.push(hookInfo);
          }
        }

        // Emit to subscribers with flow context
        if (flow && reqExecId) {
          flowManager.emitEvent(flow, runId, reqExecId, event);
        } else {
          // Legacy non-flow event emission
          context.onEvent?.(sessionId, runId, event);
        }
      };
    };

    const runStateless = async (): Promise<{
      response: Response;
      session?: Session;
      cookiesChanged: boolean;
    }> => {
      const eventHandler = createFlowEventHandler(undefined);

      if (!projectConfig.cookies.enabled) {
        // No cookies at all
        const { engineOptions, requestDefaults } = buildEngineOptions({
          config: projectConfig,
          onEvent: eventHandler
        });

        const engine = createEngine(engineOptions);

        try {
          const response = await engine.runString(selectedRequest.raw, {
            variables: projectConfig.variables,
            basePath,
            timeoutMs: request.timeoutMs ?? requestDefaults.timeoutMs,
            followRedirects: request.followRedirects ?? requestDefaults.followRedirects,
            validateSSL: request.validateSSL ?? requestDefaults.validateSSL
          });
          return { response, session: undefined, cookiesChanged: false };
        } catch (err) {
          throw new ExecuteError(
            `Execution failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      // Cookies enabled: memory or persistent
      if (projectConfig.cookies.mode === 'persistent' && projectConfig.cookies.jarPath) {
        const jarPath = resolve(projectConfig.projectRoot, projectConfig.cookies.jarPath);
        const manager = createCookieJarManager(jarPath);

        // LOCKED: persistent stateless runs are wrapped in per-jar lock (load → run → save)
        return await manager.withLock(async () => {
          const cookieJar = createCookieJar();
          restoreCookieJarFromData(cookieJar, manager.load());

          const cookieStore = createCookieStoreFromJar(cookieJar);

          const { engineOptions, requestDefaults } = buildEngineOptions({
            config: projectConfig,
            cookieStore,
            onEvent: eventHandler
          });

          const engine = createEngine(engineOptions);

          try {
            const response = await engine.runString(selectedRequest.raw, {
              variables: projectConfig.variables,
              basePath,
              timeoutMs: request.timeoutMs ?? requestDefaults.timeoutMs,
              followRedirects: request.followRedirects ?? requestDefaults.followRedirects,
              validateSSL: request.validateSSL ?? requestDefaults.validateSSL
            });

            manager.save(cookieJar);
            return { response, session: undefined, cookiesChanged: false };
          } catch (err) {
            throw new ExecuteError(
              `Execution failed: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        });
      }

      // Memory mode: fresh jar per request, no persistence
      const cookieJar = createCookieJar();
      const cookieStore = createCookieStoreFromJar(cookieJar);

      const { engineOptions, requestDefaults } = buildEngineOptions({
        config: projectConfig,
        cookieStore,
        onEvent: eventHandler
      });

      const engine = createEngine(engineOptions);

      try {
        const response = await engine.runString(selectedRequest.raw, {
          variables: projectConfig.variables,
          basePath,
          timeoutMs: request.timeoutMs ?? requestDefaults.timeoutMs,
          followRedirects: request.followRedirects ?? requestDefaults.followRedirects,
          validateSSL: request.validateSSL ?? requestDefaults.validateSSL
        });
        return { response, session: undefined, cookiesChanged: false };
      } catch (err) {
        throw new ExecuteError(
          `Execution failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    };

    const runInSession = async (
      session: Session
    ): Promise<{
      response: Response;
      session: Session;
      cookiesChanged: boolean;
    }> => {
      session.lastUsedAt = bumpTime(session.lastUsedAt);

      let cookiesChanged = false;

      // Ensure session cookie persistence is configured + loaded if enabled.
      if (
        projectConfig.cookies.enabled &&
        projectConfig.cookies.mode === 'persistent' &&
        projectConfig.cookies.jarPath
      ) {
        const jarPath = resolve(projectConfig.projectRoot, projectConfig.cookies.jarPath);

        if (session.cookieJarPath !== jarPath) {
          const manager = createCookieJarManager(jarPath);
          await manager.withLock(async () => {
            const jar = createCookieJar();
            restoreCookieJarFromData(jar, manager.load());
            session.cookieJar = jar;
            session.cookieStore = createCookieStoreFromJar(jar);
            session.cookieJarPath = jarPath;
          });
        } else {
          session.cookieJarPath = jarPath;
        }
      } else {
        // Not persistent for this run; don't write back to a previous jar path.
        session.cookieJarPath = undefined;
      }

      const cookieStore: CookieStore = {
        getCookieHeader: async (url) => {
          return await session.cookieStore.getCookieHeader(url);
        },
        setFromResponse: async (url, resp) => {
          cookiesChanged = true;
          await session.cookieStore.setFromResponse(url, resp);
        }
      };

      // Build engine options using centralized helper with flow-aware event handler
      const sessionEventHandler = createFlowEventHandler(session.id);
      const { engineOptions, requestDefaults } = buildEngineOptions({
        config: projectConfig,
        cookieStore: projectConfig.cookies.enabled ? cookieStore : undefined,
        onEvent: sessionEventHandler
      });

      const engine = createEngine(engineOptions);

      let response: Response;
      try {
        response = await engine.runString(selectedRequest.raw, {
          variables: projectConfig.variables,
          basePath,
          timeoutMs: request.timeoutMs ?? requestDefaults.timeoutMs,
          followRedirects: request.followRedirects ?? requestDefaults.followRedirects,
          validateSSL: request.validateSSL ?? requestDefaults.validateSSL
        });
      } catch (err) {
        throw new ExecuteError(
          `Execution failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      return { response, session, cookiesChanged };
    };

    const sessionId = request.sessionId;
    let response: Response;
    let session: Session | undefined;
    let cookiesChanged: boolean;

    try {
      const result =
        sessionId !== undefined
          ? await (async () => {
              const s = sessionManager.getInternal(sessionId);
              if (!s) throw new SessionNotFoundError(sessionId);
              return await withSessionLock(s, async () => await runInSession(s));
            })()
          : await runStateless();

      response = result.response;
      session = result.session;
      cookiesChanged = result.cookiesChanged;
    } catch (err) {
      // Ensure the execution record is finalized as failed for Observer Mode.
      // This covers error paths where the engine did not emit an `error` event.
      const message = err instanceof Error ? err.message : String(err);
      failExecution('execute', message);
      throw err;
    }

    const endTime = Date.now();

    // Process response - use type assertion for Bun compatibility
    const fetchResponse = response as unknown as FetchResponse;
    const responseHeaders: Array<{ name: string; value: string }> = [];

    // Preserve multi-value set-cookie headers when available
    const headersAny = fetchResponse.headers as unknown as Record<string, unknown>;
    const setCookies =
      typeof headersAny.getSetCookie === 'function'
        ? (headersAny.getSetCookie as () => string[])()
        : [];
    for (const cookie of setCookies) {
      responseHeaders.push({ name: 'set-cookie', value: cookie });
    }

    fetchResponse.headers.forEach((value: string, name: string) => {
      const lower = name.toLowerCase();
      if (lower === 'set-cookie') return; // handled above (multi-value)
      responseHeaders.push({ name: lower, value });
    });

    // Handle body
    let body: string | undefined;
    let encoding: 'utf-8' | 'base64' = 'utf-8';
    let truncated = false;
    let bodyBytes = 0;
    let bodyMode: 'buffered' | 'none' = 'none';

    try {
      // Stream-read up to maxBodyBytes (+1 sentinel) to avoid buffering huge bodies.
      const clone = fetchResponse.clone();
      const stream = clone.body;

      if (stream) {
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        let collected = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value || value.byteLength === 0) continue;

          const remaining = context.maxBodyBytes - collected;
          if (remaining <= 0) {
            truncated = true;
            try {
              await reader.cancel();
            } catch {
              // noop
            }
            break;
          }

          if (value.byteLength > remaining) {
            chunks.push(value.slice(0, remaining));
            collected += remaining;
            truncated = true;
            try {
              await reader.cancel();
            } catch {
              // noop
            }
            break;
          }

          chunks.push(value);
          collected += value.byteLength;
        }

        bodyBytes = collected;

        if (collected > 0) {
          bodyMode = 'buffered';

          const bytes = concatUint8(chunks, collected);
          const ab = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength
          ) as ArrayBuffer;

          if (isBinaryContent(ab)) {
            encoding = 'base64';
            body = Buffer.from(bytes).toString('base64');
          } else {
            body = new TextDecoder().decode(bytes);
          }
        }
      }
    } catch (err) {
      bodyMode = 'none';
      console.error('Failed to process response body:', err);
    }

    if (session && cookiesChanged) {
      session.snapshotVersion++;

      // Schedule debounced save for persistent cookies
      if (session.cookieJarPath) {
        scheduleCookieJarSave(session.cookieJarPath, session.cookieJar);
      }

      context.onEvent?.(session.id, runId, {
        type: 'sessionUpdated',
        variablesChanged: false,
        cookiesChanged: true
      });
    }

    const resolved = configService.getResolvedPaths(httpFilePath, resolvedConfig);

    const responseData = {
      status: fetchResponse.status,
      statusText: fetchResponse.statusText,
      headers: responseHeaders,
      bodyMode,
      body,
      encoding,
      truncated,
      bodyBytes
    };

    // Update stored execution with final response data if flow tracking is enabled
    if (flow && reqExecId) {
      const exec = flow.executions.get(reqExecId);
      if (exec) {
        // Update with captured urlResolved from fetchStarted event
        exec.urlResolved = execTracker.urlResolved ?? selectedRequest.url;

        // Update timing
        exec.timing.endTime = endTime;
        exec.timing.durationMs = endTime - startTime;

        // Store response
        exec.response = {
          status: fetchResponse.status,
          statusText: fetchResponse.statusText,
          headers: responseHeaders,
          body,
          encoding,
          truncated,
          bodyBytes
        };

        // Set final status: use tracker status if failed, otherwise success
        exec.status = execTracker.status === 'failed' ? 'failed' : 'success';
        exec.error = execTracker.error;

        // Update flow activity
        flow.lastActivityAt = context.now();
      }
    }

    return {
      runId,
      ...(reqExecId ? { reqExecId } : {}),
      ...(flowId ? { flowId } : {}),
      ...(session
        ? {
            session: {
              sessionId: session.id,
              snapshotVersion: session.snapshotVersion
            }
          }
        : {}),
      request: {
        index: selectedIndex,
        name: selectedRequest.name,
        method: selectedRequest.method,
        url: selectedRequest.url
      },
      resolved,
      response: responseData,
      limits: {
        maxBodyBytes: context.maxBodyBytes
      },
      timing: {
        startTime,
        endTime,
        durationMs: endTime - startTime
      }
    };
  }

  async function* executeSSE(request: ExecuteSSERequest): AsyncGenerator<SSEMessage> {
    let content: string;
    let basePath: string;

    // Load content
    if (request.path !== undefined) {
      if (!isPathSafe(context.workspaceRoot, request.path)) {
        throw new PathOutsideWorkspaceError(request.path);
      }
      const absolutePath = resolve(context.workspaceRoot, request.path);
      content = await Bun.file(absolutePath).text();
      basePath = dirname(absolutePath);
    } else if (request.content !== undefined) {
      content = request.content;
      basePath = context.workspaceRoot;
    } else {
      throw new ContentOrPathRequiredError();
    }

    // Parse and select request
    let parsedRequests: ReturnType<typeof parse>;
    try {
      parsedRequests = parse(content);
    } catch (err) {
      throw new ParseError(err instanceof Error ? err.message : String(err));
    }

    if (parsedRequests.length === 0) {
      throw new NoRequestsFoundError();
    }

    let selectedRequest = parsedRequests[0];

    if (request.requestName !== undefined) {
      const found = parsedRequests.findIndex((r) => r.name === request.requestName);
      if (found === -1) {
        throw new RequestNotFoundError(`name '${request.requestName}'`);
      }
      selectedRequest = parsedRequests[found];
    } else if (request.requestIndex !== undefined) {
      if (request.requestIndex < 0 || request.requestIndex >= parsedRequests.length) {
        throw new RequestIndexOutOfRangeError(request.requestIndex, parsedRequests.length - 1);
      }
      selectedRequest = parsedRequests[request.requestIndex];
    }

    if (!selectedRequest) {
      throw new NoRequestsFoundError();
    }

    // Verify this is an SSE request
    if (selectedRequest.protocol !== 'sse') {
      const accept = selectedRequest.headers['Accept'] || selectedRequest.headers['accept'];
      if (!accept?.includes('text/event-stream')) {
        throw new ExecuteError(
          'Request is not an SSE request. Add @sse directive or Accept: text/event-stream header.'
        );
      }
    }

    // Resolve project config
    const startDir = request.path
      ? dirname(resolve(context.workspaceRoot, request.path))
      : context.workspaceRoot;

    const resolvedConfig = await resolveProjectConfig({
      startDir,
      stopDir: context.workspaceRoot,
      profile: request.profile,
      overrideLayers: request.variables
        ? [{ name: 'request', overrides: { variables: request.variables } }]
        : []
    });

    const { config: projectConfig } = resolvedConfig;

    // Build engine options
    const { engineOptions } = buildEngineOptions({
      config: projectConfig
    });

    const engine = createEngine(engineOptions);

    try {
      const stream = await engine.streamString(selectedRequest.raw, {
        variables: projectConfig.variables,
        basePath,
        timeoutMs: request.timeout,
        lastEventId: request.lastEventId
      });

      // Yield messages from the stream
      for await (const message of stream) {
        yield message;
      }
    } catch (err) {
      throw new ExecuteError(
        `SSE execution failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return {
    execute,
    executeSSE
  };
}
