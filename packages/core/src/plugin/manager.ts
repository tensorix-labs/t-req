import type { EngineEvent } from '../runtime/types';
import type { Resolver } from '../types';
import { loadPlugins } from './loader';
import { createRestrictedContext } from './permissions';
import { loadSubprocessPlugin } from './subprocess';
import type {
  CombinedEventSink,
  CommandHandler,
  CompiledInput,
  CompiledOutput,
  EnterpriseContext,
  ErrorInput,
  ErrorOutput,
  HookContext,
  LoadedPlugin,
  MiddlewareFunction,
  ParseInput,
  ParseOutput,
  PluginConfigRef,
  PluginEvent,
  PluginHooks,
  PluginPermissionsConfig,
  RequestAfterInput,
  RequestInput,
  RequestOutput,
  ResolvedPluginConfig,
  ResponseInput,
  ResponseOutput,
  RetrySignal,
  SessionState,
  SubprocessPluginConfig,
  ToolDefinition,
  ValidateInput,
  ValidateOutput
} from './types';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_HOOK_TIMEOUT_MS = 30000; // 30 seconds

// ============================================================================
// Helpers
// ============================================================================

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

// ============================================================================
// Types
// ============================================================================

export interface PluginManagerOptions {
  /** Project root directory */
  projectRoot: string;
  /** Plugin configuration references */
  plugins?: PluginConfigRef[];
  /** Security settings */
  security?: {
    allowPluginsOutsideProject?: boolean;
  };
  /** Permission configuration */
  pluginPermissions?: PluginPermissionsConfig;
  /** Event sink for combined events */
  onEvent?: CombinedEventSink;
  /** Enterprise context (if available) */
  enterprise?: EnterpriseContext;
  /** Initial secrets for secrets API */
  secrets?: Record<string, string>;
}

export interface HookExecutionResult<TOutput> {
  /** Final output after all plugins processed */
  output: TOutput;
  /** Whether any plugin modified the output */
  modified: boolean;
  /** Retry signal if any plugin requested retry */
  retry?: RetrySignal;
  /** Whether to skip the request */
  skip?: boolean;
}

// ============================================================================
// Plugin Manager
// ============================================================================

/**
 * Central manager for plugin lifecycle, hook execution, and event emission.
 */
export class PluginManager {
  private plugins: LoadedPlugin[] = [];
  private resolvers: Record<string, Resolver> = {};
  private commands: Record<string, { handler: CommandHandler; pluginName: string }> = {};
  private middleware: Array<{ fn: MiddlewareFunction; pluginName: string }> = [];
  private tools: Record<string, { definition: ToolDefinition; pluginName: string }> = {};
  private warnings: string[] = [];
  private initialized = false;
  private config: ResolvedPluginConfig;
  private onEvent?: CombinedEventSink;
  private enterprise?: EnterpriseContext;
  private secrets?: Record<string, string>;
  private session: SessionState;
  private executionContext: {
    runId: string;
    flowId?: string;
    reqExecId?: string;
    now?: () => number;
    nextSeq?: () => number;
  };
  private reportSeq = 0;
  private reportScopeKey: string;

  constructor(private options: PluginManagerOptions) {
    this.config = {
      projectRoot: options.projectRoot,
      variables: {},
      security: {
        allowExternalFiles: false,
        allowPluginsOutsideProject: options.security?.allowPluginsOutsideProject ?? false
      }
    };
    if (options.onEvent !== undefined) {
      this.onEvent = options.onEvent;
    }
    if (options.enterprise !== undefined) {
      this.enterprise = options.enterprise;
    }
    if (options.secrets !== undefined) {
      this.secrets = options.secrets;
    }
    this.session = {
      id: crypto.randomUUID(),
      variables: {},
      reports: []
    };
    this.executionContext = {
      runId: this.createRunId()
    };
    this.reportScopeKey = `run:${this.executionContext.runId}`;
  }

