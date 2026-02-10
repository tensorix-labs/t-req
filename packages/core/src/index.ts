// Client
export { createClient } from './client';
// Engine
export { createEngine } from './engine/engine';
// File loading
export {
  type FileLoaderOptions,
  inferMimeType,
  isBinaryMimeType,
  type LoadedFile,
  loadFileBody,
  validateFilePath
} from './file-loader';
// Form data building
export {
  type BuildFormDataOptions,
  buildFormData,
  buildUrlEncoded,
  hasFileFields
} from './form-data-builder';
// Interpolation
export { createInterpolator, interpolate } from './interpolate';
// Parsing
export {
  parse,
  parseDocument,
  parseDocumentFile,
  parseDocumentFileWithIO,
  parseFile,
  parseFileWithIO
} from './parser';
// Plugin types
export type {
  CombinedEvent,
  CombinedEventSink,
  CommandContext,
  // Commands and tools
  CommandHandler,
  CompiledInput,
  CompiledOutput,
  CompiledRequest,
  EnterpriseContext,
  ErrorInput,
  ErrorOutput,
  HookContext,
  MiddlewareFunction,
  ParsedHttpFile,
  // Hook types
  ParseInput,
  ParseOutput,
  PluginConfigRef,
  PluginDiagnostic,
  PluginEvent,
  PluginFactory,
  PluginHooks,
  PluginPermission,
  PluginPermissionsConfig,
  PluginReport,
  RequestAfterInput,
  RequestInput,
  RequestOutput,
  ResponseInput,
  ResponseOutput,
  RetrySignal,
  SubprocessPluginConfig,
  TimingInfo,
  ToolDefinition,
  ToolSchema,
  TreqPlugin,
  ValidateInput,
  ValidateOutput
} from './plugin';
// Plugin system
export {
  // Plugin manager
  createPluginManager,
  // Permissions
  createRestrictedContext,
  // Define helpers
  definePlugin,
  getPluginId,
  // Loader
  loadPlugins,
  loadSubprocessPlugin,
  PermissionDeniedError,
  PluginManager,
  type PluginManagerOptions,
  parsePluginId,
  // Subprocess
  SubprocessPlugin,
  schema,
  tool
} from './plugin';
export type { Protocol, ProtocolExecuteOptions, ProtocolHandler } from './protocols';
// Protocol registry and handlers
export {
  getDefaultHandler,
  getHandler,
  getRegisteredProtocols,
  hasHandler,
  httpHandler,
  registerProtocol,
  sseHandler
} from './protocols';
// Runtime adapters
export { createAutoTransport, createFetchTransport } from './runtime';
// Runtime types (needed for plugin event handlers)
export type { EngineEvent, EventSink } from './runtime/types';
// Server metadata utilities
export { getServerMetadata, type ServerMetadata } from './server-metadata';

// Core types
export type {
  Client,
  ClientConfig,
  Directive,
  ExecuteOptions,
  ExecuteRequest,
  FileReference,
  FormField,
  InterpolateOptions,
  Interpolator,
  ParsedDocument,
  ParsedRequest,
  Protocol as ProtocolType,
  ProtocolOptions,
  Resolver,
  RunOptions,
  SSEMessage,
  SSEOptions,
  SSEResponse,
  StreamResponse
} from './types';
