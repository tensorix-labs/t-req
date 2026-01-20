import { createEngine, parse } from '@t-req/core';
import {
  buildEngineOptions,
  type ConfigMeta,
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
// Read version from package.json at build time
import packageJson from '../../package.json';
import { createCookieStoreFromJar, dirname, isAbsolute, isPathSafe, resolve } from '../utils';
import { analyzeParsedContent, getDiagnosticsForBlock, parseBlocks } from './diagnostics';
import {
  ContentOrPathRequiredError,
  ExecuteError,
  NoRequestsFoundError,
  ParseError,
  PathOutsideWorkspaceError,
  RequestIndexOutOfRangeError,
  RequestNotFoundError,
  SessionNotFoundError
} from './errors';
import type {
  CapabilitiesResponse,
  ConfigSummaryResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  Diagnostic,
  ExecuteRequest,
  ExecuteResponse,
  HealthResponse,
  ParsedRequestInfo,
  ParseRequest,
  ParseResponse,
  ResolvedPaths,
  SessionState,
  UpdateVariablesRequest,
  UpdateVariablesResponse
} from './schemas';
import { PROTOCOL_VERSION } from './schemas';

const SERVER_VERSION = packageJson.version;

// ============================================================================
// Types
// ============================================================================

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
  // Cookie persistence
  cookieJarPath?: string;
};

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

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
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(variables)) {
    if (isSensitiveKey(key)) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = sanitizeVariables(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
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
  const sessionTtlMs = config.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const nowMs = config.now ?? Date.now;
  const bumpTime = (prev: number): number => {
    const n = nowMs();
    return n > prev ? n : prev + 1;
  };

  // Session cleanup interval
  const cleanupInterval = setInterval(() => {
    const now = nowMs();
    for (const [id, session] of sessions) {
      if (now - session.lastUsedAt > sessionTtlMs) {
        sessions.delete(id);
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

    // Sanitize variables (redact sensitive values)
    const sanitizedVariables = sanitizeVariables(projectConfig.variables);

    return {
      configPath: meta.configPath,
      projectRoot: meta.projectRoot,
      format: meta.format,
      profile: meta.profile,
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

    const runStateless = async (): Promise<{
      response: Response;
      session?: Session;
      cookiesChanged: boolean;
    }> => {
      if (!projectConfig.cookies.enabled) {
        // No cookies at all
        const { engineOptions, requestDefaults } = buildEngineOptions({
          config: projectConfig,
          onEvent: (event) => {
            config.onEvent?.(undefined, runId, event);
          }
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
            onEvent: (event) => {
              config.onEvent?.(undefined, runId, event);
            }
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
        onEvent: (event) => {
          config.onEvent?.(undefined, runId, event);
        }
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

      // Build engine options using centralized helper
      const { engineOptions, requestDefaults } = buildEngineOptions({
        config: projectConfig,
        cookieStore: projectConfig.cookies.enabled ? cookieStore : undefined,
        onEvent: (event) => {
          config.onEvent?.(session.id, runId, event);
        }
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
    const { response, session, cookiesChanged } =
      sessionId !== undefined
        ? await (async () => {
            const s = sessions.get(sessionId);
            if (!s) throw new SessionNotFoundError(sessionId);
            return await withSessionLock(s, async () => await runInSession(s));
          })()
        : await runStateless();

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

    return {
      runId,
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
      response: {
        status: fetchResponse.status,
        statusText: fetchResponse.statusText,
        headers: responseHeaders,
        bodyMode,
        body,
        encoding,
        truncated,
        bodyBytes
      },
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
      variables: session.variables,
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

  // Cleanup re
  function dispose(): void {
    clearInterval(cleanupInterval);
    sessions.clear();
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
    dispose,
    // For testing
    getSessions: () => sessions
  };
}

export type Service = ReturnType<typeof createService>;

// Re-export resolveWorkspaceRoot from utils
export { resolveWorkspaceRoot } from '../utils';