  // ==========================================================================
  // Event Configuration
  // ==========================================================================

  /**
   * Set the event sink for plugin events.
   * This allows setting the event handler after the plugin manager is created,
   * which is useful when the event handler depends on runtime context.
   */
  setEventSink(sink: CombinedEventSink): void {
    this.onEvent = sink;
  }

  /**
   * Set execution-scoped context for report stamping.
   * Call this at the start of each execution run.
   */
  setExecutionContext(context: {
    runId?: string;
    flowId?: string;
    reqExecId?: string;
    now?: () => number;
    nextSeq?: () => number;
  }): void {
    const runId = context.runId ?? this.executionContext.runId ?? this.createRunId();
    const scopeKey = context.flowId ? `flow:${context.flowId}` : `run:${runId}`;

    if (scopeKey !== this.reportScopeKey) {
      this.reportScopeKey = scopeKey;
      this.reportSeq = 0;
    }

    this.executionContext = {
      runId,
      ...(context.flowId !== undefined ? { flowId: context.flowId } : {}),
      ...(context.reqExecId !== undefined ? { reqExecId: context.reqExecId } : {}),
      ...(context.now !== undefined ? { now: context.now } : {}),
      ...(context.nextSeq !== undefined ? { nextSeq: context.nextSeq } : {})
    };
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Load and initialize all plugins.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const pluginRefs = this.options.plugins ?? [];

    // Load plugins
    const result = await loadPlugins({
      projectRoot: this.options.projectRoot,
      plugins: pluginRefs,
      warnings: this.warnings,
      ...(this.options.security !== undefined ? { security: this.options.security } : {}),
      ...(this.options.pluginPermissions !== undefined
        ? { pluginPermissions: this.options.pluginPermissions }
        : {})
    });

    // Process loaded plugins
    for (const loaded of result.plugins) {
      await this.initializePlugin(loaded);
    }

    this.initialized = true;
  }

  /**
   * Initialize a single plugin.
   */
  private async initializePlugin(loaded: LoadedPlugin): Promise<void> {
    const startTime = Date.now();

    try {
      // Handle subprocess plugins
      if (loaded.source === 'subprocess' && '_subprocessConfig' in loaded) {
        const config = (loaded as LoadedPlugin & { _subprocessConfig: SubprocessPluginConfig })
          ._subprocessConfig;
        const subprocessLoaded = await loadSubprocessPlugin(config, this.options.projectRoot);
        loaded.plugin = subprocessLoaded.plugin;
        loaded.permissions = subprocessLoaded.permissions;
        loaded.id = subprocessLoaded.id;
      }

      // Emit loaded event
      this.emitPluginEvent({
        type: 'pluginLoaded',
        name: loaded.plugin.name,
        source: loaded.source,
        ...(loaded.plugin.version !== undefined ? { version: loaded.plugin.version } : {})
      });

      // Create restricted context
      const ctx = createRestrictedContext({
        plugin: loaded.plugin,
        permissions: loaded.permissions,
        config: this.config,
        ...(this.enterprise !== undefined ? { enterprise: this.enterprise } : {}),
        ...(this.secrets !== undefined ? { secrets: this.secrets } : {})
      });

      // Call setup
      if (loaded.plugin.setup) {
        await loaded.plugin.setup(ctx);
      }

      loaded.initialized = true;

      // Register contributions
      this.registerPluginContributions(loaded);

      const duration = Date.now() - startTime;
      this.emitPluginEvent({
        type: 'pluginInitialized',
        name: loaded.plugin.name,
        durationMs: duration
      });

      this.plugins.push(loaded);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.warnings.push(`Plugin "${loaded.plugin.name}" setup failed: ${message}`);

      this.emitPluginEvent({
        type: 'pluginError',
        name: loaded.plugin.name,
        stage: 'setup',
        message,
        recoverable: true
      });
    }
  }

