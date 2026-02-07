/**
 * createRunnerLifecycle
 *
 * Shared factory that encapsulates the common runner execution lifecycle:
 * SSE subscription management, flow creation, start/cancel, dialog state.
 *
 * Used by both ScriptRunnerProvider and TestRunnerProvider to eliminate
 * duplicated lifecycle logic.
 */

import { type Accessor, onCleanup } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import type { SDK } from '../sdk';
import type { ObserverStore } from '../stores/observer';

export interface RunnerLifecycleConfig<TOption> {
  getSDK: () => SDK | null;
  observer: ObserverStore;
  /** SDK call to detect/list available runners. */
  detectRunners: (
    sdk: SDK,
    path: string
  ) => Promise<{ detected: string | null; options: TOption[] }>;
  /** SDK call to start execution. */
  startRun: (
    sdk: SDK,
    path: string,
    runnerId: string | undefined,
    flowId: string
  ) => Promise<{ runId: string }>;
  /** SDK call to cancel a running execution. */
  cancelRun: (sdk: SDK, runId: string) => Promise<void>;
  /** Label prefix for flow creation (e.g., "Script" or "Test"). */
  flowLabel: string;
}

interface LifecycleState<TOption> {
  starting: boolean;
  dialog: {
    open: boolean;
    path: string;
    options: TOption[];
    callback: ((id: string) => void) | null;
  };
}

function createInitialState<TOption>(): LifecycleState<TOption> {
  return {
    starting: false,
    dialog: { open: false, path: '', options: [], callback: null }
  };
}

export interface RunnerLifecycleReturn<TOption> {
  run: (path: string) => Promise<void>;
  cancel: () => Promise<void>;
  isRunning: Accessor<boolean>;
  dialogOpen: Accessor<boolean>;
  dialogPath: Accessor<string>;
  dialogOptions: Accessor<TOption[]>;
  handleSelect: (id: string) => void;
  handleDialogClose: () => void;
}

export function createRunnerLifecycle<TOption>(
  config: RunnerLifecycleConfig<TOption>
): RunnerLifecycleReturn<TOption> {
  const { getSDK, observer } = config;

  let currentRunId: string | undefined;
  let sseUnsubscribe: (() => void) | undefined;

  const [state, setState] = createStore<LifecycleState<TOption>>(createInitialState());

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

  async function startExecution(path: string, runnerId?: string) {
    const sdk = getSDK();
    if (!sdk) return;

    let flowId: string | undefined;
    try {
      const createdFlow = await sdk.createFlow(`${config.flowLabel}: ${path}`);
      flowId = createdFlow.flowId;

      subscribeToFlow(sdk, flowId);

      const { runId } = await config.startRun(sdk, path, runnerId, flowId);
      currentRunId = runId;

      if (!observer.state.runningScript) {
        observer.setState('runningScript', {
          path,
          pid: 0,
          startedAt: Date.now()
        });
      }
    } catch (err) {
      console.error(`Failed to start ${config.flowLabel.toLowerCase()}:`, err);
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

  async function run(path: string) {
    const sdk = getSDK();
    if (!sdk) return;

    if (observer.state.runningScript || state.starting) {
      return;
    }

    setState('starting', true);
    observer.clearScriptOutput();

    try {
      const { detected, options } = await config.detectRunners(sdk, path);

      if (detected) {
        await startExecution(path, detected);
      } else {
        setState('dialog', {
          open: true,
          path,
          options,
          callback: (selectedId: string) => {
            void startExecution(path, selectedId);
          }
        });
      }
    } catch (err) {
      console.error(`Failed to detect ${config.flowLabel.toLowerCase()}s:`, err);
      observer.setState('sseStatus', 'error');
    } finally {
      setState('starting', false);
    }
  }

  async function cancel() {
    const sdk = getSDK();
    if (currentRunId && sdk) {
      try {
        await config.cancelRun(sdk, currentRunId);
      } catch {
        // Run may have already finished
      }
      currentRunId = undefined;
    }
    setState('starting', false);
    if (sseUnsubscribe) {
      sseUnsubscribe();
      sseUnsubscribe = undefined;
    }
  }

  function resetDialog() {
    setState('dialog', reconcile({ open: false, path: '', options: [], callback: null }));
  }

  function handleSelect(id: string) {
    const callback = state.dialog.callback;
    if (callback) {
      callback(id);
    }
    resetDialog();
  }

  function handleDialogClose() {
    resetDialog();
  }

  function cleanup() {
    const sdk = getSDK();
    if (currentRunId && sdk) {
      config.cancelRun(sdk, currentRunId).catch(() => {});
      currentRunId = undefined;
    }
    if (sseUnsubscribe) {
      sseUnsubscribe();
      sseUnsubscribe = undefined;
    }
    setState('starting', false);
  }

  onCleanup(cleanup);

  return {
    run,
    cancel,
    isRunning: () => state.starting || !!observer.state.runningScript,
    dialogOpen: () => state.dialog.open,
    dialogPath: () => state.dialog.path,
    dialogOptions: () => state.dialog.options,
    handleSelect,
    handleDialogClose
  };
}
