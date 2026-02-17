import { createEngine, type SSEMessage } from '@t-req/core';
import { buildEngineOptions, resolveProjectConfig } from '@t-req/core/config';
import { createCookieJar } from '@t-req/core/cookies';
import { createCookieJarManager, scheduleCookieJarSave } from '@t-req/core/cookies/persistence';
import type { CookieStore } from '@t-req/core/runtime';
import { createCookieStoreFromJar, dirname, resolve } from '../../utils';
import { ExecuteError, FlowNotFoundError, SessionNotFoundError } from '../errors';
import type {
  ExecuteRequest,
  ExecuteResponse,
  ExecuteSSERequest,
  ExecuteWSRequest,
  ExecutionSource
} from '../schemas';
import type { ConfigService } from './config-service';
import { loadContent, parseDocumentContent, selectRequest } from './content-loader';
import { createWsExecutor, type ExecuteWSResult } from './execution/ws-executor';
import type { FlowManager } from './flow-manager';
import { createFlowTracker } from './flow-tracker';
import { extractResponseHeaders, processResponseBody } from './response-processor';
import { type SessionManager, withSessionLock } from './session-manager';
import type { ServiceContext, Session } from './types';
import {
  type FetchResponse,
  generateId,
  generateReqExecId,
  restoreCookieJarFromData
} from './utils';

export interface ExecutionEngine {
  execute(request: ExecuteRequest): Promise<ExecuteResponse>;
  executeSSE(request: ExecuteSSERequest): AsyncIterable<SSEMessage>;
  executeWS(request: ExecuteWSRequest): Promise<ExecuteWSResult>;
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

    // Flow tracking setup
    const flowId = request.flowId;
    const flow = flowId ? flowManager.get(flowId) : undefined;
    const reqExecId = flow ? generateReqExecId() : undefined;

    if (flowId && !flow) {
      throw new FlowNotFoundError(flowId);
    }

    const tracker = createFlowTracker(flowManager, context, flow, runId, reqExecId, startTime);

    // Load + parse + select
    const { content, httpFilePath, basePath } = await loadContent(context.workspaceRoot, request);
    const { requests: parsedRequests, fileVariables } = parseDocumentContent(content);
    const { selectedRequest, selectedIndex } = selectRequest(parsedRequests, {
      requestName: request.requestName,
      requestIndex: request.requestIndex
    });

    // Resolve project config
    const startDir = httpFilePath
      ? dirname(resolve(context.workspaceRoot, httpFilePath))
      : context.workspaceRoot;

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

    // Stamp execution context for plugin reports
    projectConfig.pluginManager?.setExecutionContext({
      runId,
      flowId,
      reqExecId,
      now: context.now
    });

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

    // Init pending execution in flow tracker
    if (reqExecId) {
      tracker.initPendingExecution({
        reqExecId,
        sessionId: request.sessionId,
        reqLabel: request.reqLabel ?? request.path,
        source: executionSource,
        selectedRequest,
        startTime
      });
    }

    // Execute
    const runStateless = async (): Promise<{
      response: Response;
      session?: Session;
      cookiesChanged: boolean;
    }> => {
      const eventHandler = tracker.createEventHandler(undefined);

      if (!projectConfig.cookies.enabled) {
        const { engineOptions, requestDefaults } = buildEngineOptions({
          config: projectConfig,
          onEvent: eventHandler
        });

        const engine = createEngine(engineOptions);

        try {
          const response = await engine.runString(selectedRequest.raw, {
            variables: { ...fileVariables, ...projectConfig.variables },
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

      // Cookies enabled: persistent
      if (projectConfig.cookies.mode === 'persistent' && projectConfig.cookies.jarPath) {
        const jarPath = resolve(projectConfig.projectRoot, projectConfig.cookies.jarPath);
        const manager = createCookieJarManager(jarPath);

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
              variables: { ...fileVariables, ...projectConfig.variables },
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

      // Memory mode
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
          variables: { ...fileVariables, ...projectConfig.variables },
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

      const sessionEventHandler = tracker.createEventHandler(session.id);
      const { engineOptions, requestDefaults } = buildEngineOptions({
        config: projectConfig,
        cookieStore: projectConfig.cookies.enabled ? cookieStore : undefined,
        onEvent: sessionEventHandler
      });

      const engine = createEngine(engineOptions);

      let response: Response;
      try {
        response = await engine.runString(selectedRequest.raw, {
          variables: { ...fileVariables, ...projectConfig.variables },
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
      const message = err instanceof Error ? err.message : String(err);
      tracker.failExecution('execute', message);
      throw err;
    }

    const endTime = Date.now();

    // Process response
    const fetchResponse = response as unknown as FetchResponse;
    const responseHeaders = extractResponseHeaders(fetchResponse);
    const processedBody = await processResponseBody(fetchResponse, context.maxBodyBytes);

    if (session && cookiesChanged) {
      session.snapshotVersion++;

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
      bodyMode: processedBody.bodyMode,
      body: processedBody.body,
      encoding: processedBody.encoding,
      truncated: processedBody.truncated,
      bodyBytes: processedBody.bodyBytes
    };

    // Finalize flow tracking
    if (reqExecId) {
      tracker.finalizeExecution({
        reqExecId,
        selectedRequest,
        endTime,
        startTime,
        responseData: {
          status: fetchResponse.status,
          statusText: fetchResponse.statusText,
          headers: responseHeaders,
          body: processedBody.body,
          encoding: processedBody.encoding,
          truncated: processedBody.truncated,
          bodyBytes: processedBody.bodyBytes
        }
      });
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
      },
      pluginReports: projectConfig.pluginManager?.getReports() ?? []
    };
  }

  async function* executeSSE(request: ExecuteSSERequest): AsyncGenerator<SSEMessage> {
    // Load + parse + select (reusing content-loader)
    const { content, basePath } = await loadContent(context.workspaceRoot, request);
    const { requests: parsedRequests, fileVariables: sseFileVariables } =
      parseDocumentContent(content);
    const { selectedRequest } = selectRequest(parsedRequests, {
      requestName: request.requestName,
      requestIndex: request.requestIndex
    });

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
        variables: { ...sseFileVariables, ...projectConfig.variables },
        basePath,
        timeoutMs: request.timeout,
        lastEventId: request.lastEventId
      });

      for await (const message of stream) {
        yield message;
      }
    } catch (err) {
      throw new ExecuteError(
        `SSE execution failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const executeWS = createWsExecutor({
    context,
    sessionManager,
    flowManager,
    configService
  });

  return {
    execute,
    executeSSE,
    executeWS
  };
}
