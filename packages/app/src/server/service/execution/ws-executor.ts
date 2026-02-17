import { createInterpolator, type ParsedRequest } from '@t-req/core';
import { buildEngineOptions } from '@t-req/core/config';
import { dirname, resolve } from '../../../utils';
import {
  ExecuteError,
  FlowNotFoundError,
  SessionNotFoundError,
  ValidationError
} from '../../errors';
import type { ExecuteResponse, ExecuteWSRequest } from '../../schemas';
import type { ConfigService } from '../config-service';
import { loadContent, parseDocumentContent, selectRequest } from '../content-loader';
import type { FlowManager } from '../flow-manager';
import type { SessionManager } from '../session-manager';
import type { ServiceContext } from '../types';
import { generateId, generateReqExecId } from '../utils';

const DEFAULT_WS_CONNECT_TIMEOUT_MS = 30000;
const WS_METHOD = 'GET';

type WsRequestSelection = {
  selectedRequest: ParsedRequest;
  selectedIndex: number;
  fileVariables: Record<string, unknown>;
  httpFilePath: string | undefined;
};

type ResolvedWsTarget = {
  upstreamUrl: string;
  headers: Record<string, string>;
  subprotocols: string[] | undefined;
  connectTimeoutMs: number;
};

type WsFlowContext = {
  flowId?: string;
  reqExecId?: string;
};

export type ExecuteWSResult = {
  runId: string;
  flowId?: string;
  reqExecId?: string;
  request: {
    index: number;
    name?: string;
    method: string;
    url: string;
  };
  resolved: ExecuteResponse['resolved'];
  upstreamUrl: string;
  upstreamSocket: WebSocket;
};

export type WsExecutorDependencies = {
  context: ServiceContext;
  sessionManager: SessionManager;
  flowManager: FlowManager;
  configService: ConfigService;
};

function isWebSocketUrl(url: string): boolean {
  return url.startsWith('ws://') || url.startsWith('wss://');
}

function assertWebSocketDefinition(selectedRequest: ParsedRequest): void {
  const protocolIsWs = selectedRequest.protocol === 'ws';
  const urlIsWs = isWebSocketUrl(selectedRequest.url);

  if (!protocolIsWs && !urlIsWs) {
    throw new ExecuteError(
      'Request is not a WebSocket request. Add @ws directive or use ws:// / wss:// URL.'
    );
  }

  const hasBodyDefinition =
    selectedRequest.body !== undefined ||
    selectedRequest.bodyFile !== undefined ||
    Boolean(selectedRequest.formData && selectedRequest.formData.length > 0);

  if (hasBodyDefinition) {
    throw new ValidationError(
      'WebSocket request definitions cannot include body, body file, or form-data in protocol v1.1'
    );
  }

  if (selectedRequest.method.toUpperCase() !== WS_METHOD) {
    throw new ValidationError('WebSocket request definitions must use GET');
  }
}

function resolveFlowContext(flowManager: FlowManager, flowId?: string): WsFlowContext {
  const flow = flowId ? flowManager.get(flowId) : undefined;
  if (flowId && !flow) {
    throw new FlowNotFoundError(flowId);
  }
  return {
    flowId,
    reqExecId: flow ? generateReqExecId() : undefined
  };
}

function getSessionVariables(
  sessionManager: SessionManager,
  sessionId?: string
): Record<string, unknown> {
  if (!sessionId) return {};
  const session = sessionManager.getInternal(sessionId);
  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }
  return session.variables;
}

function getStartDir(workspaceRoot: string, httpFilePath: string | undefined): string {
  return httpFilePath ? dirname(resolve(workspaceRoot, httpFilePath)) : workspaceRoot;
}

