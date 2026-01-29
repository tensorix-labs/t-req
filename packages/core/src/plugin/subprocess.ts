import { type ChildProcess, spawn } from 'node:child_process';
import type { EngineEvent } from '../runtime/types';
import { setOptional } from '../utils/optional';
import type {
  HookContext,
  LoadedPlugin,
  PluginHooks,
  PluginPermission,
  PluginResolver,
  RetrySignal,
  SubprocessErrorResponse,
  SubprocessHookResponse,
  SubprocessInitResponse,
  SubprocessPluginConfig,
  SubprocessResolverResponse,
  SubprocessResponse,
  TreqPlugin
} from './types';

// ============================================================================
// Constants
// ============================================================================

const PROTOCOL_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_STARTUP_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RESTARTS = 3;
const DEFAULT_GRACE_PERIOD_MS = 500;
const MAX_STDOUT_BYTES = 10 * 1024 * 1024; // 10MB

// ============================================================================
// Types
// ============================================================================

interface PendingRequest {
  resolve: (response: SubprocessResponse) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Internal request type with index signature for sendRequest.
 */
interface SubprocessRequestMessage {
  id: string;
  type: string;
  [key: string]: unknown;
}

// ============================================================================
// SubprocessPlugin Class
// ============================================================================

/**
 * Manages a subprocess plugin process.
 * Communicates via NDJSON over stdin/stdout.
 */
export class SubprocessPlugin {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<string, PendingRequest>();
  private buffer = '';
  private initialized = false;
  private restartCount = 0;
  private capabilities: {
    hooks: string[];
    resolvers: string[];
    commands: string[];
  } = { hooks: [], resolvers: [], commands: [] };
  private pluginInfo: {
    name: string;
    version?: string;
    permissions?: PluginPermission[];
  } = { name: 'unknown' };

  constructor(
    private config: SubprocessPluginConfig,
    private projectRoot: string
  ) {}

  /**
   * Start the subprocess and initialize it.
   */
  async start(): Promise<void> {
    await this.spawn();
    await this.initialize();
  }

  /**
   * Spawn the subprocess.
   */
  private async spawn(): Promise<void> {
    const [cmd, ...args] = this.config.command;
    if (!cmd) {
      throw new Error('Subprocess plugin has empty command');
    }

    this.process = spawn(cmd, args, {
      cwd: this.projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...this.config.env
      }
    });

