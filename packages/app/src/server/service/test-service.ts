import { isPathSafe, resolve } from '../../utils';
import { generateScriptToken, revokeScriptToken } from '../auth';
import { FlowNotFoundError, ValidationError } from '../errors';
import type { GetTestFrameworksResponse, RunTestRequest, RunTestResponse } from '../schemas';
import {
  detectTestFramework,
  getFrameworkById,
  type RunningTest,
  runTest as runTestProcess,
  type TestFrameworkConfig
} from '../test-runner';
import type { FlowManager } from './flow-manager';
import type { SessionManager } from './session-manager';
import type { Flow, ServiceContext } from './types';

export interface TestService {
  executeTest(
    request: RunTestRequest,
    serverUrl: string,
    serverToken?: string
  ): Promise<RunTestResponse>;
  stopTest(runId: string): boolean;
  getTestFrameworks(filePath?: string): Promise<GetTestFrameworksResponse>;
  dispose(): void;
}

export function createTestService(
  context: ServiceContext,
  sessionManager: SessionManager,
  flowManager: FlowManager
): TestService {
  // Track running tests by runId (includes tokenJti for revocation)
  const runningTests = new Map<
    string,
    { test: RunningTest; flowId: string; sessionId?: string; tokenJti?: string }
  >();

  async function executeTest(
    request: RunTestRequest,
    serverUrl: string,
    serverToken?: string
  ): Promise<RunTestResponse> {
    // Validate file path doesn't escape workspace
    if (!isPathSafe(context.workspaceRoot, request.filePath)) {
      throw new ValidationError(`Path outside workspace: ${request.filePath}`);
    }

    // Validate framework ID if provided
    let framework: TestFrameworkConfig | undefined;
    if (request.frameworkId) {
      framework = getFrameworkById(request.frameworkId);
      if (!framework) {
        throw new ValidationError(`Invalid framework ID: ${request.frameworkId}`);
      }
    } else {
      // Auto-detect framework
      const detected = await detectTestFramework(context.workspaceRoot, request.filePath);
      if (detected.detected) {
        framework = getFrameworkById(detected.detected);
      }
      if (!framework) {
        throw new ValidationError(`No test framework detected. Please specify a frameworkId.`);
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
      const flowResponse = flowManager.create({ label: `Test: ${request.filePath}` });
      flowId = flowResponse.flowId;
      existingFlow = flowManager.get(flowId);
      if (!existingFlow) {
        throw new FlowNotFoundError(flowId);
      }
    }

    // Capture flow in a const for callbacks
    const flow = existingFlow;
    const absolutePath = resolve(context.workspaceRoot, request.filePath);
    const runId = `test_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;

    // Create a session for the test BEFORE spawning
    const { sessionId } = sessionManager.create({});

    // Generate scoped token if server has token auth enabled
    let scriptToken: string | undefined;
    let tokenJti: string | undefined;
    if (serverToken) {
      const generated = generateScriptToken(serverToken, flowId, sessionId);
      scriptToken = generated.token;
      tokenJti = generated.jti;
    }

    // Emit testStarted event
    flowManager.emitEvent(flow, runId, undefined, {
      type: 'testStarted',
      runId,
      filePath: request.filePath,
      framework: framework.id
    });

    // Update flow activity
    flow.lastActivityAt = context.now();

    // Run the test
    const runningTest = runTestProcess({
      testPath: absolutePath,
      framework,
      cwd: context.workspaceRoot,
      serverUrl,
      flowId,
      sessionId,
      scriptToken,
      onStdout: (data) => {
        // Update flow activity on every output
        flow.lastActivityAt = context.now();
        flowManager.emitEvent(flow, runId, undefined, {
          type: 'testOutput',
          runId,
          stream: 'stdout',
          data
        });
      },
      onStderr: (data) => {
        // Update flow activity on every output
        flow.lastActivityAt = context.now();
        flowManager.emitEvent(flow, runId, undefined, {
          type: 'testOutput',
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
          type: 'testFinished',
          runId,
          exitCode: code,
          status: code === 0 ? 'passed' : 'failed'
        });
        runningTests.delete(runId);
      }
    });

    runningTests.set(runId, { test: runningTest, flowId, sessionId, tokenJti });

    return { runId, flowId };
  }

  function stopTest(runId: string): boolean {
    const entry = runningTests.get(runId);
    if (!entry) {
      return false;
    }

    // Revoke token before killing (security: prevent token reuse)
    if (entry.tokenJti) {
      revokeScriptToken(entry.tokenJti);
    }

    // Emit testFinished event before killing
    const flow = flowManager.get(entry.flowId);
    if (flow) {
      flowManager.emitEvent(flow, runId, undefined, {
        type: 'testFinished',
        runId,
        exitCode: null, // Cancelled
        status: 'failed'
      });
    }

    entry.test.kill();
    runningTests.delete(runId);
    return true;
  }

  async function getTestFrameworks(filePath?: string): Promise<GetTestFrameworksResponse> {
    return detectTestFramework(context.workspaceRoot, filePath);
  }

  function dispose(): void {
    // Kill all running tests
    for (const entry of runningTests.values()) {
      entry.test.kill();
    }
    runningTests.clear();
  }

  return {
    executeTest,
    stopTest,
    getTestFrameworks,
    dispose
  };
}
