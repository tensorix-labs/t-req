import { createEngine, parse } from '@t-req/core';
import {
  buildEngineOptions,
  type ConfigMeta,
  listProfiles,
  loadConfig,
  type ResolvedConfig,
  resolveProjectConfig
} from '@t-req/core/config';
import { type CookieJar, createCookieJar } from '@t-req/core/cookies';
import {
  createCookieJarManager,
  type loadCookieJarData,
  scheduleCookieJarSave
} from '@t-req/core/cookies/persistence';
import type { CookieStore } from '@t-req/core/runtime';
import packageJson from '../../package.json';
import { createCookieStoreFromJar, dirname, isAbsolute, isPathSafe, resolve } from '../utils';
import { generateScriptToken, revokeScriptToken } from './auth';
import { analyzeParsedContent, getDiagnosticsForBlock, parseBlocks } from './diagnostics';
import {
  ContentOrPathRequiredError,
  ExecuteError,
  ExecutionNotFoundError,
  FileNotFoundError,
  FlowLimitReachedError,
  FlowNotFoundError,
  NoRequestsFoundError,
  ParseError,
  PathOutsideWorkspaceError,
  RequestIndexOutOfRangeError,
  RequestNotFoundError,
  SessionNotFoundError,
  ValidationError
} from './errors';
import type {
  CapabilitiesResponse,
  ConfigSummaryResponse,
  CreateFlowRequest,
  CreateFlowResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  Diagnostic,
  ExecuteRequest,
  ExecuteResponse,
  ExecutionDetail,
  ExecutionSource,
  ExecutionStatus,
  FinishFlowResponse,
  FlowSummary,
  GetRunnersResponse,
  GetTestFrameworksResponse,
  HealthResponse,
  ListWorkspaceFilesResponse,
  ListWorkspaceRequestsResponse,
  ParsedRequestInfo,
  ParseRequest,
  ParseResponse,
  ResolvedPaths,
  ResponseHeader,
  RunScriptRequest,
  RunScriptResponse,
  RunTestRequest,
  RunTestResponse,
  SessionState,
  UpdateVariablesRequest,
  UpdateVariablesResponse,
  WorkspaceFile,
  WorkspaceRequest
} from './schemas';
import { PROTOCOL_VERSION } from './schemas';
import {
  detectRunner,
  getRunnerById,
  getRunnerOptions,
  type RunnerConfig,
  type RunningScript,
  runScript as runScriptProcess
} from './script-runner';
import {
  detectTestFramework,
  getFrameworkById,
  type RunningTest,
  runTest as runTestProcess,
  type TestFrameworkConfig
} from './test-runner';

const SERVER_VERSION = packageJson.version;

export type ServiceConfig = {
  workspaceRoot: string;
  maxBodyBytes: number;
  maxSessions: number;
  sessionTtlMs?: number;
  /**
   * Time source, mainly for deterministic tests.
   * Defaults to Date.now.
   */
  now?: () => number;
  onEvent?: (
    sessionId: string | undefined,
    runId: string,
    event: { type: string } & Record<string, unknown>
  ) => void;
};

export type Session = {
  id: string;
  variables: Record<string, unknown>;
  cookieJar: CookieJar;
  cookieStore: CookieStore;
  createdAt: number;
  lastUsedAt: number;
  snapshotVersion: number;
  lock: Promise<void>;
  cookieJarPath?: string;
};

// Flow represents a logical grouping of request executions
export type Flow = {
  id: string;
  sessionId?: string;
  label?: string;
  meta?: Record<string, unknown>;
  createdAt: number;
  lastActivityAt: number;
  finished: boolean;
  executions: Map<string, StoredExecution>;
  // Sequence counter for events within this flow
  seq: number;
};

export type StoredExecution = {
  reqExecId: string;
  flowId: string;
  sessionId?: string;
  reqLabel?: string;
  source?: ExecutionSource;
  rawHttpBlock?: string;
  method?: string;
  urlTemplate?: string;
  urlResolved?: string;
  headers?: ResponseHeader[];
  bodyPreview?: string;
  timing: {
    startTime: number;
    endTime?: number;
    durationMs?: number;
  };
  response?: {
    status: number;
    statusText: string;
    headers: ResponseHeader[];
    body?: string;
    encoding: 'utf-8' | 'base64';
    truncated: boolean;
    bodyBytes: number;
  };
  status: ExecutionStatus;
  error?: { stage: string; message: string };
};

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

// Flow retention settings
const MAX_FLOWS = 100;
const MAX_EXECUTIONS_PER_FLOW = 500;
const FLOW_TTL_MS = 5 * 60 * 1000; // 5 minutes inactivity

// Default ignore patterns for workspace file discovery
const DEFAULT_WORKSPACE_IGNORE_PATTERNS = [
  '.git',
  'node_modules',
  '.treq',
  'dist',
  'build',
  'target',
  'vendor',
  '__pycache__',
  '.next',
  '.nuxt',
  'coverage'
];

