import type { TreqClient } from './gen/sdk.gen';
import type { GetEventResponses, PostExecuteWsData, PostExecuteWsResponses } from './gen/types.gen';

const DEFAULT_BASE_URL = 'http://localhost:4097';
const DEFAULT_OPEN_TIMEOUT_MS = 10000;

export type ObserverWsEventEnvelope = GetEventResponses[200];

export type WsPayloadType = 'text' | 'json' | 'binary';
export type WsPayloadEncoding = 'utf-8' | 'base64';

export type WsSessionServerEventType =
  | 'session.opened'
  | 'session.inbound'
  | 'session.outbound'
  | 'session.closed'
  | 'session.error'
  | 'session.replay.end';

export type WsSessionClientEventType = 'session.send' | 'session.close' | 'session.ping';

export interface WsSessionServerEnvelope {
  type: WsSessionServerEventType;
  ts: number;
  seq: number;
  wsSessionId: string;
  flowId?: string;
  reqExecId?: string;
  payloadType?: WsPayloadType;
  encoding?: WsPayloadEncoding;
  byteLength?: number;
  payload?: unknown;
  error?: { code: string; message: string };
}

export interface WsSessionClientEnvelope {
  type: WsSessionClientEventType;
  payloadType?: WsPayloadType;
  encoding?: WsPayloadEncoding;
  payload?: unknown;
  code?: number;
  reason?: string;
}

export class WsHelperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WsHelperError';
  }
}

type HeadersLike = Record<string, string>;
type WebSocketInit = { headers?: HeadersLike };

export type WebSocketFactory = (url: string, init?: WebSocketInit) => WebSocket;

export interface WsBaseConnectOptions {
  baseUrl?: string;
  token?: string;
  client?: TreqClient;
  webSocketFactory?: WebSocketFactory;
  openTimeoutMs?: number;
}

export interface ConnectObserverWsOptions extends WsBaseConnectOptions {
  sessionId?: string;
  flowId?: string;
  afterSeq?: number;
}

export interface ConnectRequestWsSessionOptions extends WsBaseConnectOptions {
  afterSeq?: number;
  downstreamPath?: string;
}

export interface ExecuteAndConnectRequestWsOptions extends ConnectRequestWsSessionOptions {
  client: TreqClient;
  request: NonNullable<PostExecuteWsData['body']>;
}

export interface ObserverWsConnection extends AsyncIterable<ObserverWsEventEnvelope> {
  readonly url: string;
  close(code?: number, reason?: string): void;
  reconnect(afterSeq?: number): Promise<ObserverWsConnection>;
}

export interface RequestWsSessionConnection extends AsyncIterable<WsSessionServerEnvelope> {
  readonly url: string;
  readonly wsSessionId: string;
  sendText(payload: string): void;
  sendJson(payload: unknown): void;
  ping(): void;
  close(code?: number, reason?: string): void;
  disconnect(code?: number, reason?: string): void;
  reconnect(afterSeq?: number): Promise<RequestWsSessionConnection>;
}

export interface ExecuteAndConnectRequestWsResult {
  execute: PostExecuteWsResponses[200];
  connection: RequestWsSessionConnection;
}

type GeneratedResponse<T> = Promise<{ data?: T; error?: unknown; response?: Response }>;

type PendingIterator<T> = {
  resolve: (result: IteratorResult<T>) => void;
  reject: (error: unknown) => void;
};

function getClientConfig(client: TreqClient | undefined): { baseUrl?: string; headers?: unknown } {
  if (!client) return {};

  const maybeClient = client as unknown as {
    client?: { getConfig?: () => { baseUrl?: string; headers?: unknown } };
  };
  return maybeClient.client?.getConfig?.() ?? {};
}

function resolveBaseUrl(options: WsBaseConnectOptions): string {
  if (options.baseUrl) return options.baseUrl;
  const configBaseUrl = getClientConfig(options.client).baseUrl;
  return configBaseUrl ?? DEFAULT_BASE_URL;
}

function resolveAuthorizationHeader(options: WsBaseConnectOptions): string | undefined {
  if (options.token) return `Bearer ${options.token}`;

  const headers = getClientConfig(options.client).headers;
  if (!headers) return undefined;

  if (headers instanceof Headers) {
    return headers.get('Authorization') ?? headers.get('authorization') ?? undefined;
  }

  if (typeof headers === 'object') {
    const record = headers as Record<string, unknown>;
    const value = record.Authorization ?? record.authorization;
    return typeof value === 'string' ? value : undefined;
  }

  return undefined;
}

