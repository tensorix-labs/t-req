// ============================================================================
// Public Plugin API
// ============================================================================

// Define helpers
export { definePlugin, schema, tool } from './define';
// Plugin Loader
export {
  getPluginId,
  isFilePlugin,
  isInlinePlugin,
  isNpmPlugin,
  isSubprocessPluginConfig,
  type LoadPluginsOptions,
  type LoadPluginsResult,
  loadPlugins,
  mergePluginRefs,
  parsePluginId,
  resolveFilePath,
  resolvePermissions
} from './loader';
// Plugin Manager
export { createPluginManager, PluginManager, type PluginManagerOptions } from './manager';
// Permissions
export {
  assertPermission,
  type CreateRestrictedContextOptions,
  createRestrictedContext,
  hasPermission,
  PermissionDeniedError,
  validatePermissions
} from './permissions';
// Subprocess Plugin
export {
  createSubprocessPluginWrapper,
  loadSubprocessPlugin,
  SubprocessPlugin
} from './subprocess';

// Types
export type {
  Collection,
  CombinedEvent,
  CombinedEventSink,
  CommandContext,
  // Commands
  CommandHandler,
  CompiledInput,
  CompiledOutput,
  CompiledRequest,
  // Enterprise context
  EnterpriseContext,
  ErrorInput,
  ErrorOutput,
  ExecuteRequestInput,
  HookContext,
  // Internal types
  LoadedPlugin,
  // Middleware
  MiddlewareFunction,
  MiddlewareRequest,
  MiddlewareResponse,
  ParsedHttpFile,
  // Hook input/output types
  ParseInput,
  ParseOutput,
  // Configuration
  PluginConfigRef,
  // Plugin context
  PluginContext,
  // Events
  PluginEvent,
  PluginFactory,
  // Hooks
  PluginHooks,
  // Permissions
  PluginPermission,
  PluginPermissionsConfig,
  // Resolvers
  PluginResolver,
  RequestAfterInput,
  RequestDefinition,
  RequestInput,
  RequestOutput,
  ResolvedPluginConfig,
  ResolverWithContext,
  ResponseInput,
  ResponseOutput,
  RetrySignal,
  SessionState,
  SubprocessErrorResponse,
  SubprocessEventNotification,
  SubprocessHookRequest,
  SubprocessHookResponse,
  SubprocessInitRequest,
  SubprocessInitResponse,
  SubprocessPluginConfig,
  // Subprocess protocol
  SubprocessRequest,
  SubprocessResolverRequest,
  SubprocessResolverResponse,
  SubprocessResponse,
  SubprocessShutdownRequest,
  TimingInfo,
  ToolContext,
  // Tools
  ToolDefinition,
  ToolSchema,
  // Core plugin interface
  TreqPlugin
} from './types';