async function loadAndSelectWsRequest(
  workspaceRoot: string,
  request: ExecuteWSRequest
): Promise<WsRequestSelection> {
  const { content, httpFilePath } = await loadContent(workspaceRoot, request);
  const { requests: parsedRequests, fileVariables } = parseDocumentContent(content);
  const { selectedRequest, selectedIndex } = selectRequest(parsedRequests, {
    requestName: request.requestName,
    requestIndex: request.requestIndex
  });

  return {
    selectedRequest,
    selectedIndex,
    fileVariables,
    httpFilePath
  };
}

function getDirectiveSubprotocols(selectedRequest: ParsedRequest): string[] | undefined {
  if (selectedRequest.protocolOptions?.type !== 'ws') {
    return undefined;
  }

  return selectedRequest.protocolOptions.subprotocols?.length
    ? selectedRequest.protocolOptions.subprotocols
    : undefined;
}

function parseSubprotocolHeader(headerValue: string | undefined): string[] | undefined {
  if (!headerValue) return undefined;
  const subprotocols = headerValue
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return subprotocols.length > 0 ? subprotocols : undefined;
}

function resolveSubprotocols(
  selectedRequest: ParsedRequest,
  headers: Record<string, string>
): string[] | undefined {
  const directiveSubprotocols = getDirectiveSubprotocols(selectedRequest);
  if (directiveSubprotocols) {
    return directiveSubprotocols;
  }

  return parseSubprotocolHeader(
    headers['Sec-WebSocket-Protocol'] ?? headers['sec-websocket-protocol']
  );
}

function removeSubprotocolHeaders(headers: Record<string, string>): Record<string, string> {
  const nextHeaders = { ...headers };
  delete nextHeaders['Sec-WebSocket-Protocol'];
  delete nextHeaders['sec-websocket-protocol'];
  return nextHeaders;
}

function resolveConnectTimeoutMs(
  request: ExecuteWSRequest,
  selectedRequest: ParsedRequest
): number {
  const requestTimeout = request.connectTimeoutMs;
  const directiveTimeout =
    selectedRequest.protocolOptions?.type === 'ws'
      ? selectedRequest.protocolOptions.connectTimeoutMs
      : undefined;

  return requestTimeout ?? directiveTimeout ?? DEFAULT_WS_CONNECT_TIMEOUT_MS;
}

function buildWebSocketInit(
  headers: Record<string, string>,
  subprotocols: string[] | undefined
): string[] | Bun.WebSocketOptions | undefined {
  const hasHeaders = Object.keys(headers).length > 0;
  const hasSubprotocols = Boolean(subprotocols && subprotocols.length > 0);

  if (!hasHeaders && !hasSubprotocols) {
    return undefined;
  }

  if (hasHeaders && hasSubprotocols) {
    return { headers, protocols: subprotocols } as Bun.WebSocketOptions;
  }

  if (hasHeaders) {
    return { headers } as Bun.WebSocketOptions;
  }

  return subprotocols;
}

function createUpstreamSocket(target: ResolvedWsTarget): WebSocket {
  const wsInit = buildWebSocketInit(target.headers, target.subprotocols);
  let socket: WebSocket;

  if (wsInit === undefined) {
    socket = new WebSocket(target.upstreamUrl);
  } else if (Array.isArray(wsInit)) {
    socket = new WebSocket(target.upstreamUrl, wsInit);
  } else {
    socket = new WebSocket(target.upstreamUrl, wsInit);
  }

  socket.binaryType = 'arraybuffer';
  return socket;
}

