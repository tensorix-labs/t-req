/**
 * useScriptRunner Hook
 *
 * Encapsulates script execution lifecycle - the most complex hook.
 * Handles runner detection/selection, flow creation, SSE subscription,
 * process spawning, stdout/stderr callbacks, and cleanup.
 */

import { resolve } from 'path';
import { type Accessor, createSignal } from 'solid-js';
import { useObserver, useSDK, useStore } from '../context';
import {
  detectRunner,
  loadPersistedRunner,
  type RunnerConfig,
  type RunningScript,
  runScript,
  savePersistedRunner
} from '../runner';
import { useFlowSubscription } from './use-flow-subscription';

export interface ScriptRunnerOptions {
  onRunnerDialogNeeded: (scriptPath: string, onSelect: (runner: RunnerConfig) => void) => void;
}

export interface ScriptRunnerReturn {
  runScript: (scriptPath: string) => Promise<void>;
  cancelScript: () => void;
  isRunning: Accessor<boolean>;
  cleanup: () => void;
}

export function useScriptRunner(options: ScriptRunnerOptions): ScriptRunnerReturn {
  const sdk = useSDK();
  const store = useStore();
  const observer = useObserver();
  const flowSubscription = useFlowSubscription();

  // Running script reference (imperative, not reactive)
  let runningScriptRef: RunningScript | undefined;

  // Track running state
  const [isRunning, setIsRunning] = createSignal(false);

  // Start script execution with a runner
  async function startScript(absolutePath: string, displayPath: string, runner: RunnerConfig) {
    try {
      const { flowId } = await sdk.createFlow(`Running ${displayPath}`);
      observer.setState('flowId', flowId);

      // Subscribe to SSE events
      flowSubscription.subscribe(flowId);

      // Build environment variables for the script
      const env: Record<string, string> = {
        TREQ_SERVER: sdk.serverUrl,
        TREQ_FLOW_ID: flowId
      };
      if (sdk.token) {
        env['TREQ_TOKEN'] = sdk.token;
      }

      // Spawn the script
      runningScriptRef = runScript({
        scriptPath: absolutePath,
        runner,
        env,
        cwd: store.workspaceRoot(),
        onStdout: (data) => {
          observer.appendStdout(data);
        },
        onStderr: (data) => {
          observer.appendStderr(data);
        },
        onExit: (code) => {
          observer.setState('exitCode', code);
          observer.setState('runningScript', undefined);
          runningScriptRef = undefined;
          setIsRunning(false);

          // Best-effort finish flow
          void (async () => {
            try {
              await sdk.finishFlow(flowId);
            } catch {
              // Ignore
            }
          })();

          // Cleanup SSE subscription
          flowSubscription.unsubscribe();
        }
      });

      setIsRunning(true);
      observer.setState('runningScript', {
        path: displayPath,
        pid: runningScriptRef.pid,
        startedAt: Date.now()
      });
    } catch (err) {
      console.error('Failed to start script:', err);
      observer.setState('sseStatus', 'error');
      setIsRunning(false);
    }
  }

  // Handle running a script - entry point
  async function handleRunScript(scriptPath: string) {
    // Don't allow running another script while one is running
    if (observer.state.runningScript) {
      return;
    }

    // Reset observer state for new run
    observer.reset();

    // Resolve absolute path
    const absolutePath = resolve(store.workspaceRoot(), scriptPath);

    // Detect runner or prompt for selection
    let runner = await detectRunner(absolutePath);

    if (!runner) {
      // Try loading persisted runner config
      const persisted = await loadPersistedRunner(store.workspaceRoot());
      if (persisted) {
        runner = persisted.runner;
      } else {
        // Show runner selection dialog via callback
        options.onRunnerDialogNeeded(scriptPath, (selectedRunner) => {
          // Save and run with selected runner
          void savePersistedRunner(store.workspaceRoot(), selectedRunner);
          void startScript(absolutePath, scriptPath, selectedRunner);
        });
        return;
      }
    }

    await startScript(absolutePath, scriptPath, runner);
  }

  function cancelScript() {
    if (runningScriptRef) {
      runningScriptRef.kill();
      runningScriptRef = undefined;
    }
  }

  function cleanup() {
    if (runningScriptRef) {
      runningScriptRef.kill();
      runningScriptRef = undefined;
    }
    flowSubscription.cleanup();
    setIsRunning(false);
  }

  return {
    runScript: handleRunScript,
    cancelScript,
    isRunning,
    cleanup
  };
}