  /**
   * Register a plugin's contributions (resolvers, commands, middleware, tools).
   */
  private registerPluginContributions(loaded: LoadedPlugin): void {
    const plugin = loaded.plugin;

    // Register resolvers
    if (plugin.resolvers) {
      for (const [name, resolver] of Object.entries(plugin.resolvers)) {
        if (this.resolvers[name]) {
          this.warnings.push(`Resolver "${name}" from "${plugin.name}" shadows existing resolver`);
        }
        this.resolvers[name] = resolver;
      }
    }

    // Register commands
    if (plugin.commands) {
      for (const [name, handler] of Object.entries(plugin.commands)) {
        if (this.commands[name]) {
          this.warnings.push(
            `Command "${name}" from "${plugin.name}" shadows ` +
              `same command from "${this.commands[name].pluginName}" (loaded first, takes precedence)`
          );
          continue; // First registered wins
        }
        this.commands[name] = { handler, pluginName: plugin.name };
      }
    }

    // Register middleware
    if (plugin.middleware) {
      for (const fn of plugin.middleware) {
        this.middleware.push({ fn, pluginName: plugin.name });
      }
    }

    // Register tools
    if (plugin.tools) {
      for (const [name, definition] of Object.entries(plugin.tools)) {
        if (this.tools[name]) {
          this.warnings.push(`Tool "${name}" from "${plugin.name}" shadows existing tool`);
        }
        this.tools[name] = { definition, pluginName: plugin.name };
      }
    }
  }

  // ==========================================================================
  // Teardown
  // ==========================================================================

