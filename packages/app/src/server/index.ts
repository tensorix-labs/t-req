// Export schemas and types

export type { ServerConfig } from './app';
// Export app
export { createApp } from './app';
export type { AnalyzeOptions, BlockInfo } from './diagnostics';
// Export diagnostics
export {
  analyzeParsedContent,
  DiagnosticCodes,
  getDiagnosticsForBlock,
  parseBlocks
} from './diagnostics';
export type { EventEnvelope, EventManager, EventSubscriber } from './events';

// Export event manager
export { createEventManager } from './events';
// Export OpenAPI routes
export {
  capabilitiesRoute,
  createSessionRoute,
  deleteSessionRoute,
  eventRoute,
  eventWSRoute,
  executeRoute,
  executeWSRoute,
  getSessionRoute,
  healthRoute,
  parseRoute,
  updateSessionVariablesRoute,
  wsSessionRoute
} from './openapi';
export * from './schemas';
export type { Service, ServiceConfig, Session } from './service';
// Export service
export { createService, resolveWorkspaceRoot } from './service';