function joinPaths(basePath: string, suffixPath: string): string {
  const normalizedBase = basePath === '/' ? '' : basePath.replace(/\/+$/, '');
  const normalizedSuffix = suffixPath.startsWith('/') ? suffixPath : `/${suffixPath}`;
  return `${normalizedBase}${normalizedSuffix}`;
}

function buildWebSocketUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | undefined>
): string {
  const url = new URL(baseUrl);
  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  } else if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new WsHelperError(`Unsupported base URL protocol: ${url.protocol}`);
  }

  url.pathname = joinPaths(url.pathname, path);
  url.search = '';
  url.hash = '';

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function defaultWebSocketFactory(url: string, init?: WebSocketInit): WebSocket {
  if (!init?.headers || Object.keys(init.headers).length === 0) {
    return new WebSocket(url);
  }

  const isBunRuntime = typeof Bun !== 'undefined';
  if (!isBunRuntime) {
    throw new WsHelperError(
      'Default WebSocket transport cannot attach auth headers in this runtime. Provide webSocketFactory for token-authenticated WebSocket connections.'
    );
  }

  try {
    return new WebSocket(url, init as unknown as string | string[]);
  } catch {
    throw new WsHelperError(
      'Runtime WebSocket constructor does not support custom headers. Provide webSocketFactory for token-authenticated WebSocket connections.'
    );
  }
}

function createIteratorQueue<T>() {
  const values: T[] = [];
  const pending: PendingIterator<T>[] = [];
  let closed = false;
  let closeError: unknown;

  const push = (value: T) => {
    if (closed) return;
    const waiter = pending.shift();
    if (waiter) {
      waiter.resolve({ done: false, value });
      return;
    }
    values.push(value);
  };

  const close = (error?: unknown) => {
    if (closed) return;
    closed = true;
    closeError = error;

    while (pending.length > 0) {
      const waiter = pending.shift();
      if (!waiter) continue;
      if (error !== undefined) {
        waiter.reject(error);
      } else {
        waiter.resolve({ done: true, value: undefined as never });
      }
    }
  };

  const next = async (): Promise<IteratorResult<T>> => {
    if (values.length > 0) {
      const value = values.shift();
      if (value !== undefined) {
        return { done: false, value };
      }
    }

    if (closed) {
      if (closeError !== undefined) {
        throw closeError;
      }
      return { done: true, value: undefined as never };
    }

    return await new Promise<IteratorResult<T>>((resolve, reject) => {
      pending.push({ resolve, reject });
    });
  };

  const iterate = async function* (): AsyncGenerator<T, void, void> {
    while (true) {
      const item = await next();
      if (item.done) return;
      yield item.value;
    }
  };

  return { push, close, iterate };
}

function decodeEventData(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(data));
  }

  if (data instanceof Uint8Array) {
    return new TextDecoder().decode(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }

  throw new WsHelperError('WebSocket message payload must be UTF-8 JSON text');
}

function parseEnvelope<T>(raw: string, channelLabel: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new WsHelperError(`Failed to parse ${channelLabel} envelope`);
  }
}

async function waitForOpen(socket: WebSocket, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new WsHelperError(`Timed out opening WebSocket after ${timeoutMs}ms`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('error', onError);
      socket.removeEventListener('close', onClose);
    };

    const onOpen = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new WsHelperError('WebSocket connection failed before open'));
    };

    const onClose = () => {
      cleanup();
      reject(new WsHelperError('WebSocket closed before open'));
    };

    socket.addEventListener('open', onOpen, { once: true });
    socket.addEventListener('error', onError, { once: true });
    socket.addEventListener('close', onClose, { once: true });
  });
}

