import type { CookieJar } from '@t-req/core/cookies';
import type { CookieStore } from '@t-req/core/runtime';
import type { ExecutionSource, ExecutionStatus, PluginReport, ResponseHeader } from '../schemas';

// ============================================================================
// Configuration Types
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
  /**
   * Profile to use for workspace-level config (optional).
   */
  profile?: string;
};

/**
 * Internal context passed to service modules.
 */
export type ServiceContext = {
  workspaceRoot: string;
  maxBodyBytes: number;
  maxSessions: number;
  sessionTtlMs: number;
  now: () => number;
  onEvent?: ServiceConfig['onEvent'];
  profile?: string;
};

// ============================================================================
// Session Types
// ============================================================================

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

// ============================================================================
// Flow Types
// ============================================================================

/**
 * Flow represents a logical grouping of request executions.
 */
export type Flow = {
  id: string;
  sessionId?: string;
  label?: string;
  meta?: Record<string, unknown>;
  createdAt: number;
  lastActivityAt: number;
  finished: boolean;
  executions: Map<string, StoredExecution>;
  /** Sequence counter for events within this flow */
  seq: number;
};

export type PluginHookInfo = {
  pluginName: string;
  hook: string;
  durationMs: number;
  modified: boolean;
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
    ttfb?: number;
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
  pluginHooks?: PluginHookInfo[];
  pluginReports?: PluginReport[];
  status: ExecutionStatus;
  error?: { stage: string; message: string };
};

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

// Flow retention settings
export const MAX_FLOWS = 100;
export const MAX_EXECUTIONS_PER_FLOW = 500;
export const FLOW_TTL_MS = 5 * 60 * 1000; // 5 minutes inactivity

// Default ignore patterns for workspace file discovery
export const DEFAULT_WORKSPACE_IGNORE_PATTERNS = [
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
export const SENSITIVE_HEADER_PATTERNS = [
  /^authorization$/i,
  /^cookie$/i,
  /^x-api-key$/i,
  /^x-auth-token$/i,
  /^proxy-authorization$/i,
  /^www-authenticate$/i
];

// Sensitive key patterns for sanitization
export const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /key/i,
  /secret/i,
  /password/i,
  /auth/i,
  /credential/i,
  /api.?key/i
];
