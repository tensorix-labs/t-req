import type { z } from 'zod';
import type { EngineEvent } from '../runtime/types';
import type { ParsedRequest } from '../types';

// ============================================================================
// Plugin Permissions
// ============================================================================

/**
 * Permissions that plugins can request and users can restrict.
 */
export type PluginPermission =
  | 'secrets' // Access to resolvers that read secrets (Vault, SSM, env vars)
  | 'network' // Make outbound HTTP requests (for OAuth refresh, telemetry)
  | 'filesystem' // Read/write files outside project root
  | 'env' // Read process.env
  | 'subprocess' // Spawn child processes
  | 'enterprise'; // Access EnterpriseContext (org, user, session data)

// ============================================================================
// Enterprise Context (interface only, no implementation)
// ============================================================================

/**
 * Enterprise context provided by @t-req/enterprise package.
 * Contains organization, user, and session information for enterprise features.
 */
export interface EnterpriseContext {
  org: {
    id: string;
    name: string;
    plan: 'team' | 'enterprise';
  };
  user: {
    id: string;
    email: string;
    roles: string[]; // e.g., ['admin', 'developer']
    permissions: string[]; // e.g., ['requests:write', 'secrets:read']
  };
  team?: {
    id: string;
    name: string;
  };
  session: {
    id: string;
    startedAt: Date;
    source: 'web' | 'desktop' | 'cli' | 'api';
    token?: string; // For SSO token injection
  };
}

// ============================================================================
// Plugin Events
// ============================================================================

/**
 * Events emitted by the plugin system.
 * All plugin event types are prefixed with 'plugin' for easy discrimination.
 */
export type PluginEvent =
  | {
      type: 'pluginLoaded';
      name: string;
      version?: string;
      source: 'npm' | 'file' | 'inline' | 'subprocess';
    }
  | { type: 'pluginInitialized'; name: string; durationMs: number }
  | { type: 'pluginHookStarted'; name: string; hook: string; ctx: HookContext }
  | {
      type: 'pluginHookFinished';
      name: string;
      hook: string;
      durationMs: number;
      modified: boolean;
      ctx: HookContext;
    }
  | { type: 'pluginResolverCalled'; name: string; resolver: string; durationMs: number }
  | {
      type: 'pluginError';
      name: string;
      stage: 'load' | 'setup' | 'hook' | 'resolver' | 'teardown';
      hook?: string;
      message: string;
      recoverable: boolean;
    }
  | { type: 'pluginTeardown'; name: string };

/**
 * Combined event type for unified event handling.
 * Consumers can discriminate by checking if type starts with 'plugin'.
 */
export type CombinedEvent = EngineEvent | PluginEvent;

/**
 * Event sink that accepts both engine and plugin events.
 */
export type CombinedEventSink = (event: CombinedEvent) => void;

// ============================================================================
// Retry Signal
// ============================================================================

/**
 * Signal to retry a request from response.after or error hooks.
 */
export interface RetrySignal {
  /** Delay before retry in milliseconds */
  delayMs: number;
  /** Optional reason for logging/debugging */
  reason?: string;
}

// ============================================================================
// Hook Context
// ============================================================================

/**
 * Context available to all hooks.
 */
export interface HookContext {
  /** Current retry attempt (0 for first try) */
  retries: number;
  /** Maximum retries allowed */
  maxRetries: number;
  /** Current session state */
  session: SessionState;
  /** All resolved variables */
  variables: Record<string, unknown>;
  /** Resolved configuration */
  config: ResolvedPluginConfig;
  /** Project root directory */
  projectRoot: string;
  /** Enterprise context (populated by @t-req/enterprise, undefined in OSS) */
  enterprise?: EnterpriseContext;
}

/**
 * Session state for the current execution.
 */
export interface SessionState {
  /** Unique session ID */
  id: string;
  /** Session-scoped variables that persist across requests */
  variables: Record<string, unknown>;
}

