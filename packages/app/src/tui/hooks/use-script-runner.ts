/**
 * useScriptRunner Hook
 *
 * Encapsulates script execution lifecycle via server-side execution.
 * Handles runner detection/selection, flow creation, SSE subscription,
 * and server-side process spawning with live output streaming.
 */

import { type Accessor, createSignal } from 'solid-js';
import { useObserver, useSDK } from '../context';
import type { RunnerOption } from '../sdk';
import { useFlowSubscription } from './use-flow-subscription';

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
  const sdk = useSDK();
  const observer = useObserver();
  const flowSubscription = useFlowSubscription();

  // Track current run ID for cancellation
  let currentRunId: string | undefined;

  // Track startup state to avoid double-run during runner detection
  const [isStarting, setIsStarting] = createSignal(false);

  // Start script execution with a runner ID
  async function startScript(scriptPath: string, runnerId?: string) {
    let flowId: string | undefined;
    try {
      // Create flow first so we can subscribe before the script starts
      const createdFlow = await sdk.createFlow(`Script: ${scriptPath}`);
      flowId = createdFlow.flowId;

      observer.setState('flowId', flowId);

      // Subscribe to SSE events for live output
      // The events (scriptStarted, scriptOutput, scriptFinished) will update observer state
      flowSubscription.subscribe(flowId);

      // Start script after subscription is active
      const { runId } = await sdk.runScript(scriptPath, runnerId, flowId);

      currentRunId = runId;

      // Initial running state is set by scriptStarted event via SSE
      // We just set the basic info here, SSE will update with full details
      if (!observer.state.runningScript) {
        observer.setState('runningScript', {
          path: scriptPath,
          pid: 0, // PID is managed by server
          startedAt: Date.now()
        });
      }
    } catch (err) {
      console.error('Failed to start script:', err);
      if (flowId) {
        flowSubscription.unsubscribe();
        observer.setState('flowId', undefined);
      }
      observer.setState('sseStatus', 'error');
      currentRunId = undefined;
    }
  }

  // Handle running a script - entry point
  async function handleRunScript(scriptPath: string) {
    // Don't allow running another script while one is running
    if (observer.state.runningScript || isStarting()) {
      return;
    }

    // Reset observer state for new run
    setIsStarting(true);
    observer.reset();

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
    if (currentRunId) {
      try {
        await sdk.cancelScript(currentRunId);
      } catch {
        // Script may have already finished
      }
      currentRunId = undefined;
    }
    setIsStarting(false);
    flowSubscription.unsubscribe();
  }

  function cleanup() {
    if (currentRunId) {
      // Fire and forget cancellation
      sdk.cancelScript(currentRunId).catch(() => {});
      currentRunId = undefined;
    }
    flowSubscription.cleanup();
    setIsStarting(false);
  }

  // Watch for scriptFinished event to update running state
  // This is done via the flow subscription which updates observer.state.runningScript to undefined
  // and observer.state.exitCode to the exit code

  return {
    runScript: handleRunScript,
    cancelScript,
    isRunning: () => isStarting() || !!observer.state.runningScript,
    cleanup
  };
}