async function openEnvelopeSocket<TEnvelope>(
  url: string,
  options: WsBaseConnectOptions,
  channelLabel: string
): Promise<{ socket: WebSocket; iterate: () => AsyncGenerator<TEnvelope, void, void> }> {
  const authHeader = resolveAuthorizationHeader(options);
  const wsFactory = options.webSocketFactory ?? defaultWebSocketFactory;
  const socket = wsFactory(
    url,
    authHeader ? { headers: { Authorization: authHeader } } : undefined
  );
  socket.binaryType = 'arraybuffer';

  await waitForOpen(socket, options.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS);

  const queue = createIteratorQueue<TEnvelope>();

  socket.addEventListener('message', (event) => {
    try {
      const raw = decodeEventData(event.data);
      queue.push(parseEnvelope<TEnvelope>(raw, channelLabel));
    } catch (error) {
      queue.close(error);
      try {
        socket.close(1002, 'Invalid envelope');
      } catch {
        // no-op
      }
    }
  });

  socket.addEventListener('error', () => {
    queue.close(new WsHelperError(`${channelLabel} socket error`));
  });

  socket.addEventListener('close', () => {
    queue.close();
  });

  return { socket, iterate: queue.iterate };
}

async function unwrapGenerated<T>(response: GeneratedResponse<T>): Promise<T> {
  const { data, error, response: rawResponse } = await response;
  if (error) {
    const message =
      (error as { error?: { message?: string } })?.error?.message ??
      (error instanceof Error ? error.message : `HTTP ${rawResponse?.status ?? 'unknown'}`);
    throw new WsHelperError(message);
  }

  if (data === undefined) {
    throw new WsHelperError('No data returned from server');
  }

  return data;
}

export async function connectObserverWs(
  options: ConnectObserverWsOptions = {}
): Promise<ObserverWsConnection> {
  const baseUrl = resolveBaseUrl(options);
  const url = buildWebSocketUrl(baseUrl, '/event/ws', {
    sessionId: options.sessionId,
    flowId: options.flowId,
    afterSeq: options.afterSeq
  });

  const { socket, iterate } = await openEnvelopeSocket<ObserverWsEventEnvelope>(
    url,
    options,
    'observer'
  );

  return {
    url,
    close(code = 1000, reason = '') {
      socket.close(code, reason);
    },
    reconnect(afterSeq = options.afterSeq) {
      return connectObserverWs({ ...options, afterSeq });
    },
    [Symbol.asyncIterator]() {
      return iterate();
    }
  };
}

function toSessionCommandPayload(
  payloadType: WsPayloadType,
  payload: unknown
): WsSessionClientEnvelope {
  return {
    type: 'session.send',
    payloadType,
    payload
  };
}

export async function connectRequestWsSession(
  wsSessionId: string,
  options: ConnectRequestWsSessionOptions = {}
): Promise<RequestWsSessionConnection> {
  const baseUrl = resolveBaseUrl(options);
  const downstreamPath = options.downstreamPath ?? `/ws/session/${encodeURIComponent(wsSessionId)}`;
  const url = buildWebSocketUrl(baseUrl, downstreamPath, { afterSeq: options.afterSeq });

  const { socket, iterate } = await openEnvelopeSocket<WsSessionServerEnvelope>(
    url,
    options,
    'request-session'
  );

  const sendCommand = (envelope: WsSessionClientEnvelope) => {
    socket.send(JSON.stringify(envelope));
  };

  return {
    url,
    wsSessionId,
    sendText(payload: string) {
      sendCommand(toSessionCommandPayload('text', payload));
    },
    sendJson(payload: unknown) {
      sendCommand(toSessionCommandPayload('json', payload));
    },
    ping() {
      sendCommand({ type: 'session.ping' });
    },
    close(code = 1000, reason = '') {
      sendCommand({ type: 'session.close', code, reason });
    },
    disconnect(code = 1000, reason = '') {
      socket.close(code, reason);
    },
    reconnect(afterSeq = options.afterSeq) {
      return connectRequestWsSession(wsSessionId, { ...options, afterSeq });
    },
    [Symbol.asyncIterator]() {
      return iterate();
    }
  };
}

export async function executeAndConnectRequestWs(
  options: ExecuteAndConnectRequestWsOptions
): Promise<ExecuteAndConnectRequestWsResult> {
  const execute = await unwrapGenerated<PostExecuteWsResponses[200]>(
    options.client.postExecuteWs({ body: options.request })
  );

  const connection = await connectRequestWsSession(execute.ws.wsSessionId, {
    ...options,
    client: options.client,
    downstreamPath: execute.ws.downstreamPath
  });

  return { execute, connection };
}