/**
 * Resolved plugin configuration (subset of ResolvedConfig).
 */
export interface ResolvedPluginConfig {
  projectRoot: string;
  variables: Record<string, unknown>;
  security: {
    allowExternalFiles: boolean;
    allowPluginsOutsideProject: boolean;
  };
}

// ============================================================================
// Timing Information
// ============================================================================

/**
 * Timing breakdown for request execution.
 */
export interface TimingInfo {
  /** Total time from start to finish in ms */
  total: number;
  /** DNS lookup time in ms */
  dns?: number;
  /** TLS handshake time in ms */
  tls?: number;
  /** Time to first byte in ms */
  ttfb?: number;
  /** Time to download response in ms */
  download?: number;
}

// ============================================================================
// Hook Input/Output Types
// ============================================================================

// --- Parse Hooks ---

/**
 * Parsed HTTP file representation.
 */
export interface ParsedHttpFile {
  /** File path */
  path: string;
  /** Parsed requests from the file */
  requests: ParsedRequest[];
}

/**
 * Input for parse.after hook.
 */
export interface ParseInput {
  /** Parsed file data */
  file: ParsedHttpFile;
  /** File path */
  path: string;
}

/**
 * Output for parse.after hook.
 */
export interface ParseOutput {
  /** Mutable - modify parsed file */
  file: ParsedHttpFile;
}

// --- Request Hooks ---

/**
 * Request object before variable interpolation.
 */
export interface ExecuteRequestInput {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

/**
 * Input for request.before hook.
 */
export interface RequestInput {
  /** Request before interpolation */
  request: ExecuteRequestInput;
  /** Variables available for interpolation */
  variables: Record<string, unknown>;
  /** Hook context */
  ctx: HookContext;
}

/**
 * Output for request.before hook.
 */
export interface RequestOutput {
  /** Mutable - modify request */
  request: ExecuteRequestInput;
  /** Set to true to skip this request */
  skip?: boolean;
}

// --- Compiled Request Hooks ---

/**
 * Request object after variable interpolation (ready for signing).
 */
export interface CompiledRequest {
  method: string;
  /** Final URL with variables interpolated */
  url: string;
  /** All headers with variables interpolated */
  headers: Record<string, string>;
  /** Body with variables interpolated (can be any valid body type) */
  body?: string | Buffer | ArrayBuffer | FormData | URLSearchParams;
}

/**
 * Input for request.compiled hook.
 */
export interface CompiledInput {
  /** Request after interpolation */
  request: CompiledRequest;
  /** Variables used for interpolation */
  variables: Record<string, unknown>;
  /** Hook context */
  ctx: HookContext;
}

/**
 * Output for request.compiled hook.
 */
export interface CompiledOutput {
  /** Mutable - modify compiled request (for signing, final header additions) */
  request: CompiledRequest;
}

// --- Request After Hook (Read-Only) ---

/**
 * Input for request.after hook (read-only observation before fetch).
 */
export interface RequestAfterInput {
  /** Read-only snapshot of final request */
  request: CompiledRequest;
  /** Hook context */
  ctx: HookContext;
}
// No output - this hook is purely observational

// --- Response Hooks ---

/**
 * Input for response.after hook.
 */
export interface ResponseInput {
  /** Original request */
  request: CompiledRequest;
  /** Response object (immutable, stream-based) */
  response: Response;
  /** Timing information */
  timing: TimingInfo;
  /** Hook context */
  ctx: HookContext;
}

/**
 * Output for response.after hook.
 * All response modifications are expressed via these fields.
 */
export interface ResponseOutput {
  /** Override status code */
  status?: number;
  /** Override status text */
  statusText?: string;
  /** Override/add headers (shallow merge) */
  headers?: Record<string, string>;
  /** Override body (if you read input.response body, you MUST set this) */
  body?: string | Buffer | ReadableStream;
  /** Signal retry */
  retry?: RetrySignal;
}

// --- Error Hooks ---

/**
 * Input for error hook.
 */
export interface ErrorInput {
  /** Original request */
  request: CompiledRequest;
  /** Error that occurred */
  error: Error & { code?: string };
  /** Hook context */
  ctx: HookContext;
}

/**
 * Output for error hook.
 */
export interface ErrorOutput {
  /** Mutable - can wrap error */
  error: Error;
  /** Signal retry */
  retry?: RetrySignal;
  /** Don't throw the error */
  suppress?: boolean;
}

// ============================================================================
// Plugin Hooks Interface
// ============================================================================

/**
 * All available plugin hooks.
 */
export interface PluginHooks {
  /**
   * Called after parsing a .http file.
   * Allows transforming the AST.
   */
  'parse.after'?: (input: ParseInput, output: ParseOutput) => Promise<void> | void;