async function connectUpstreamSocket(
  upstreamSocket: WebSocket,
  upstreamUrl: string,
  connectTimeoutMs: number
): Promise<void> {
  const connectPromise = new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new ExecuteError(`WebSocket connection failed: ${upstreamUrl}`));
    };
    const onClose = (event: CloseEvent) => {
      cleanup();
      reject(
        new ExecuteError(
          `WebSocket closed before connect completed (${event.code}${event.reason ? `: ${event.reason}` : ''})`
        )
      );
    };

    const cleanup = () => {
      upstreamSocket.removeEventListener('open', onOpen);
      upstreamSocket.removeEventListener('error', onError);
      upstreamSocket.removeEventListener('close', onClose);
    };

    upstreamSocket.addEventListener('open', onOpen);
    upstreamSocket.addEventListener('error', onError);
    upstreamSocket.addEventListener('close', onClose);
  });

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new ExecuteError(`WebSocket connect timed out after ${connectTimeoutMs}ms`));
    }, connectTimeoutMs);
  });

  try {
    await Promise.race([connectPromise, timeoutPromise]);
  } catch (error) {
    try {
      upstreamSocket.close(1001, 'Connect failed');
    } catch {
      // no-op
    }
    throw error;
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function resolveWsTarget(
  selectedRequest: ParsedRequest,
  fileVariables: Record<string, unknown>,
  projectVariables: Record<string, unknown>,
  headerDefaults: Record<string, string> | undefined,
  resolvers: ReturnType<typeof buildEngineOptions>['engineOptions']['resolvers'],
  request: ExecuteWSRequest
): Promise<ResolvedWsTarget> {
  const interpolator = createInterpolator({ resolvers: resolvers ?? {} });
  const interpolated = await interpolator.interpolate(
    {
      url: selectedRequest.url,
      headers: selectedRequest.headers
    },
    { ...fileVariables, ...projectVariables }
  );

  const upstreamUrl = interpolated.url;
  if (!isWebSocketUrl(upstreamUrl)) {
    throw new ValidationError('Resolved WebSocket URL must use ws:// or wss://');
  }

  const mergedHeaders: Record<string, string> = {
    ...(headerDefaults ?? {}),
    ...(interpolated.headers ?? {})
  };

  const subprotocols = resolveSubprotocols(selectedRequest, mergedHeaders);
  const headers = subprotocols ? removeSubprotocolHeaders(mergedHeaders) : mergedHeaders;

  return {
    upstreamUrl,
    headers,
    subprotocols,
    connectTimeoutMs: resolveConnectTimeoutMs(request, selectedRequest)
  };
}

export function createWsExecutor(deps: WsExecutorDependencies) {
  return async function executeWS(request: ExecuteWSRequest): Promise<ExecuteWSResult> {
    const runId = generateId();
    const flowContext = resolveFlowContext(deps.flowManager, request.flowId);

    const { selectedRequest, selectedIndex, fileVariables, httpFilePath } =
      await loadAndSelectWsRequest(deps.context.workspaceRoot, request);

    assertWebSocketDefinition(selectedRequest);

    const sessionVariables = getSessionVariables(deps.sessionManager, request.sessionId);
    const startDir = getStartDir(deps.context.workspaceRoot, httpFilePath);

    const resolvedConfig = await deps.configService.getExecutionBaseConfig({
      startDir,
      profile: request.profile
    });
    const { config: projectConfig } = resolvedConfig;
    const projectVariables: Record<string, unknown> = {
      ...projectConfig.variables,
      ...sessionVariables,
      ...(request.variables ?? {})
    };
    const { engineOptions } = buildEngineOptions({ config: projectConfig });

    const wsTarget = await resolveWsTarget(
      selectedRequest,
      fileVariables,
      projectVariables,
      engineOptions.headerDefaults,
      engineOptions.resolvers,
      request
    );

    const upstreamSocket = createUpstreamSocket(wsTarget);
    await connectUpstreamSocket(upstreamSocket, wsTarget.upstreamUrl, wsTarget.connectTimeoutMs);

    const resolved = deps.configService.getResolvedPaths(httpFilePath, resolvedConfig);

    return {
      runId,
      ...(flowContext.reqExecId ? { reqExecId: flowContext.reqExecId } : {}),
      ...(flowContext.flowId ? { flowId: flowContext.flowId } : {}),
      request: {
        index: selectedIndex,
        name: selectedRequest.name,
        method: selectedRequest.method,
        url: selectedRequest.url
      },
      resolved,
      upstreamUrl: wsTarget.upstreamUrl,
      upstreamSocket
    };
  };
}