  /**
   * Teardown all plugins in reverse order.
   */
  async teardown(): Promise<void> {
    for (let i = this.plugins.length - 1; i >= 0; i--) {
      const loaded = this.plugins[i];
      if (!loaded) continue;

      try {
        if (loaded.plugin.teardown) {
          await loaded.plugin.teardown();
        }

        this.emitPluginEvent({
          type: 'pluginTeardown',
          name: loaded.plugin.name
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.warnings.push(`Plugin "${loaded.plugin.name}" teardown failed: ${message}`);

        this.emitPluginEvent({
          type: 'pluginError',
          name: loaded.plugin.name,
          stage: 'teardown',
          message,
          recoverable: true
        });
      }
    }

    this.plugins = [];
    this.initialized = false;
  }

  // ==========================================================================
  // Hook Execution
  // ==========================================================================

  /**
   * Create a hook context.
   */
  createHookContext(options: {
    retries?: number;
    maxRetries?: number;
    variables?: Record<string, unknown>;
    pluginName?: string;
    requestName?: string;
  }): HookContext {
    const session = this.session;
    return {
      retries: options.retries ?? 0,
      maxRetries: options.maxRetries ?? 3,
      session,
      variables: options.variables ?? {},
      config: this.config,
      projectRoot: this.options.projectRoot,
      ...(this.enterprise !== undefined ? { enterprise: this.enterprise } : {}),
      report: (data: unknown) => {
        this.emitReport({
          pluginName: options.pluginName ?? 'unknown',
          ...(options.requestName !== undefined ? { requestName: options.requestName } : {}),
          data
        });
      }
    };
  }

  /**
   * Get all plugin reports accumulated during this session.
   */
  getReports(): import('./types').PluginReport[] {
    return this.session.reports;
  }

  private createRunId(): string {
    return `run-${crypto.randomUUID()}`;
  }

  private nextSeq(): number {
    if (this.executionContext.nextSeq) {
      return this.executionContext.nextSeq();
    }
    this.reportSeq += 1;
    return this.reportSeq;
  }

  private now(): number {
    return this.executionContext.now ? this.executionContext.now() : Date.now();
  }

  private emitReport(params: { pluginName: string; requestName?: string; data: unknown }): void {
    // Fail fast on non-serializable data
    try {
      JSON.stringify(params.data);
    } catch {
      throw new Error('Plugin report data must be JSON-serializable');
    }

    const report = {
      pluginName: params.pluginName,
      runId: this.executionContext.runId ?? this.createRunId(),
      ...(this.executionContext.flowId !== undefined
        ? { flowId: this.executionContext.flowId }
        : {}),
      ...(this.executionContext.reqExecId !== undefined
        ? { reqExecId: this.executionContext.reqExecId }
        : {}),
      ...(params.requestName !== undefined ? { requestName: params.requestName } : {}),
      ts: this.now(),
      seq: this.nextSeq(),
      data: params.data
    };

    this.session.reports.push(report);
    this.emitPluginEvent({ type: 'pluginReport', report });
  }

  /**
   * Execute parse.after hooks.
   */
  async triggerParseAfter(
    input: ParseInput,
    output: ParseOutput
  ): Promise<HookExecutionResult<ParseOutput>> {
    return await this.executeHook('parse.after', input, output);
  }

  /**
   * Execute validate hooks (static analysis for treq validate).
   */
  async triggerValidate(
    input: ValidateInput,
    output: ValidateOutput
  ): Promise<HookExecutionResult<ValidateOutput>> {
    return await this.executeHook('validate', input, output);
  }

  /**
   * Execute request.before hooks.
   */
  async triggerRequestBefore(
    input: RequestInput,
    output: RequestOutput
  ): Promise<HookExecutionResult<RequestOutput>> {
    const result = await this.executeHook('request.before', input, output);
    return {
      ...result,
      ...(result.output.skip !== undefined ? { skip: result.output.skip } : {})
    };
  }

  /**
   * Execute request.compiled hooks.
   */
  async triggerRequestCompiled(
    input: CompiledInput,
    output: CompiledOutput
  ): Promise<HookExecutionResult<CompiledOutput>> {
    return await this.executeHook('request.compiled', input, output);
  }

  /**
   * Execute request.after hooks (read-only).
   */
  async triggerRequestAfter(input: RequestAfterInput): Promise<void> {
    await this.executeReadOnlyHook('request.after', input);
  }

  /**
   * Execute response.after hooks.
   */
  async triggerResponseAfter(
    input: ResponseInput,
    output: ResponseOutput
  ): Promise<HookExecutionResult<ResponseOutput>> {
    const result = await this.executeHook('response.after', input, output);
    return {
      ...result,
      ...(result.output.retry !== undefined ? { retry: result.output.retry } : {})
    };
  }

  /**
   * Execute error hooks.
   */
  async triggerError(
    input: ErrorInput,
    output: ErrorOutput
  ): Promise<HookExecutionResult<ErrorOutput>> {
    const result = await this.executeHook('error', input, output);
    return {
      ...result,
      ...(result.output.retry !== undefined ? { retry: result.output.retry } : {})
    };
  }

  /**
   * Generic hook execution with input/output pattern.
   */
  private async executeHook<TInput, TOutput extends object>(
    hookName: keyof PluginHooks,
    input: TInput,
    output: TOutput
  ): Promise<HookExecutionResult<TOutput>> {
    let modified = false;
    const ctx =
      'ctx' in (input as Record<string, unknown>)
        ? (input as { ctx: HookContext }).ctx
        : this.createHookContext({});

    // Extract requestName from input if available (e.g., response.after has input.request.name)
    const inputRecord = input as Record<string, unknown>;
    const requestName =
      inputRecord['request'] &&
      typeof inputRecord['request'] === 'object' &&
      inputRecord['request'] !== null &&
      'name' in (inputRecord['request'] as object)
        ? ((inputRecord['request'] as { name?: string }).name ?? undefined)
        : undefined;

    for (const loaded of this.plugins) {
      const hook = loaded.plugin.hooks?.[hookName];
      if (!hook) continue;

      // Update ctx.report to stamp the current plugin's identity
      ctx.report = (data: unknown) => {
        this.emitReport({
          pluginName: loaded.plugin.name,
          ...(requestName !== undefined ? { requestName } : {}),
          data
        });
      };

      const startTime = Date.now();
      const outputBefore = JSON.stringify(output);

      this.emitPluginEvent({
        type: 'pluginHookStarted',
        name: loaded.plugin.name,
        hook: hookName,
        ctx
      });

      try {
        // Execute hook with timeout
        const hookPromise = Promise.resolve(
          (hook as (input: TInput, output: TOutput) => Promise<void> | void)(input, output)
        );
        await withTimeout(
          hookPromise,
          DEFAULT_HOOK_TIMEOUT_MS,
          `Hook "${hookName}" in "${loaded.plugin.name}" timed out after ${DEFAULT_HOOK_TIMEOUT_MS}ms`
        );

        const outputAfter = JSON.stringify(output);
        const hookModified = outputBefore !== outputAfter;
        if (hookModified) modified = true;

        const duration = Date.now() - startTime;
        this.emitPluginEvent({
          type: 'pluginHookFinished',
          name: loaded.plugin.name,
          hook: hookName,
          durationMs: duration,
          modified: hookModified,
          ctx
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.warnings.push(`Hook "${hookName}" in "${loaded.plugin.name}" failed: ${message}`);

        this.emitPluginEvent({
          type: 'pluginError',
          name: loaded.plugin.name,
          stage: 'hook',
          hook: hookName,
          message,
          recoverable: true
        });

        // Continue to next plugin (graceful degradation)
      }
    }

    return { output, modified };
  }

  /**
   * Execute a read-only hook (no output parameter).
   */
  private async executeReadOnlyHook<TInput>(
    hookName: 'request.after',
    input: TInput
  ): Promise<void> {
    const ctx =
      'ctx' in (input as Record<string, unknown>)
        ? (input as { ctx: HookContext }).ctx
        : this.createHookContext({});

    // Extract requestName from input if available
    const inputRecord = input as Record<string, unknown>;
    const requestName =
      inputRecord['request'] &&
      typeof inputRecord['request'] === 'object' &&
      inputRecord['request'] !== null &&
      'name' in (inputRecord['request'] as object)
        ? ((inputRecord['request'] as { name?: string }).name ?? undefined)
        : undefined;

    for (const loaded of this.plugins) {
      const hook = loaded.plugin.hooks?.[hookName];
      if (!hook) continue;

      // Update ctx.report to stamp the current plugin's identity
      ctx.report = (data: unknown) => {
        this.emitReport({
          pluginName: loaded.plugin.name,
          ...(requestName !== undefined ? { requestName } : {}),
          data
        });
      };

      const startTime = Date.now();

      this.emitPluginEvent({
        type: 'pluginHookStarted',
        name: loaded.plugin.name,
        hook: hookName,
        ctx
      });

      try {
        // Execute hook with timeout
        const hookPromise = Promise.resolve(
          (hook as (input: TInput) => Promise<void> | void)(input)
        );
        await withTimeout(
          hookPromise,
          DEFAULT_HOOK_TIMEOUT_MS,
          `Hook "${hookName}" in "${loaded.plugin.name}" timed out after ${DEFAULT_HOOK_TIMEOUT_MS}ms`
        );

        const duration = Date.now() - startTime;
        this.emitPluginEvent({
          type: 'pluginHookFinished',
          name: loaded.plugin.name,
          hook: hookName,
          durationMs: duration,
          modified: false, // Read-only hooks never modify
          ctx
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.warnings.push(`Hook "${hookName}" in "${loaded.plugin.name}" failed: ${message}`);

        this.emitPluginEvent({
          type: 'pluginError',
          name: loaded.plugin.name,
          stage: 'hook',
          hook: hookName,
          message,
          recoverable: true
        });
      }
    }
  }

  // ==========================================================================
  // Event Emission
  // ==========================================================================

  /**
   * Emit a plugin event.
   */
  private emitPluginEvent(event: PluginEvent): void {
    this.onEvent?.(event);

    // Forward to plugin event handlers
    for (const loaded of this.plugins) {
      if (loaded.plugin.event && event.type !== 'pluginLoaded') {
        // Don't send plugin events to the event handler, only engine events
      }
    }
  }

  /**
   * Emit an engine event to all plugins.
   */
  emitEngineEvent(event: EngineEvent): void {
    // Forward to event sink
    this.onEvent?.(event);

    // Forward to plugin event handlers
    for (const loaded of this.plugins) {
      if (loaded.plugin.event) {
        try {
          loaded.plugin.event({ event });
        } catch {
          // Ignore event handler errors
        }
      }
    }
  }

  // ==========================================================================
  // Getters
  // ==========================================================================

  /**
   * Get all registered resolvers.
   */
  getResolvers(): Record<string, Resolver> {
    return { ...this.resolvers };
  }

  /**
   * Get a specific resolver.
   */
  getResolver(name: string): Resolver | undefined {
    return this.resolvers[name];
  }

  /**
   * Call a resolver and handle errors.
   */
  async callResolver(name: string, args: string[]): Promise<string> {
    const resolver = this.resolvers[name];
    if (!resolver) {
      return `{{${name}:ERROR}}`; // Resolver not found placeholder
    }

    const startTime = Date.now();

    try {
      const result = await resolver(...args);

      const duration = Date.now() - startTime;
      this.emitPluginEvent({
        type: 'pluginResolverCalled',
        name: name,
        resolver: name,
        durationMs: duration
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.warnings.push(`Resolver "${name}" failed: ${message}`);

      this.emitPluginEvent({
        type: 'pluginError',
        name: 'resolver',
        stage: 'resolver',
        message,
        recoverable: true
      });

      // Return error placeholder
      return `{{${name}:ERROR}}`;
    }
  }

  /**
   * Get all registered commands.
   */
  getCommands(): Record<string, CommandHandler> {
    const result: Record<string, CommandHandler> = {};
    for (const [name, { handler }] of Object.entries(this.commands)) {
      result[name] = handler;
    }
    return result;
  }

  /**
   * Get a specific command.
   */
  getCommand(name: string): CommandHandler | undefined {
    return this.commands[name]?.handler;
  }

  /**
   * Get all registered middleware.
   */
  getMiddleware(): MiddlewareFunction[] {
    return this.middleware.map((m) => m.fn);
  }

  /**
   * Get all registered tools.
   */
  getTools(): Record<string, ToolDefinition> {
    const result: Record<string, ToolDefinition> = {};
    for (const [name, { definition }] of Object.entries(this.tools)) {
      result[name] = definition;
    }
    return result;
  }

  /**
   * Get all loaded plugins.
   */
  getPlugins(): LoadedPlugin[] {
    return [...this.plugins];
  }

  /**
   * Get all warnings.
   */
  getWarnings(): string[] {
    return [...this.warnings];
  }

  /**
   * Check if plugins are loaded.
   */
  hasPlugins(): boolean {
    return this.plugins.length > 0;
  }

  /**
   * Get plugin by name.
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.find((p) => p.plugin.name === name);
  }

  /**
   * Get plugin info for display.
   */
  getPluginInfo(): Array<{
    name: string;
    version?: string;
    source: string;
    permissions: string[];
  }> {
    return this.plugins.map((p) => ({
      name: p.plugin.name,
      source: p.source,
      permissions: p.permissions,
      ...(p.plugin.version !== undefined ? { version: p.plugin.version } : {})
    }));
  }

  /**
   * Update session variables.
   */
  setSessionVariable(key: string, value: unknown): void {
    this.session.variables[key] = value;
  }

  /**
   * Get session variables.
   */
  getSessionVariables(): Record<string, unknown> {
    return { ...this.session.variables };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new plugin manager.
 */
export function createPluginManager(options: PluginManagerOptions): PluginManager {
  return new PluginManager(options);
}
