import packageJson from '../../../package.json';
import type { CapabilitiesResponse, HealthResponse } from '../schemas';
import { PROTOCOL_VERSION } from '../schemas';
import { createConfigService } from './config-service';
import { createExecutionEngine } from './execution-engine';
import { createFlowManager } from './flow-manager';
import { createParseService } from './parse-service';
import { createPluginService } from './plugin-service';
import { createScriptService } from './script-service';
import { createSessionManager } from './session-manager';
import { createTestService } from './test-service';
import type { ServiceConfig, ServiceContext } from './types';
import { DEFAULT_SESSION_TTL_MS } from './types';
import { createWorkspaceService } from './workspace-service';

const SERVER_VERSION = packageJson.version;

export function createService(config: ServiceConfig) {
  // Build service context with defaults
  const context: ServiceContext = {
    workspaceRoot: config.workspaceRoot,
    maxBodyBytes: config.maxBodyBytes,
    maxSessions: config.maxSessions,
    sessionTtlMs: config.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS,
    now: config.now ?? Date.now,
    onEvent: config.onEvent,
    profile: config.profile
  };

  // Create core managers
  const sessionManager = createSessionManager(context);
  const flowManager = createFlowManager(context, sessionManager);

  // Create domain services
  const configService = createConfigService(context);
  const workspaceService = createWorkspaceService(context);
  const parseService = createParseService(context, configService);
  const pluginService = createPluginService(configService);
  const scriptService = createScriptService(context, sessionManager, flowManager);
  const testService = createTestService(context, sessionManager, flowManager);
  const executionEngine = createExecutionEngine(
    context,
    sessionManager,
    flowManager,
    configService
  );

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

  // Cleanup
  async function dispose(): Promise<void> {
    scriptService.dispose();
    testService.dispose();
    sessionManager.dispose();
    flowManager.dispose();
    // Teardown plugin manager if initialized
    const workspaceConfig = await configService.getWorkspaceConfig();
    if (workspaceConfig.config.pluginManager) {
      await workspaceConfig.config.pluginManager.teardown();
    }
  }

  return {
    // Core
    health,
    capabilities,
    getConfig: configService.getConfig,
    parse: parseService.parseRequest,
    execute: executionEngine.execute,
    executeSSE: executionEngine.executeSSE,
    // Session management
    createSession: sessionManager.create,
    getSession: sessionManager.get,
    updateSessionVariables: sessionManager.update,
    deleteSession: sessionManager.delete,
    // Flow management
    createFlow: flowManager.create,
    finishFlow: flowManager.finish,
    getExecution: flowManager.getExecution,
    // Workspace discovery
    listWorkspaceFiles: workspaceService.listWorkspaceFiles,
    listWorkspaceRequests: workspaceService.listWorkspaceRequests,
    // File CRUD
    getFileContent: workspaceService.getFileContent,
    updateFile: workspaceService.updateFile,
    createFile: workspaceService.createFile,
    deleteFile: workspaceService.deleteFile,
    // Script execution
    executeScript: scriptService.executeScript,
    stopScript: scriptService.stopScript,
    getRunners: scriptService.getRunners,
    // Test execution
    executeTest: testService.executeTest,
    stopTest: testService.stopTest,
    getTestFrameworks: testService.getTestFrameworks,
    // Plugins
    getPlugins: pluginService.getPlugins,
    dispose,
    // For testing
    getSessions: sessionManager.getSessions,
    getFlows: flowManager.getFlows
  };
}

export type Service = ReturnType<typeof createService>;

// Re-export types that were previously exported from service.ts
export type { Flow, PluginHookInfo, ServiceConfig, Session, StoredExecution } from './types';