  /**
   * Called before variable interpolation.
   * Allows early request modification (add headers, change URL).
   */
  'request.before'?: (input: RequestInput, output: RequestOutput) => Promise<void> | void;

  /**
   * Called after variable interpolation.
   * Allows final request modification (signing).
   */
  'request.compiled'?: (input: CompiledInput, output: CompiledOutput) => Promise<void> | void;

  /**
   * Called immediately before fetch.
   * Read-only observation for logging, metrics, audit.
   */
  'request.after'?: (input: RequestAfterInput) => Promise<void> | void;

  /**
   * Called after receiving response.
   * Allows response processing and retry signaling.
   */
  'response.after'?: (input: ResponseInput, output: ResponseOutput) => Promise<void> | void;

  /**
   * Called when an error occurs.
   * Allows error handling and retry signaling.
   */
  error?: (input: ErrorInput, output: ErrorOutput) => Promise<void> | void;
}

// ============================================================================
// Command Context
// ============================================================================

/**
 * Context provided to plugin commands.
 */
export interface CommandContext {
  /** Command arguments */
  args: string[];
  /** Command flags */
  flags: Record<string, string | boolean>;

  // File operations
  /** Read a file as text */
  readFile: (path: string) => Promise<string>;
  /** Write content to a file */
  writeFile: (path: string, content: string) => Promise<void>;
  /** Write requests to an .http file */
  writeHttpFile: (name: string, requests: RequestDefinition[]) => Promise<void>;

  // T-Req operations
  /** Parse a collection of .http files */
  parseCollection: (path?: string) => Promise<Collection>;
  /** Parse a single .http file */
  parseHttpFile: (path: string) => Promise<ParsedHttpFile>;
  /** Run a request from a file */
  run: (path: string, variables?: Record<string, unknown>) => Promise<Response>;

  // Output
  /** Log a message */
  log: (message: string) => void;
  /** Log a warning */
  warn: (message: string) => void;
  /** Log an error */
  error: (message: string) => void;
  /** Display tabular data */
  table: (data: unknown[]) => void;
  /** Output JSON */
  json: (data: unknown) => void;

  // Control
  /** Exit with code */
  exit: (code?: number) => never;

