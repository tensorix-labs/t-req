/**
 * useTestRunner Hook
 *
 * Encapsulates test execution lifecycle via server-side execution.
 * Handles framework detection/selection, flow creation, SSE subscription,
 * and server-side process spawning with live output streaming.
 */

import type { TestFrameworkOption } from '@t-req/sdk/client';
import { type Accessor, createSignal } from 'solid-js';
import { unwrap, useObserver, useSDK } from '../context';
import { useFlowSubscription } from './use-flow-subscription';

export interface TestRunnerOptions {
  onFrameworkDialogNeeded: (
    testPath: string,
    options: TestFrameworkOption[],
    onSelect: (frameworkId: string) => void
  ) => void;
}

export interface TestRunnerReturn {
  runTest: (testPath: string) => Promise<void>;
  cancelTest: () => void;
  isRunning: Accessor<boolean>;
  cleanup: () => void;
}

export function useTestRunner(options: TestRunnerOptions): TestRunnerReturn {
  const sdk = useSDK();
  const observer = useObserver();
  const flowSubscription = useFlowSubscription();

  let currentRunId: string | undefined;
  const [isStarting, setIsStarting] = createSignal(false);

  async function startTest(testPath: string, frameworkId?: string) {
    let flowId: string | undefined;
    try {
      const createdFlow = await unwrap(sdk.postFlows({ body: { label: `Test: ${testPath}` } }));
      flowId = createdFlow.flowId;

      observer.setState('flowId', flowId);
      flowSubscription.subscribe(flowId);

      const { runId } = await unwrap(
        sdk.postTest({ body: { filePath: testPath, frameworkId, flowId } })
      );
      currentRunId = runId;

      if (!observer.state.runningScript) {
        observer.setState('runningScript', {
          path: testPath,
          pid: 0,
          startedAt: Date.now()
        });
      }
    } catch (err) {
      console.error('Failed to start test:', err);
      if (flowId) {
        flowSubscription.unsubscribe();
        observer.setState('flowId', undefined);
      }
      observer.setState('sseStatus', 'error');
      currentRunId = undefined;
    }
  }

  async function handleRunTest(testPath: string) {
    if (observer.state.runningScript || isStarting()) {
      return;
    }

    setIsStarting(true);
    observer.reset();

    try {
      const { detected, options: frameworkOptions } = await unwrap(
        sdk.getTestFrameworks({ query: { filePath: testPath } })
      );

      if (detected) {
        await startTest(testPath, detected);
      } else {
        options.onFrameworkDialogNeeded(testPath, frameworkOptions, (selectedFrameworkId) => {
          void startTest(testPath, selectedFrameworkId);
        });
      }
    } catch (err) {
      console.error('Failed to get test frameworks:', err);
      observer.setState('sseStatus', 'error');
    } finally {
      setIsStarting(false);
    }
  }

  async function cancelTest() {
    if (currentRunId) {
      try {
        await sdk.deleteTestByRunId({ path: { runId: currentRunId } });
      } catch {
        // Test may have already finished
      }
      currentRunId = undefined;
    }
    setIsStarting(false);
    flowSubscription.unsubscribe();
  }

  function cleanup() {
    if (currentRunId) {
      sdk.deleteTestByRunId({ path: { runId: currentRunId } }).catch(() => {});
      currentRunId = undefined;
    }
    flowSubscription.cleanup();
    setIsStarting(false);
  }

  return {
    runTest: handleRunTest,
    cancelTest,
    isRunning: () => isStarting() || !!observer.state.runningScript,
    cleanup
  };
}