// Sensitive header patterns for redaction
const SENSITIVE_HEADER_PATTERNS = [
  /^authorization$/i,
  /^cookie$/i,
  /^x-api-key$/i,
  /^x-auth-token$/i,
  /^proxy-authorization$/i,
  /^www-authenticate$/i
];

// ============================================================================
// Utility Functions
// ============================================================================

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

// Standard fetch Response interface for type assertions
type ByteStreamReader = {
  read: () => Promise<{ done: boolean; value?: Uint8Array }>;
  cancel: () => Promise<void>;
};
type ByteStream = { getReader: () => ByteStreamReader };

interface FetchResponse {
  status: number;
  statusText: string;
  headers: {
    forEach(callback: (value: string, name: string) => void): void;
    get(name: string): string | null;
    getSetCookie?(): string[];
  };
  body: ByteStream | null;
  text(): Promise<string>;
  clone(): FetchResponse;
  arrayBuffer(): Promise<ArrayBuffer>;
}

function isBinaryContent(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  // Check first 8192 bytes for null bytes or non-UTF8 sequences
  const checkLength = Math.min(bytes.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    const byte = bytes[i];
    if (byte === undefined) continue;
    // Null byte indicates binary
    if (byte === 0) return true;
    // Check for invalid UTF-8 sequences
    if (byte >= 0x80) {
      // UTF-8 continuation byte validation
      if ((byte & 0xc0) === 0x80 && (i === 0 || ((bytes[i - 1] ?? 0) & 0x80) === 0)) {
        return true;
      }
    }
  }
  return false;
}

function concatUint8(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const out = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

// Sensitive key patterns for sanitization
const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /key/i,
  /secret/i,
  /password/i,
  /auth/i,
  /credential/i,
  /api.?key/i
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitizeVariables(variables: Record<string, unknown>): Record<string, unknown> {
  const seen = new WeakSet<object>();

  const sanitizeValue = (value: unknown): unknown => {
    if (value === null) return null;
    if (typeof value !== 'object') return value;

    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((v) => sanitizeValue(v));
    }

    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = isSensitiveKey(k) ? '[REDACTED]' : sanitizeValue(v);
    }
    return out;
  };

  return sanitizeValue(variables) as Record<string, unknown>;
}

function isSensitiveHeader(name: string): boolean {
  return SENSITIVE_HEADER_PATTERNS.some((pattern) => pattern.test(name));
}

function sanitizeHeaders(headers: ResponseHeader[]): ResponseHeader[] {
  return headers.map((h) => ({
    name: h.name,
    value: isSensitiveHeader(h.name) ? '[REDACTED]' : h.value
  }));
}