  // Config
  /** Resolved configuration */
  config: ResolvedPluginConfig;
  /** Current working directory */
  cwd: string;
}

/**
 * Request definition for writeHttpFile.
 */
export interface RequestDefinition {
  name?: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Collection of parsed .http files.
 */
export interface Collection {
  files: ParsedHttpFile[];
}

/**
 * Command handler function.
 */
export type CommandHandler = (ctx: CommandContext) => Promise<void> | void;

// ============================================================================
// Middleware
// ============================================================================

/**
 * Request/response pair for middleware.
 */
export interface MiddlewareRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Buffer | string;
}

export interface MiddlewareResponse {
  statusCode: number;
  headers: Record<string, string>;
  setHeader: (name: string, value: string) => void;
  end: (body?: string | Buffer) => void;
}

/**
 * Middleware function for treq serve.
 */
export type MiddlewareFunction = (
  req: MiddlewareRequest,
  res: MiddlewareResponse,
  next: () => Promise<void>
) => Promise<void> | void;

// ============================================================================
// Tool Definition
// ============================================================================

/**
 * Schema type for tool arguments.
 * Compatible with Zod schemas.
 */
export type ToolSchema<T = unknown> = z.ZodType<T>;

/**
 * Tool context for execute function.
 */
export interface ToolContext {
  /** Response from the request (if available) */
  response?: Response;
  /** Hook context */
  ctx: HookContext;
}

/**
 * Tool definition with Zod schema support.
 */
export interface ToolDefinition<TArgs = Record<string, unknown>> {
  /** Tool description */
  description: string;
  /** Argument schemas */
  args: z.ZodType<TArgs>;
  /** Execute function */
  execute: (args: TArgs, ctx: ToolContext) => Promise<string> | string;
}

// ============================================================================
// Plugin Context (provided to setup)
// ============================================================================

/**
 * Context provided to plugin setup function.
 */
export interface PluginContext {
  /** Project root directory */
  projectRoot: string;
  /** Resolved configuration */
  config: ResolvedPluginConfig;
  /** Logger */
  log: {
    debug: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };

  // Restricted capabilities based on permissions
  /** Secrets API (requires 'secrets' permission) */
  secrets?: {
    get: (key: string) => Promise<string | undefined>;
  };
  /** Fetch function (requires 'network' permission) */
  fetch?: typeof fetch;
  /** File system API (requires 'filesystem' permission) */
  fs?: {
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
  };
  /** Environment variables (requires 'env' permission) */
  env?: Record<string, string | undefined>;
  /** Spawn function (requires 'subprocess' permission) */
  spawn?: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
  /** Enterprise context (requires 'enterprise' permission) */
  enterprise?: EnterpriseContext;
}

// ============================================================================
// Resolver Function Type (from plugin)
// ============================================================================

/**
 * Resolver function provided by plugins.
 * Receives resolver context for permission-gated operations.
 */
export type PluginResolver = (...args: string[]) => string | Promise<string>;

/**
 * Resolver with context access.
 */
export interface ResolverWithContext {
  /** Resolver function */
  resolve: (...args: string[]) => string | Promise<string>;
  /** Required permissions */
  permissions?: PluginPermission[];
}

// ============================================================================
// TreqPlugin Interface
// ============================================================================

/**
 * Main plugin interface.
 * Plugins are functions that return this interface or the interface directly.
 */
export interface TreqPlugin {
  /** Plugin name (unique identifier) */
  name: string;

  /**
   * Instance ID for multiple instances of the same plugin.
   * Plugins are identified as `${name}#${instanceId}`.
   * @default 'default'
   */
  instanceId?: string;

  /** Plugin version */
  version?: string;

  /** Required permissions */
  permissions?: PluginPermission[];

  /** Custom resolvers for variable interpolation */
  resolvers?: Record<string, PluginResolver>;

  /** Lifecycle hooks */
  hooks?: PluginHooks;

  /**
   * Event subscription (fire-and-forget observation).
   * Receives engine events for analytics, logging, etc.
   */
  event?: (input: { event: EngineEvent }) => Promise<void> | void;

  /** CLI commands */
  commands?: Record<string, CommandHandler>;

  /** Server middleware (for treq serve) */
  middleware?: MiddlewareFunction[];

  /** Custom tools with schemas */
  tools?: Record<string, ToolDefinition>;

  /** Initialize plugin with context */
  setup?: (ctx: PluginContext) => Promise<void> | void;