    // Handle stdout (NDJSON responses)
    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleStdout(data);
    });

    // Handle stderr (logging)
    this.process.stderr?.on('data', (data: Buffer) => {
      const message = data.toString('utf-8').trim();
      if (message) {
        console.error(`[subprocess:${this.pluginInfo.name}] ${message}`);
      }
    });

    // Handle process exit
    this.process.on('close', (code, signal) => {
      this.handleClose(code, signal);
    });

    // Handle spawn errors
    this.process.on('error', (err) => {
      this.handleError(err);
    });
  }

  /**
   * Initialize the plugin by sending init message.
   */
  private async initialize(): Promise<void> {
    const timeoutMs = this.config.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;

    const response = await this.sendRequest<SubprocessInitResponse>(
      {
        id: this.nextId(),
        type: 'init',
        protocolVersion: PROTOCOL_VERSION,
        config: this.config.config ?? {},
        projectRoot: this.projectRoot
      },
      timeoutMs
    );

    if (response.type === 'error') {
      throw new Error(`Plugin init failed: ${(response as SubprocessErrorResponse).error.message}`);
    }

    const initResponse = response as SubprocessInitResponse;
    const result = initResponse.result;

    // Check protocol version
    if (result.protocolVersion > PROTOCOL_VERSION) {
      throw new Error(
        `Plugin requires protocol version ${result.protocolVersion}, ` +
          `but t-req supports version ${PROTOCOL_VERSION}`
      );
    }

    this.pluginInfo = setOptional<{
      name: string;
      version?: string;
      permissions?: PluginPermission[];
    }>({
      name: result.name
    })
      .ifDefined('version', result.version)
      .ifDefined('permissions', result.permissions)
      .build();

    this.capabilities = {
      hooks: result.hooks ?? [],
      resolvers: result.resolvers ?? [],
      commands: result.commands ?? []
    };

    this.initialized = true;
  }

  /**
   * Handle stdout data.
   */
  private handleStdout(data: Buffer): void {
    // Buffer size limit
    if (this.buffer.length + data.length > MAX_STDOUT_BYTES) {
      this.buffer = '';
      console.error(`[subprocess:${this.pluginInfo.name}] stdout buffer exceeded, clearing`);
      return;
    }

    this.buffer += data.toString('utf-8');

    // Process complete lines
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const response = JSON.parse(trimmed) as SubprocessResponse;
        this.handleResponse(response);
      } catch {
        console.error(
          `[subprocess:${this.pluginInfo.name}] Invalid JSON: ${trimmed.slice(0, 100)}`
        );
      }
    }
  }

  /**
   * Handle a parsed response.
   */
  private handleResponse(response: SubprocessResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      console.error(`[subprocess:${this.pluginInfo.name}] Unknown response ID: ${response.id}`);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.id);
    pending.resolve(response);
  }

  /**
   * Handle process close.
   */
  private handleClose(code: number | null, signal: string | null): void {
    this.process = null;

    // Reject all pending requests
    for (const [_id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`Plugin process exited with code ${code}, signal ${signal}`));
    }
    this.pendingRequests.clear();

    // Check if we should restart
    if (this.initialized && this.restartCount < (this.config.maxRestarts ?? DEFAULT_MAX_RESTARTS)) {
      this.restartCount++;
      console.warn(
        `[subprocess:${this.pluginInfo.name}] Process crashed, restarting (${this.restartCount}/${this.config.maxRestarts ?? DEFAULT_MAX_RESTARTS})`
      );
      this.spawn()
        .then(() => this.initialize())
        .catch((err) => {
          console.error(`[subprocess:${this.pluginInfo.name}] Restart failed: ${err.message}`);
        });
    }
  }

  /**
   * Handle spawn error.
   */
  private handleError(err: Error): void {
    console.error(`[subprocess:${this.pluginInfo.name}] Process error: ${err.message}`);

    // Reject all pending requests
    for (const [_id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(err);
    }
    this.pendingRequests.clear();
  }

  /**
   * Get the next request ID.
   */
  private nextId(): string {
    return String(++this.requestId);
  }

  /**
   * Send a request and wait for response.
   */
  private async sendRequest<T extends SubprocessResponse>(
    request: SubprocessRequestMessage,
    timeoutMs: number = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  ): Promise<T | SubprocessErrorResponse> {
    if (!this.process?.stdin) {
      throw new Error('Plugin process not running');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(request.id, {
        resolve: resolve as (r: SubprocessResponse) => void,
        reject,
        timeout
      });

      const line = `${JSON.stringify(request)}\n`;
      this.process?.stdin?.write(line);
    });
  }

  /**
   * Send an event notification (fire-and-forget).
   */
  sendEvent(event: EngineEvent): void {
    if (!this.process?.stdin) return;

    const message = JSON.stringify({ type: 'event', event });
    this.process.stdin.write(`${message}\n`);
  }

  /**
   * Call a resolver.
   */
  async callResolver(name: string, args: string[]): Promise<string> {
    if (!this.capabilities.resolvers.includes(name)) {
      throw new Error(`Resolver "${name}" not supported by plugin`);
    }

    const request: SubprocessRequestMessage = {
      id: this.nextId(),
      type: 'resolver',
      name,
      args
    };

    const response = await this.sendRequest<SubprocessResolverResponse>(request);

    if (response.type === 'error') {
      throw new Error((response as SubprocessErrorResponse).error.message);
    }

    return (response as SubprocessResolverResponse).result.value;
  }

  /**
   * Call a hook.
   */
  async callHook(
    name: keyof PluginHooks,
    input: Record<string, unknown>,
    output: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!this.capabilities.hooks.includes(name)) {
      return output; // Hook not supported, return unchanged
    }

    const request: SubprocessRequestMessage = {
      id: this.nextId(),
      type: 'hook',
      name,
      input,
      output
    };

    const response = await this.sendRequest<SubprocessHookResponse>(request);

    if (response.type === 'error') {
      throw new Error((response as SubprocessErrorResponse).error.message);
    }

    return (response as SubprocessHookResponse).result.output;
  }

  /**
   * Shutdown the plugin gracefully.
   */
  async shutdown(): Promise<void> {
    if (!this.process) return;

    // Send shutdown message
    try {
      this.process.stdin?.write(`${JSON.stringify({ type: 'shutdown' })}\n`);
    } catch {
      // Ignore write errors
    }

    // Wait for graceful exit
    const gracePeriod = this.config.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS;

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill if still running
        if (this.process) {
          this.process.kill('SIGKILL');
        }
        resolve();
      }, gracePeriod);

      this.process?.on('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.process = null;
  }

  /**
   * Get plugin info.
   */
  getPluginInfo(): { name: string; version?: string; permissions?: PluginPermission[] } {
    return this.pluginInfo;
  }

  /**
   * Get plugin capabilities.
   */
  getCapabilities(): { hooks: string[]; resolvers: string[]; commands: string[] } {
    return this.capabilities;
  }

  /**
   * Check if the plugin is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// ============================================================================
// Subprocess Plugin Wrapper
// ============================================================================

/**
 * Create a TreqPlugin wrapper for a subprocess plugin.
 */
