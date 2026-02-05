import { dirname, isPathSafe, resolve } from '../../utils';
import { generateScriptToken, revokeScriptToken } from '../auth';
import { FlowNotFoundError, ValidationError } from '../errors';
import type { GetRunnersResponse, RunScriptRequest, RunScriptResponse } from '../schemas';
import {
  detectRunner,
  getRunnerById,
  getRunnerOptions,
  type RunnerConfig,
  type RunningScript,
  runScript as runScriptProcess
} from '../script-runner';
import type { FlowManager } from './flow-manager';
import type { SessionManager } from './session-manager';
import type { Flow, ServiceContext } from './types';

export interface ScriptService {
  executeScript(
    request: RunScriptRequest,
    serverUrl: string,
    serverToken?: string
  ): Promise<RunScriptResponse>;
  stopScript(runId: string): boolean;
  getRunners(filePath?: string): Promise<GetRunnersResponse>;
  dispose(): void;
}

export function createScriptService(
  context: ServiceContext,
  sessionManager: SessionManager,
  flowManager: FlowManager
): ScriptService {
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
    if (!isPathSafe(context.workspaceRoot, request.filePath)) {
      throw new ValidationError(`Path outside workspace: ${request.filePath}`);
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
      const detected = await detectRunner(context.workspaceRoot, request.filePath);
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
      existingFlow = flowManager.get(flowId);
      if (!existingFlow) {
        throw new FlowNotFoundError(flowId);
      }
    } else {
      // Create new flow
      const flowResponse = flowManager.create({ label: `Script: ${request.filePath}` });
      flowId = flowResponse.flowId;
      existingFlow = flowManager.get(flowId);
      if (!existingFlow) {
        throw new FlowNotFoundError(flowId);
      }
    }

    // Capture flow in a const for callbacks
    const flow = existingFlow;
    const absolutePath = resolve(context.workspaceRoot, request.filePath);
    const scriptDir = dirname(absolutePath);
    const runId = `script_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;

    // Create a session for the script BEFORE spawning
    const { sessionId } = sessionManager.create({});

    // Generate scoped token if server has token auth enabled
    let scriptToken: string | undefined;
    let tokenJti: string | undefined;
    if (serverToken) {
      const generated = generateScriptToken(serverToken, flowId, sessionId);
      scriptToken = generated.token;
      tokenJti = generated.jti;
    }

    // Emit scriptStarted event
    flowManager.emitEvent(flow, runId, undefined, {
      type: 'scriptStarted',
      runId,
      filePath: request.filePath,
      runner: runner.id
    });

    // Update flow activity
    flow.lastActivityAt = context.now();

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
        flow.lastActivityAt = context.now();
        flowManager.emitEvent(flow, runId, undefined, {
          type: 'scriptOutput',
          runId,
          stream: 'stdout',
          data
        });
      },
      onStderr: (data) => {
        // Update flow activity on every output
        flow.lastActivityAt = context.now();
        flowManager.emitEvent(flow, runId, undefined, {
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
        flow.lastActivityAt = context.now();
        flowManager.emitEvent(flow, runId, undefined, {
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
    const flow = flowManager.get(entry.flowId);
    if (flow) {
      flowManager.emitEvent(flow, runId, undefined, {
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
      return detectRunner(context.workspaceRoot, filePath);
    }
    return {
      detected: null,
      options: getRunnerOptions()
    };
  }

  function dispose(): void {
    // Kill all running scripts
    for (const entry of runningScripts.values()) {
      entry.script.kill();
    }
    runningScripts.clear();
  }

  return {
    executeScript,
    stopScript,
    getRunners,
    dispose
  };
}
