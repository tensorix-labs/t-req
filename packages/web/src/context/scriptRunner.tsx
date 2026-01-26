import { createContext, createSignal, onCleanup, useContext, type Accessor, type JSX } from 'solid-js';
import { useObserver, useWorkspace } from './index';
import type { RunnerOption, SDK } from '../sdk';

export interface ScriptRunnerContextValue {
  runScript: (scriptPath: string) => Promise<void>;
  cancelScript: () => void;
  isRunning: Accessor<boolean>;
  // Dialog state
  dialogOpen: Accessor<boolean>;
  dialogScriptPath: Accessor<string>;
  dialogOptions: Accessor<RunnerOption[]>;
  handleRunnerSelect: (runnerId: string) => void;
  handleDialogClose: () => void;
}

const ScriptRunnerContext = createContext<ScriptRunnerContextValue>();

export function ScriptRunnerProvider(props: { children: JSX.Element }) {
  const workspace = useWorkspace();
  const observer = useObserver();

  // Track current run ID for cancellation
  let currentRunId: string | undefined;
  let sseUnsubscribe: (() => void) | undefined;

  // Track startup state
  const [isStarting, setIsStarting] = createSignal(false);

  // Runner selection dialog state
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [dialogScriptPath, setDialogScriptPath] = createSignal('');
  const [dialogOptions, setDialogOptions] = createSignal<RunnerOption[]>([]);
  const [dialogCallback, setDialogCallback] = createSignal<((id: string) => void) | null>(null);

  // Subscribe to SSE events for a flow
  function subscribeToFlow(sdk: SDK, flowId: string) {
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
    const sdk = workspace.sdk();
    if (!sdk) return;

    let flowId: string | undefined;
    try {
      const createdFlow = await sdk.createFlow(`Script: ${scriptPath}`);
      flowId = createdFlow.flowId;

      subscribeToFlow(sdk, flowId);

      const { runId } = await sdk.runScript(scriptPath, runnerId, flowId);
      currentRunId = runId;

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

  // Handle running a script
  async function runScript(scriptPath: string) {
    const sdk = workspace.sdk();
    if (!sdk) return;

    if (observer.state.runningScript || isStarting()) {
      return;
    }

    setIsStarting(true);
    observer.clearScriptOutput();

    try {
      const { detected, options: runnerOptions } = await sdk.getRunners(scriptPath);

      if (detected) {
        await startScript(scriptPath, detected);
      } else {
        // Show runner selection dialog
        setDialogScriptPath(scriptPath);
        setDialogOptions(runnerOptions);
        setDialogCallback(() => (selectedRunnerId: string) => {
          void startScript(scriptPath, selectedRunnerId);
        });
        setDialogOpen(true);
      }
    } catch (err) {
      console.error('Failed to get runners:', err);
      observer.setState('sseStatus', 'error');
    } finally {
      setIsStarting(false);
    }
  }

  async function cancelScript() {
    const sdk = workspace.sdk();
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

  function handleRunnerSelect(runnerId: string) {
    const callback = dialogCallback();
    if (callback) {
      callback(runnerId);
    }
    setDialogOpen(false);
    setDialogCallback(null);
  }

  function handleDialogClose() {
    setDialogOpen(false);
    setDialogCallback(null);
  }

  function cleanup() {
    const sdk = workspace.sdk();
    if (currentRunId && sdk) {
      sdk.cancelScript(currentRunId).catch(() => {});
      currentRunId = undefined;
    }
    if (sseUnsubscribe) {
      sseUnsubscribe();
      sseUnsubscribe = undefined;
    }
    setIsStarting(false);
  }

  onCleanup(cleanup);

  const value: ScriptRunnerContextValue = {
    runScript,
    cancelScript,
    isRunning: () => isStarting() || !!observer.state.runningScript,
    dialogOpen,
    dialogScriptPath,
    dialogOptions,
    handleRunnerSelect,
    handleDialogClose
  };

  return (
    <ScriptRunnerContext.Provider value={value}>
      {props.children}
    </ScriptRunnerContext.Provider>
  );
}

export function useScriptRunner(): ScriptRunnerContextValue {
  const ctx = useContext(ScriptRunnerContext);
  if (!ctx) {
    throw new Error('useScriptRunner must be used within ScriptRunnerProvider');
  }
  return ctx;
}