function generateFlowId(): string {
  return `flow_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

function generateReqExecId(): string {
  return `exec_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

function contentTypeIndicatesFormData(headers: unknown): boolean {
  // Core parser currently exposes headers in a few shapes; support common ones.
  if (!headers) return false;

  const hasMultipart = (value: string): boolean =>
    value.toLowerCase().includes('multipart/form-data');

  // Array of [name, value]
  if (Array.isArray(headers)) {
    for (const pair of headers) {
      const name = pair?.[0];
      const value = pair?.[1];
      if (
        typeof name === 'string' &&
        name.toLowerCase() === 'content-type' &&
        typeof value === 'string'
      ) {
        return hasMultipart(value);
      }
    }
    return false;
  }

  // Record<string, string>
  if (typeof headers === 'object') {
    const rec = headers as Record<string, unknown>;
    const value = rec['content-type'] ?? rec['Content-Type'];
    return typeof value === 'string' ? hasMultipart(value) : false;
  }

  return false;
}

function restoreCookieJarFromData(
  jar: CookieJar,
  jarData: ReturnType<typeof loadCookieJarData>
): void {
  if (!jarData) return;
  for (const cookie of jarData.cookies) {
    try {
      const domain = cookie.domain || '';
      const cookieStr = `${cookie.key}=${cookie.value}; Domain=${domain}; Path=${cookie.path}`;
      // NOTE: tough-cookie requires a URL; scheme doesn't matter for host/path matching here.
      jar.setCookieSync(cookieStr, `https://${domain}${cookie.path}`);
    } catch {
      // Ignore invalid cookies
    }
  }
}

// ============================================================================
// Service Implementation
// ============================================================================

export function createService(config: ServiceConfig) {
  const sessions = new Map<string, Session>();
  const flows = new Map<string, Flow>();
  const sessionTtlMs = config.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const nowMs = config.now ?? Date.now;
  const bumpTime = (prev: number): number => {
    const n = nowMs();
    return n > prev ? n : prev + 1;
  };

  // Session and flow cleanup interval
  const cleanupInterval = setInterval(() => {
    const now = nowMs();
    // Clean up stale sessions
    for (const [id, session] of sessions) {
      if (now - session.lastUsedAt > sessionTtlMs) {
        sessions.delete(id);
      }
    }
    // Clean up inactive flows (flows without activity for FLOW_TTL_MS)
    for (const [id, flow] of flows) {
      if (now - flow.lastActivityAt > FLOW_TTL_MS) {
        flows.delete(id);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Evict least recently used session when limit reached
  function evictLeastRecentlyUsed(): void {
    let oldest: Session | null = null;
    for (const session of sessions.values()) {
      if (!oldest || session.lastUsedAt < oldest.lastUsedAt) {
        oldest = session;
      }
    }
    if (oldest) {
      sessions.delete(oldest.id);
    }
  }

  // Evict oldest flow when limit reached
  function evictOldestFlow(): boolean {
    let oldest: Flow | null = null;
    for (const flow of flows.values()) {
      if (!flow.finished) continue;
      if (!oldest || flow.lastActivityAt < oldest.lastActivityAt) {
        oldest = flow;
      }
    }
    if (oldest) {
      flows.delete(oldest.id);
      return true;
    }
    return false;
  }

  // Get next sequence number for a flow
  function getFlowSeq(flowId: string): number {
    const flow = flows.get(flowId);
    if (!flow) return 0;
    flow.seq++;
    return flow.seq;
  }

  // Emit a flow-scoped event
  function emitFlowEvent(
    flow: Flow,
    runId: string,
    reqExecId: string | undefined,
    event: { type: string } & Record<string, unknown>
  ): void {
    const seq = getFlowSeq(flow.id);
    config.onEvent?.(flow.sessionId, runId, {
      ...event,
      flowId: flow.id,
      reqExecId,
      seq,
      ts: nowMs()
    });
  }

  function getResolvedPaths(
    httpFilePath?: string,
    resolvedConfig?: { config: ResolvedConfig; meta: ConfigMeta }
  ): ResolvedPaths {
    const workspaceRoot = config.workspaceRoot;
    const basePath = httpFilePath ? dirname(resolve(workspaceRoot, httpFilePath)) : workspaceRoot;

    return {
      workspaceRoot,
      projectRoot: resolvedConfig?.meta.projectRoot ?? workspaceRoot,
      httpFilePath,
      basePath,
      configPath: resolvedConfig?.meta.configPath
    };
  }

  // Health check
  function health(): HealthResponse {
    return {
      healthy: true,
      version: SERVER_VERSION
    };
  }

  function capabilities(): CapabilitiesResponse {
    return {
      protocolVersion: PROTOCOL_VERSION,
      version: SERVER_VERSION,
      features: {
        sessions: true,
        diagnostics: true,
        streamingBodies: false
      }
    };
  }

  async function getConfig(options: {
    profile?: string;
    path?: string;
  }): Promise<ConfigSummaryResponse> {
    const startDir = options.path
      ? dirname(resolve(config.workspaceRoot, options.path))
      : config.workspaceRoot;

    const resolved = await resolveProjectConfig({
      startDir,
      stopDir: config.workspaceRoot,
      profile: options.profile
    });

    const { config: projectConfig, meta } = resolved;

    const rawConfig = await loadConfig({ startDir, stopDir: config.workspaceRoot });
    const availableProfiles = listProfiles(rawConfig.config);

    // Sanitize variables (redact sensitive values)
    const sanitizedVariables = sanitizeVariables(projectConfig.variables);

    return {
      configPath: meta.configPath,
      projectRoot: meta.projectRoot,
      format: meta.format,
      profile: meta.profile,
      availableProfiles,
      layersApplied: meta.layersApplied,
      resolvedConfig: {
        variables: sanitizedVariables,
        defaults: projectConfig.defaults,
        cookies: projectConfig.cookies,
        resolverNames: Object.keys(projectConfig.resolvers)
      },
      warnings: meta.warnings
    };
  }

  async function withSessionLock<T>(session: Session, fn: () => Promise<T>): Promise<T> {
    // Simple per-session mutex: serialize all mutations + runs in a session.
    const prev = session.lock;
    let release: (() => void) | undefined;
    session.lock = new Promise<void>((r) => {
      release = r;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release?.();
    }
  }

  // Parse endpoint
  async function parseRequest(request: ParseRequest): Promise<ParseResponse> {
    let content: string;
    let httpFilePath: string | undefined;

    if (request.path !== undefined) {
      if (!isPathSafe(config.workspaceRoot, request.path)) {
        throw new PathOutsideWorkspaceError(request.path);
      }
      httpFilePath = request.path;
      const absolutePath = resolve(config.workspaceRoot, request.path);
      content = await Bun.file(absolutePath).text();
    } else if (request.content !== undefined) {
      content = request.content;
    } else {
      throw new ContentOrPathRequiredError();
    }

    // Resolve config for project root info
    const startDir = httpFilePath
      ? dirname(resolve(config.workspaceRoot, httpFilePath))
      : config.workspaceRoot;
    const resolvedConfig = await resolveProjectConfig({
      startDir,
      stopDir: config.workspaceRoot
    });

    const resolved = getResolvedPaths(httpFilePath, resolvedConfig);
    let parsedRequests: ReturnType<typeof parse>;
    try {
      parsedRequests = parse(content);
    } catch (err) {
      throw new ParseError(err instanceof Error ? err.message : String(err));
    }

    // Analyze for diagnostics
    const includeDiagnostics = request.includeDiagnostics !== false;
    const allDiagnostics = analyzeParsedContent(content, { includeDiagnostics });
    const contentBlocks = parseBlocks(content);

    const blocks = parsedRequests.map(
      (req, index): { request?: ParsedRequestInfo; diagnostics: Diagnostic[] } => {
        // Get block info for this request (by index)
        const blockInfo = contentBlocks[index];
        const blockDiagnostics = blockInfo ? getDiagnosticsForBlock(allDiagnostics, blockInfo) : [];

        return {
          request: {
            index,
            name: req.name,
            method: req.method,
            url: req.url,
            headers: req.headers,
            hasBody: req.body !== undefined,
            hasFormData:
              (req.formData !== undefined && req.formData.length > 0) ||
              contentTypeIndicatesFormData(req.headers),
            hasBodyFile: req.bodyFile !== undefined,
            meta: req.meta
          },
          diagnostics: blockDiagnostics
        };
      }
    );

    return {
      requests: blocks,
      diagnostics: allDiagnostics,
      resolved
    };
  }

  // Execute endpoint
  async function execute(request: ExecuteRequest): Promise<ExecuteResponse> {
    const runId = generateId();
    const startTime = Date.now();

    // Flow tracking - generate reqExecId if flowId is provided
    const flowId = request.flowId;
    const flow = flowId ? flows.get(flowId) : undefined;
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
          emitFlowEvent(flow, runId, reqExecId, {
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
      if (!isPathSafe(config.workspaceRoot, request.path)) {
        throw new PathOutsideWorkspaceError(request.path);
      }
      httpFilePath = request.path;
      const absolutePath = resolve(config.workspaceRoot, request.path);
      content = await Bun.file(absolutePath).text();
      basePath = dirname(absolutePath);
    } else if (request.content !== undefined) {
      content = request.content;
      if (request.basePath !== undefined) {
        // basePath must be workspace-scoped (security boundary)
        // - Reject absolute basePath (path.resolve would ignore workspaceRoot)
        // - Reject traversal / symlink escape via isPathSafe(realpath containment)
        if (isAbsolute(request.basePath) || !isPathSafe(config.workspaceRoot, request.basePath)) {
          throw new PathOutsideWorkspaceError(request.basePath);
        }
        basePath = resolve(config.workspaceRoot, request.basePath);
      } else {
        basePath = config.workspaceRoot;
      }
    } else {
      throw new ContentOrPathRequiredError();
    }

    // Resolve project config
    const startDir = httpFilePath
      ? dirname(resolve(config.workspaceRoot, httpFilePath))
      : config.workspaceRoot;

    // Build layered overrides from session + request variables (last wins)
    const sessionVars = request.sessionId ? (sessions.get(request.sessionId)?.variables ?? {}) : {};
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
      stopDir: config.workspaceRoot,
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

      storeExecution(flow.id, pendingExecution);

      // Emit requestQueued event
      emitFlowEvent(flow, runId, reqExecId, {
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

        // Capture errors
        if (event.type === 'error') {
          const stage = String(event.stage ?? 'unknown');
          const message = String(event.message ?? 'Unknown error');
          failExecution(stage, message);
        }

        // Emit to subscribers with flow context
        if (flow && reqExecId) {
          emitFlowEvent(flow, runId, reqExecId, event);
        } else {
          // Legacy non-flow event emission
          config.onEvent?.(sessionId, runId, event);
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
              const s = sessions.get(sessionId);
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

          const remaining = config.maxBodyBytes - collected;
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

      config.onEvent?.(session.id, runId, {
        type: 'sessionUpdated',
        variablesChanged: false,
        cookiesChanged: true
      });
    }

    const resolved = getResolvedPaths(httpFilePath, resolvedConfig);

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
        flow.lastActivityAt = nowMs();
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
        maxBodyBytes: config.maxBodyBytes
      },
      timing: {
        startTime,
        endTime,
        durationMs: endTime - startTime
      }
    };
  }

  // Session management
  function createSession(request: CreateSessionRequest): CreateSessionResponse {
    // LRU eviction when limit reached (instead of hard error)
    if (sessions.size >= config.maxSessions) {
      evictLeastRecentlyUsed();
    }

    const sessionId = generateId();
    const now = nowMs();
    const cookieJar = createCookieJar();

    sessions.set(sessionId, {
      id: sessionId,
      variables: request.variables ?? {},
      cookieJar,
      cookieStore: createCookieStoreFromJar(cookieJar),
      createdAt: now,
      lastUsedAt: now,
      snapshotVersion: 1,
      lock: Promise.resolve()
    });

    return { sessionId };
  }

  function getSession(sessionId: string): SessionState {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    const serialized = session.cookieJar.toJSON();
    const cookies = serialized?.cookies ?? [];

    return {
      sessionId: session.id,
      variables: sanitizeVariables(session.variables),
      cookieCount: cookies.length,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      snapshotVersion: session.snapshotVersion
    };
  }

  async function updateSessionVariables(
    sessionId: string,
    request: UpdateVariablesRequest
  ): Promise<UpdateVariablesResponse> {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    const runId = `session-${generateId()}`;

    // Serialize variable updates with in-flight executes for this session.
    return await withSessionLock(session, async () => {
      if (request.mode === 'replace') {
        session.variables = request.variables;
      } else {
        session.variables = { ...session.variables, ...request.variables };
      }

      session.lastUsedAt = bumpTime(session.lastUsedAt);
      session.snapshotVersion++;

      config.onEvent?.(session.id, runId, {
        type: 'sessionUpdated',
        variablesChanged: true,
        cookiesChanged: false
      });

      return {
        sessionId,
        snapshotVersion: session.snapshotVersion
      };
    });
  }

  function deleteSession(sessionId: string): void {
    if (!sessions.has(sessionId)) {
      throw new SessionNotFoundError(sessionId);
    }
    sessions.delete(sessionId);
  }

  // ============================================================================
  // Flow Management
  // ============================================================================

  function createFlow(request: CreateFlowRequest): CreateFlowResponse {
    // Validate sessionId if provided
    if (request.sessionId && !sessions.has(request.sessionId)) {
      throw new SessionNotFoundError(request.sessionId);
    }

    // Evict oldest flow when limit reached
    if (flows.size >= MAX_FLOWS) {
      const evicted = evictOldestFlow();
      if (!evicted) {
        throw new FlowLimitReachedError(MAX_FLOWS);
      }
    }

    const flowId = generateFlowId();
    const now = nowMs();

    const flow: Flow = {
      id: flowId,
      sessionId: request.sessionId,
      label: request.label,
      meta: request.meta,
      createdAt: now,
      lastActivityAt: now,
      finished: false,
      executions: new Map(),
      seq: 0
    };

    flows.set(flowId, flow);

    // Emit flowStarted event
    const runId = `flow-${flowId}`;
    emitFlowEvent(flow, runId, undefined, {
      type: 'flowStarted',
      flowId,
      sessionId: request.sessionId,
      label: request.label,
      ts: now
    });

    return { flowId };
  }

  function finishFlow(flowId: string): FinishFlowResponse {
    const flow = flows.get(flowId);
    if (!flow) {
      throw new FlowNotFoundError(flowId);
    }

    flow.finished = true;
    flow.lastActivityAt = nowMs();

    // Calculate summary
    let total = 0;
    let succeeded = 0;
    let failed = 0;
    let earliestStart: number | undefined;
    let latestEnd: number | undefined;

    for (const exec of flow.executions.values()) {
      total++;
      if (exec.status === 'success') succeeded++;
      if (exec.status === 'failed') failed++;

      if (earliestStart === undefined || exec.timing.startTime < earliestStart) {
        earliestStart = exec.timing.startTime;
      }
      if (exec.timing.endTime !== undefined) {
        if (latestEnd === undefined || exec.timing.endTime > latestEnd) {
          latestEnd = exec.timing.endTime;
        }
      }
    }

    const durationMs =
      earliestStart !== undefined && latestEnd !== undefined ? latestEnd - earliestStart : 0;

    const summary: FlowSummary = { total, succeeded, failed, durationMs };

    // Emit flowFinished event
    const runId = `flow-${flowId}`;
    emitFlowEvent(flow, runId, undefined, {
      type: 'flowFinished',
      flowId,
      summary
    });

    return { flowId, summary };
  }

  function getExecution(flowId: string, reqExecId: string): ExecutionDetail {
    const flow = flows.get(flowId);
    if (!flow) {
      throw new FlowNotFoundError(flowId);
    }

    const exec = flow.executions.get(reqExecId);
    if (!exec) {
      throw new ExecutionNotFoundError(flowId, reqExecId);
    }

    // Return sanitized execution detail
    return {
      reqExecId: exec.reqExecId,
      flowId: exec.flowId,
      sessionId: exec.sessionId,
      reqLabel: exec.reqLabel,
      source: exec.source,
      rawHttpBlock: exec.rawHttpBlock,
      method: exec.method,
      urlTemplate: exec.urlTemplate,
      urlResolved: exec.urlResolved,
      headers: exec.headers ? sanitizeHeaders(exec.headers) : undefined,
      bodyPreview: exec.bodyPreview,
      timing: exec.timing,
      response: exec.response
        ? {
            ...exec.response,
            headers: sanitizeHeaders(exec.response.headers)
          }
        : undefined,
      status: exec.status,
      error: exec.error
    };
  }

  // Store an execution in a flow
  function storeExecution(flowId: string, execution: StoredExecution): void {
    const flow = flows.get(flowId);
    if (!flow) return;

    // Evict oldest executions if over limit
    if (flow.executions.size >= MAX_EXECUTIONS_PER_FLOW) {
      // Find oldest execution by startTime
      let oldest: StoredExecution | null = null;
      for (const exec of flow.executions.values()) {
        if (!oldest || exec.timing.startTime < oldest.timing.startTime) {
          oldest = exec;
        }
      }
      if (oldest) {
        flow.executions.delete(oldest.reqExecId);
      }
    }

    flow.executions.set(execution.reqExecId, execution);
    flow.lastActivityAt = nowMs();
  }

  // ============================================================================
  // Workspace Discovery
  // ============================================================================

  async function listWorkspaceFiles(
    additionalIgnore?: string[]
  ): Promise<ListWorkspaceFilesResponse> {
    // Scan for .http files and script files (.ts, .js, .mts, .mjs)
    const httpGlob = new Bun.Glob('**/*.http');
    const scriptGlob = new Bun.Glob('**/*.{ts,js,mts,mjs,py}');
    const ignorePatterns = [...DEFAULT_WORKSPACE_IGNORE_PATTERNS, ...(additionalIgnore ?? [])];

    const files: WorkspaceFile[] = [];

    // Helper to check if path should be ignored
    const shouldIgnorePath = (path: string): boolean => {
      return ignorePatterns.some((pattern) => {
        return path.startsWith(`${pattern}/`) || path.includes(`/${pattern}/`) || path === pattern;
      });
    };

    // Scan .http files
    for await (const path of httpGlob.scan({
      cwd: config.workspaceRoot,
      onlyFiles: true
    })) {
      if (shouldIgnorePath(path)) continue;

      const fullPath = resolve(config.workspaceRoot, path);
      try {
        const file = Bun.file(fullPath);
        const stat = await file.stat();
        if (!stat) continue;

        // Parse to get request count
        const content = await file.text();
        let requestCount = 0;
        try {
          const requests = parse(content);
          requestCount = requests.length;
        } catch {
          // File may be malformed, still list it with 0 requests
        }

        files.push({
          path,
          name: path.split('/').pop() ?? path,
          requestCount,
          lastModified: stat.mtime?.getTime() ?? Date.now()
        });
      } catch {
        // Skip files we can't read
      }
    }

    // Scan script files (TS/JS)
    for await (const path of scriptGlob.scan({
      cwd: config.workspaceRoot,
      onlyFiles: true
    })) {
      if (shouldIgnorePath(path)) continue;

      const fullPath = resolve(config.workspaceRoot, path);
      try {
        const file = Bun.file(fullPath);
        const stat = await file.stat();
        if (!stat) continue;

        // Scripts don't have a request count - use 0
        files.push({
          path,
          name: path.split('/').pop() ?? path,
          requestCount: 0,
          lastModified: stat.mtime?.getTime() ?? Date.now()
        });
      } catch {
        // Skip files we can't read
      }
    }

    // Sort by lastModified descending
    files.sort((a, b) => b.lastModified - a.lastModified);

    return {
      files,
      workspaceRoot: config.workspaceRoot
    };
  }

  async function listWorkspaceRequests(path: string): Promise<ListWorkspaceRequestsResponse> {
    if (!isPathSafe(config.workspaceRoot, path)) {
      throw new PathOutsideWorkspaceError(path);
    }

    const fullPath = resolve(config.workspaceRoot, path);
    const file = Bun.file(fullPath);
    const exists = await file.exists();

    if (!exists) {
      throw new FileNotFoundError(path);
    }

    const content = await file.text();
    let parsedRequests: ReturnType<typeof parse>;

    try {
      parsedRequests = parse(content);
    } catch (err) {
      throw new ParseError(err instanceof Error ? err.message : String(err));
    }

    const requests: WorkspaceRequest[] = parsedRequests.map((req, index) => ({
      index,
      name: req.name,
      method: req.method,
      url: req.url
    }));

    return { path, requests };
  }

  // ============================================================================
  // Script Execution
  // ============================================================================

  // Track running scripts by runId (includes tokenJti for revocation)
  const runningScripts = new Map<
    string,
    { script: RunningScript; flowId: string; sessionId?: string; tokenJti?: string }
  >();

  async function executeScript(
    request: RunScriptRequest,
    serverUrl: string,
    serverToken?: string
  ): Promise<RunScriptResponse> {
    // Validate file path doesn't escape workspace
    if (!isPathSafe(config.workspaceRoot, request.filePath)) {
      throw new PathOutsideWorkspaceError(request.filePath);
    }

    // Validate runner ID if provided
    let runner: RunnerConfig | undefined;
    if (request.runnerId) {
      runner = getRunnerById(request.runnerId);
      if (!runner) {
        throw new ValidationError(`Invalid runner ID: ${request.runnerId}`);
      }
    } else {
      // Auto-detect runner
      const detected = await detectRunner(config.workspaceRoot, request.filePath);
      if (detected.detected) {
        runner = getRunnerById(detected.detected);
      }
      if (!runner) {
        throw new ValidationError(
          `No runner detected for ${request.filePath}. Please specify a runnerId.`
        );
      }
    }

    // Create or use existing flow
    let flowId = request.flowId;
    let existingFlow: Flow | undefined;
    if (flowId) {
      existingFlow = flows.get(flowId);
      if (!existingFlow) {
        throw new FlowNotFoundError(flowId);
      }
    } else {
      // Create new flow
      const flowResponse = createFlow({ label: `Script: ${request.filePath}` });
      flowId = flowResponse.flowId;
      existingFlow = flows.get(flowId);
      if (!existingFlow) {
        throw new FlowNotFoundError(flowId);
      }
    }

    // Capture flow in a const for callbacks
    const flow = existingFlow;
    const absolutePath = resolve(config.workspaceRoot, request.filePath);
    const scriptDir = dirname(absolutePath);
    const runId = `script_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;

    // Create a session for the script BEFORE spawning
    const { sessionId } = createSession({});

    // Generate scoped token if server has token auth enabled
    let scriptToken: string | undefined;
    let tokenJti: string | undefined;
    if (serverToken) {
      const generated = generateScriptToken(serverToken, flowId, sessionId);
      scriptToken = generated.token;
      tokenJti = generated.jti;
    }

    // Emit scriptStarted event
    emitFlowEvent(flow, runId, undefined, {
      type: 'scriptStarted',
      runId,
      filePath: request.filePath,
      runner: runner.id
    });

    // Update flow activity
    flow.lastActivityAt = nowMs();

    // Run the script
    const runningScript = runScriptProcess({
      scriptPath: absolutePath,
      runner,
      cwd: scriptDir,
      serverUrl,
      flowId,
      sessionId,
      scriptToken,
      onStdout: (data) => {
        // Update flow activity on every output
        flow.lastActivityAt = nowMs();
        emitFlowEvent(flow, runId, undefined, {
          type: 'scriptOutput',
          runId,
          stream: 'stdout',
          data
        });
      },
      onStderr: (data) => {
        // Update flow activity on every output
        flow.lastActivityAt = nowMs();
        emitFlowEvent(flow, runId, undefined, {
          type: 'scriptOutput',
          runId,
          stream: 'stderr',
          data
        });
      },
      onExit: (code) => {
        // Revoke token immediately on exit
        if (tokenJti) {
          revokeScriptToken(tokenJti);
        }
        flow.lastActivityAt = nowMs();
        emitFlowEvent(flow, runId, undefined, {
          type: 'scriptFinished',
          runId,
          exitCode: code
        });
        runningScripts.delete(runId);
      }
    });

    runningScripts.set(runId, { script: runningScript, flowId, sessionId, tokenJti });

    return { runId, flowId };
  }

  function stopScript(runId: string): boolean {
    const entry = runningScripts.get(runId);
    if (!entry) {
      return false;
    }

    // Revoke token before killing (security: prevent token reuse)
    if (entry.tokenJti) {
      revokeScriptToken(entry.tokenJti);
    }

    // Emit scriptFinished event before killing
    const flow = flows.get(entry.flowId);
    if (flow) {
      emitFlowEvent(flow, runId, undefined, {
        type: 'scriptFinished',
        runId,
        exitCode: null // Cancelled
      });
    }

    entry.script.kill();
    runningScripts.delete(runId);
    return true;
  }

  async function getRunners(filePath?: string): Promise<GetRunnersResponse> {
    if (filePath) {
      return detectRunner(config.workspaceRoot, filePath);
    }
    return {
      detected: null,
      options: getRunnerOptions()
    };
  }

  // ============================================================================
  // Test Execution
  // ============================================================================

  // Track running tests by runId (includes tokenJti for revocation)
  const runningTests = new Map<
    string,
    { test: RunningTest; flowId: string; sessionId?: string; tokenJti?: string }
  >();

  async function executeTest(
    request: RunTestRequest,
    serverUrl: string,
    serverToken?: string
  ): Promise<RunTestResponse> {
    // Validate file path doesn't escape workspace
    if (!isPathSafe(config.workspaceRoot, request.filePath)) {
      throw new PathOutsideWorkspaceError(request.filePath);
    }

    // Validate framework ID if provided
    let framework: TestFrameworkConfig | undefined;
    if (request.frameworkId) {
      framework = getFrameworkById(request.frameworkId);
      if (!framework) {
        throw new ValidationError(`Invalid framework ID: ${request.frameworkId}`);
      }
    } else {
      // Auto-detect framework
      const detected = await detectTestFramework(config.workspaceRoot, request.filePath);
      if (detected.detected) {
        framework = getFrameworkById(detected.detected);
      }
      if (!framework) {
        throw new ValidationError(`No test framework detected. Please specify a frameworkId.`);
      }
    }

    // Create or use existing flow
    let flowId = request.flowId;
    let existingFlow: Flow | undefined;
    if (flowId) {
      existingFlow = flows.get(flowId);
      if (!existingFlow) {
        throw new FlowNotFoundError(flowId);
      }
    } else {
      // Create new flow
      const flowResponse = createFlow({ label: `Test: ${request.filePath}` });
      flowId = flowResponse.flowId;
      existingFlow = flows.get(flowId);
      if (!existingFlow) {
        throw new FlowNotFoundError(flowId);
      }
    }

    // Capture flow in a const for callbacks
    const flow = existingFlow;
    const absolutePath = resolve(config.workspaceRoot, request.filePath);
    const runId = `test_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;

    // Create a session for the test BEFORE spawning
    const { sessionId } = createSession({});

    // Generate scoped token if server has token auth enabled
    let scriptToken: string | undefined;
    let tokenJti: string | undefined;
    if (serverToken) {
      const generated = generateScriptToken(serverToken, flowId, sessionId);
      scriptToken = generated.token;
      tokenJti = generated.jti;
    }

    // Emit testStarted event
    emitFlowEvent(flow, runId, undefined, {
      type: 'testStarted',
      runId,
      filePath: request.filePath,
      framework: framework.id
    });

    // Update flow activity
    flow.lastActivityAt = nowMs();

    // Run the test
    const runningTest = runTestProcess({
      testPath: absolutePath,
      framework,
      cwd: config.workspaceRoot,
      serverUrl,
      flowId,
      sessionId,
      scriptToken,
      onStdout: (data) => {
        // Update flow activity on every output
        flow.lastActivityAt = nowMs();
        emitFlowEvent(flow, runId, undefined, {
          type: 'testOutput',
          runId,
          stream: 'stdout',
          data
        });
      },
      onStderr: (data) => {
        // Update flow activity on every output
        flow.lastActivityAt = nowMs();
        emitFlowEvent(flow, runId, undefined, {
          type: 'testOutput',
          runId,
          stream: 'stderr',
          data
        });
      },
      onExit: (code) => {
        // Revoke token immediately on exit
        if (tokenJti) {
          revokeScriptToken(tokenJti);
        }
        flow.lastActivityAt = nowMs();
        emitFlowEvent(flow, runId, undefined, {
          type: 'testFinished',
          runId,
          exitCode: code,
          status: code === 0 ? 'passed' : 'failed'
        });
        runningTests.delete(runId);
      }
    });

    runningTests.set(runId, { test: runningTest, flowId, sessionId, tokenJti });

    return { runId, flowId };
  }

  function stopTest(runId: string): boolean {
    const entry = runningTests.get(runId);
    if (!entry) {
      return false;
    }

    // Revoke token before killing (security: prevent token reuse)
    if (entry.tokenJti) {
      revokeScriptToken(entry.tokenJti);
    }

    // Emit testFinished event before killing
    const flow = flows.get(entry.flowId);
    if (flow) {
      emitFlowEvent(flow, runId, undefined, {
        type: 'testFinished',
        runId,
        exitCode: null, // Cancelled
        status: 'failed'
      });
    }

    entry.test.kill();
    runningTests.delete(runId);
    return true;
  }

  async function getTestFrameworks(filePath?: string): Promise<GetTestFrameworksResponse> {
    return detectTestFramework(config.workspaceRoot, filePath);
  }

  // Cleanup
  function dispose(): void {
    clearInterval(cleanupInterval);
    // Kill all running scripts
    for (const entry of runningScripts.values()) {
      entry.script.kill();
    }
    runningScripts.clear();
    // Kill all running tests
    for (const entry of runningTests.values()) {
      entry.test.kill();
    }
    runningTests.clear();
    sessions.clear();
    flows.clear();
  }

  return {
    health,
    capabilities,
    getConfig,
    parse: parseRequest,
    execute,
    createSession,
    getSession,
    updateSessionVariables,
    deleteSession,
    // Flow management
    createFlow,
    finishFlow,
    getExecution,
    // Workspace discovery
    listWorkspaceFiles,
    listWorkspaceRequests,
    // Script execution
    executeScript,
    stopScript,
    getRunners,
    // Test execution
    executeTest,
    stopTest,
    getTestFrameworks,
    dispose,
    // For testing
    getSessions: () => sessions,
    getFlows: () => flows
  };
}

export type Service = ReturnType<typeof createService>;

// Re-export resolveWorkspaceRoot from utils
export { resolveWorkspaceRoot } from '../utils';