export function createSubprocessPluginWrapper(subprocessPlugin: SubprocessPlugin): TreqPlugin {
  const info = subprocessPlugin.getPluginInfo();
  const capabilities = subprocessPlugin.getCapabilities();

  // Create resolver functions
  const resolvers: Record<string, PluginResolver> = {};
  for (const name of capabilities.resolvers) {
    resolvers[name] = async (...args: string[]) => {
      return await subprocessPlugin.callResolver(name, args);
    };
  }

  // Create hook functions
  const hooks: PluginHooks = {};

  if (capabilities.hooks.includes('parse.after')) {
    hooks['parse.after'] = async (input, output) => {
      const result = await subprocessPlugin.callHook(
        'parse.after',
        { file: input.file, path: input.path },
        { file: output.file }
      );
      if (result['file']) {
        output.file = result['file'] as typeof output.file;
      }
    };
  }

  if (capabilities.hooks.includes('request.before')) {
    hooks['request.before'] = async (input, output) => {
      const result = await subprocessPlugin.callHook(
        'request.before',
        { request: input.request, variables: input.variables, ctx: serializeContext(input.ctx) },
        { request: output.request }
      );
      if (result['request']) {
        output.request = result['request'] as typeof output.request;
      }
      const skipValue = result['skip'];
      if (typeof skipValue === 'boolean') {
        output.skip = skipValue;
      }
    };
  }

  if (capabilities.hooks.includes('request.compiled')) {
    hooks['request.compiled'] = async (input, output) => {
      const result = await subprocessPlugin.callHook(
        'request.compiled',
        { request: input.request, variables: input.variables, ctx: serializeContext(input.ctx) },
        { request: output.request }
      );
      if (result['request']) {
        output.request = result['request'] as typeof output.request;
      }
    };
  }

  if (capabilities.hooks.includes('request.after')) {
    hooks['request.after'] = async (input) => {
      await subprocessPlugin.callHook(
        'request.after',
        { request: input.request, ctx: serializeContext(input.ctx) },
        {}
      );
    };
  }

  if (capabilities.hooks.includes('response.after')) {
    hooks['response.after'] = async (input, output) => {
      // Serialize response for subprocess
      const serializedResponse = {
        status: input.response.status,
        statusText: input.response.statusText,
        headers: Object.fromEntries(input.response.headers.entries())
      };

      const result = await subprocessPlugin.callHook(
        'response.after',
        {
          request: input.request,
          response: serializedResponse,
          timing: input.timing,
          ctx: serializeContext(input.ctx)
        },
        {}
      );

      const status = result['status'];
      const statusText = result['statusText'];
      const headers = result['headers'];
      const retry = result['retry'];

      if (typeof status === 'number') {
        output.status = status;
      }
      if (typeof statusText === 'string') {
        output.statusText = statusText;
      }
      if (headers && typeof headers === 'object') {
        output.headers = headers as Record<string, string>;
      }
      if (retry && typeof retry === 'object') {
        output.retry = retry as RetrySignal;
      }
    };
  }

  if (capabilities.hooks.includes('error')) {
    hooks['error'] = async (input, output) => {
      const result = await subprocessPlugin.callHook(
        'error',
        {
          request: input.request,
          error: { message: input.error.message, code: input.error.code },
          ctx: serializeContext(input.ctx)
        },
        {}
      );

      const errResult = result['error'];
      const retry = result['retry'];
      const suppress = result['suppress'];

      if (errResult && typeof errResult === 'object' && 'message' in errResult) {
        output.error = new Error((errResult as { message: string }).message);
      }
      if (retry && typeof retry === 'object') {
        output.retry = retry as RetrySignal;
      }
      if (typeof suppress === 'boolean') {
        output.suppress = suppress;
      }
    };
  }

  // Create event handler
  const event =
    capabilities.hooks.length > 0
      ? async ({ event }: { event: EngineEvent }) => {
          subprocessPlugin.sendEvent(event);
        }
      : undefined;

  // Build the plugin object using setOptional for correct typing
  return setOptional<TreqPlugin>({
    name: info.name,
    instanceId: 'default',
    teardown: async () => {
      await subprocessPlugin.shutdown();
    }
  })
    .ifDefined('version', info.version)
    .ifDefined('permissions', info.permissions)
    .ifDefined('resolvers', Object.keys(resolvers).length > 0 ? resolvers : undefined)
    .ifDefined('hooks', Object.keys(hooks).length > 0 ? hooks : undefined)
    .ifDefined('event', event)
    .build();
}

