/**
 * useScriptRunner Hook
 *
 * Encapsulates script execution lifecycle via server-side execution.
 * Handles runner detection/selection, flow creation, SSE subscription,
 * and server-side process spawning with live output streaming.
 */

import { type Accessor, createSignal, onCleanup } from 'solid-js';
import { useObserver, useSDK } from '../context';
import type { RunnerOption, SDK } from '../sdk';

export interface ScriptRunnerOptions {
  onRunnerDialogNeeded: (
    scriptPath: string,
    options: RunnerOption[],
    onSelect: (runnerId: string) => void
  ) => void;
}

export interface ScriptRunnerReturn {
  runScript: (scriptPath: string) => Promise<void>;
  cancelScript: () => void;
  isRunning: Accessor<boolean>;
  cleanup: () => void;
}

export function useScriptRunner(options: ScriptRunnerOptions): ScriptRunnerReturn {
  const observer = useObserver();
  const getSDK = useSDK();

  // Track current run ID for cancellation
  let currentRunId: string | undefined;
  let sseUnsubscribe: (() => void) | undefined;

  // Track startup state to avoid double-run during runner detection
  const [isStarting, setIsStarting] = createSignal(false);

  // Subscribe to SSE events for a flow
  function subscribeToFlow(sdk: SDK, flowId: string) {
    // Cleanup existing subscription
    if (sseUnsubscribe) {
      sseUnsubscribe();
      sseUnsubscribe = undefined;
    }

    observer.setState('flowId', flowId);
    observer.setState('sseStatus', 'connecting');

    sseUnsubscribe = sdk.subscribeEvents(
      flowId,
      (event) => {
        if (observer.state.sseStatus !== 'open') {
          observer.setState('sseStatus', 'open');
        }
        observer.handleSSEEvent(event);
      },
      (error) => {
        console.error('SSE error:', error);
        observer.setState('sseStatus', 'error');
      },
      () => {
        observer.setState('sseStatus', 'closed');
      }
    );
  }

  // Start script execution with a runner ID
  async function startScript(scriptPath: string, runnerId?: string) {
    const sdk = getSDK();
    if (!sdk) return;

    let flowId: string | undefined;
    try {
      // Create flow first so we can subscribe before the script starts
      const createdFlow = await sdk.createFlow(`Script: ${scriptPath}`);
      flowId = createdFlow.flowId;

      // Subscribe to SSE events for live output
      subscribeToFlow(sdk, flowId);

      // Start script after subscription is active
      const { runId } = await sdk.runScript(scriptPath, runnerId, flowId);

      currentRunId = runId;

      // Initial running state is set by scriptStarted event via SSE
      // We just set the basic info here, SSE will update with full details
      if (!observer.state.runningScript) {
        observer.setState('runningScript', {
          path: scriptPath,
          pid: 0,
          startedAt: Date.now()
        });
      }
    } catch (err) {
      console.error('Failed to start script:', err);
      if (flowId) {
        if (sseUnsubscribe) {
          sseUnsubscribe();
          sseUnsubscribe = undefined;
        }
        observer.setState('flowId', undefined);
      }
      observer.setState('sseStatus', 'error');
      currentRunId = undefined;
    }
  }

  // Handle running a script - entry point
  async function handleRunScript(scriptPath: string) {
    const sdk = getSDK();
    if (!sdk) return;

    // Don't allow running another script while one is running
    if (observer.state.runningScript || isStarting()) {
      return;
    }

    // Reset observer state for new run
    setIsStarting(true);
    observer.clearScriptOutput();

    try {
      // Get available runners and auto-detect best one from server
      const { detected, options: runnerOptions } = await sdk.getRunners(scriptPath);

      if (detected) {
        // Auto-detected runner available, start immediately
        await startScript(scriptPath, detected);
      } else {
        // No runner detected - show selection dialog
        options.onRunnerDialogNeeded(scriptPath, runnerOptions, (selectedRunnerId) => {
          void startScript(scriptPath, selectedRunnerId);
        });
      }
    } catch (err) {
      console.error('Failed to get runners:', err);
      observer.setState('sseStatus', 'error');
    } finally {
      setIsStarting(false);
    }
  }

  async function cancelScript() {
    const sdk = getSDK();
    if (currentRunId && sdk) {
      try {
        await sdk.cancelScript(currentRunId);
      } catch {
        // Script may have already finished
      }
      currentRunId = undefined;
    }
    setIsStarting(false);
    if (sseUnsubscribe) {
      sseUnsubscribe();
      sseUnsubscribe = undefined;
    }
  }

  function cleanup() {
    const sdk = getSDK();
    if (currentRunId && sdk) {
      // Fire and forget cancellation
      sdk.cancelScript(currentRunId).catch(() => {});
      currentRunId = undefined;
    }
    if (sseUnsubscribe) {
      sseUnsubscribe();
      sseUnsubscribe = undefined;
    }
    setIsStarting(false);
  }

  // Cleanup on unmount
  onCleanup(cleanup);

  return {
    runScript: handleRunScript,
    cancelScript,
    isRunning: () => isStarting() || !!observer.state.runningScript,
    cleanup
  };
}