  /** Cleanup resources */
  teardown?: () => Promise<void> | void;
}

/**
 * Plugin factory function type.
 */
export type PluginFactory<TOptions = void> = TOptions extends void
  ? () => TreqPlugin
  : (options: TOptions) => TreqPlugin;

// ============================================================================
// Plugin Configuration
// ============================================================================

/**
 * Plugin reference in config (string for npm/file, tuple for npm with options).
 */
export type PluginConfigRef =
  | string // npm package or file:// URL
  | [string, Record<string, unknown>] // [npm package, options]
  | TreqPlugin // inline plugin
  | SubprocessPluginConfig; // subprocess plugin

/**
 * Configuration for subprocess plugins.
 */
export interface SubprocessPluginConfig {
  /** Command to spawn [executable, ...args] */
  command: string[];
  /** Plugin-specific config (sent in init) */
  config?: unknown;
  /** Per-request timeout in ms */
  timeoutMs?: number;
  /** Init timeout in ms */
  startupTimeoutMs?: number;
  /** Auto-restart limit */
  maxRestarts?: number;
  /** Shutdown grace period in ms */
  gracePeriodMs?: number;
  /** Additional environment variables */
  env?: Record<string, string>;
}

/**
 * Plugin permissions configuration.
 */
export interface PluginPermissionsConfig {
  /** Default permissions for plugins without explicit config */
  default?: PluginPermission[];
  /** Per-plugin permission overrides */
  [pluginName: string]: PluginPermission[] | undefined;
}

// ============================================================================
// Subprocess Protocol Types
// ============================================================================

/**
 * Init request from t-req to plugin.
 */
export interface SubprocessInitRequest {
  id: string;
  type: 'init';
  protocolVersion: number;
  config: unknown;
  projectRoot: string;
}

/**
 * Resolver request from t-req to plugin.
 */
export interface SubprocessResolverRequest {
  id: string;
  type: 'resolver';
  name: string;
  args: string[];
}

/**
 * Hook request from t-req to plugin.
 */
export interface SubprocessHookRequest {
  id: string;
  type: 'hook';
  name: keyof PluginHooks;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

/**
 * Event notification from t-req to plugin (no response expected).
 */
export interface SubprocessEventNotification {
  type: 'event';
  event: EngineEvent;
}

/**
 * Shutdown request from t-req to plugin.
 */
export interface SubprocessShutdownRequest {
  type: 'shutdown';
}

/**
 * All subprocess request types.
 */
export type SubprocessRequest =
  | SubprocessInitRequest
  | SubprocessResolverRequest
  | SubprocessHookRequest
  | SubprocessEventNotification
  | SubprocessShutdownRequest;

/**
 * Init response from plugin to t-req.
 */
export interface SubprocessInitResponse {
  id: string;
  type: 'response';
  result: {
    name: string;
    version?: string;
    protocolVersion: number;
    capabilities: ('hooks' | 'resolvers' | 'commands')[];
    hooks?: string[];
    resolvers?: string[];
    commands?: string[];
    permissions?: PluginPermission[];
  };
}

/**
 * Resolver response from plugin to t-req.
 */
export interface SubprocessResolverResponse {
  id: string;
  type: 'response';
  result: { value: string };
}

/**
 * Hook response from plugin to t-req.
 */
export interface SubprocessHookResponse {
  id: string;
  type: 'response';
  result: { output: Record<string, unknown> };
}

/**
 * Error response from plugin to t-req.
 */
export interface SubprocessErrorResponse {
  id: string;
  type: 'error';
  error: { message: string; code?: string };
}

/**
 * All subprocess response types.
 */
export type SubprocessResponse =
  | SubprocessInitResponse
  | SubprocessResolverResponse
  | SubprocessHookResponse
  | SubprocessErrorResponse;

// ============================================================================
// Loaded Plugin (internal)
// ============================================================================

/**
 * Internal representation of a loaded plugin.
 */
export interface LoadedPlugin {
  /** Plugin definition */
  plugin: TreqPlugin;
  /** Unique identifier: name#instanceId */
  id: string;
  /** Source type */
  source: 'npm' | 'file' | 'inline' | 'subprocess';
  /** Granted permissions */
  permissions: PluginPermission[];
  /** Setup has been called */
  initialized: boolean;
}