/**
 * Serialize HookContext for subprocess communication.
 */
function serializeContext(ctx: HookContext): Record<string, unknown> {
  return setOptional<Record<string, unknown>>({
    retries: ctx.retries,
    maxRetries: ctx.maxRetries,
    session: {
      id: ctx.session.id,
      variables: ctx.session.variables
    },
    variables: ctx.variables,
    config: {
      projectRoot: ctx.config.projectRoot,
      variables: ctx.config.variables,
      security: ctx.config.security
    },
    projectRoot: ctx.projectRoot
  })
    .ifDefined(
      'enterprise',
      ctx.enterprise
        ? {
            org: ctx.enterprise.org,
            user: ctx.enterprise.user,
            team: ctx.enterprise.team,
            session: {
              id: ctx.enterprise.session.id,
              startedAt: ctx.enterprise.session.startedAt.toISOString(),
              source: ctx.enterprise.session.source,
              token: ctx.enterprise.session.token
            }
          }
        : undefined
    )
    .build();
}

// ============================================================================
// Subprocess Plugin Loading
// ============================================================================

/**
 * Load and initialize a subprocess plugin.
 */
export async function loadSubprocessPlugin(
  config: SubprocessPluginConfig,
  projectRoot: string
): Promise<LoadedPlugin> {
  const subprocessPlugin = new SubprocessPlugin(config, projectRoot);
  await subprocessPlugin.start();

  const info = subprocessPlugin.getPluginInfo();
  const wrapper = createSubprocessPluginWrapper(subprocessPlugin);

  return {
    plugin: wrapper,
    id: `${info.name}#default`,
    source: 'subprocess',
    permissions: info.permissions ?? [],
    initialized: true
  };
}
