/**
 * createRunnerLifecycle
 *
 * Shared factory that encapsulates the common runner execution lifecycle:
 * SSE subscription management, flow creation, start/cancel, dialog state.
 *
 * Used by both ScriptRunnerProvider and TestRunnerProvider to eliminate
 * duplicated lifecycle logic.
 */

import { type TreqClient, unwrap } from '@t-req/sdk/client';
import { type Accessor, onCleanup } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import type { EventEnvelope } from '../sdk';
import type { ObserverStore } from '../stores/observer';

export interface RunnerLifecycleConfig<TOption> {
  /** Generated client accessor for flow creation and SSE subscription. */
  getClient: () => TreqClient | null;
  /** True when the web connection is active. */
  isConnected: () => boolean;
  observer: ObserverStore;
  /** Detect/list available runners for a file path. */
  detectRunners: (path: string) => Promise<{ detected: string | null; options: TOption[] }>;
  /** Start execution and return the run ID. */
  startRun: (
    path: string,
    runnerId: string | undefined,
    flowId: string
  ) => Promise<{ runId: string }>;
  /** Cancel a running execution by run ID. */
  cancelRun: (runId: string) => Promise<void>;
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
  const { getClient, observer, isConnected } = config;

  let currentRunId: string | undefined;
  let sseController: AbortController | undefined;

  const [state, setState] = createStore<LifecycleState<TOption>>(createInitialState());

  function markDisconnected() {
    observer.setState('flowId', undefined);
    observer.setState('sseStatus', 'idle');
  }

  function stopSseSubscription() {
    if (sseController) {
      sseController.abort();
      sseController = undefined;
    }
  }

  function subscribeToFlow(client: TreqClient, flowId: string) {
    stopSseSubscription();
    observer.setState('flowId', flowId);
    observer.setState('sseStatus', 'connecting');

    const controller = new AbortController();
    let hadSseError = false;
    sseController = controller;

    void (async () => {
      try {
        const { stream } = await client.getEvent({
          query: { flowId },
          signal: controller.signal,
          sseMaxRetryAttempts: 1,
          onSseError: (error) => {
            if (controller.signal.aborted) return;
            hadSseError = true;
            console.error('SSE error:', error);
            if (isConnected()) {
              observer.setState('sseStatus', 'error');
            } else {
              markDisconnected();
            }
          }
        });

        for await (const event of stream) {
          if (controller.signal.aborted) {
            break;
          }

          if (observer.state.sseStatus !== 'open') {
            observer.setState('sseStatus', 'open');
          }
          observer.handleSSEEvent(event as EventEnvelope);
        }

        if (!controller.signal.aborted && sseController === controller && !hadSseError) {
          observer.setState('sseStatus', 'closed');
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('SSE error:', error);
        if (isConnected()) {
          observer.setState('sseStatus', 'error');
        } else {
          markDisconnected();
        }
      } finally {
        if (sseController === controller) {
          sseController = undefined;
        }
      }
    })();
  }

  async function startExecution(path: string, runnerId?: string) {
    const client = getClient();
    if (!client || !isConnected()) return;

    let flowId: string | undefined;
    try {
      const createdFlow = await unwrap(
        client.postFlows({ body: { label: `${config.flowLabel}: ${path}` } })
      );
      flowId = createdFlow.flowId;
      if (!isConnected()) {
        markDisconnected();
        return;
      }

      subscribeToFlow(client, flowId);

      const { runId } = await config.startRun(path, runnerId, flowId);
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
        stopSseSubscription();
        observer.setState('flowId', undefined);
      }
      if (isConnected()) {
        observer.setState('sseStatus', 'error');
      } else {
        markDisconnected();
      }
      currentRunId = undefined;
    }
  }

  async function run(path: string) {
    if (!getClient() || !isConnected()) return;

    if (observer.state.runningScript || state.starting) {
      return;
    }

    setState('starting', true);
    observer.clearScriptOutput();

    try {
      const { detected, options } = await config.detectRunners(path);

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
      if (isConnected()) {
        observer.setState('sseStatus', 'error');
      } else {
        markDisconnected();
      }
    } finally {
      setState('starting', false);
    }
  }

  async function cancel() {
    if (currentRunId && isConnected()) {
      try {
        await config.cancelRun(currentRunId);
      } catch {
        // Run may have already finished
      }
    }
    currentRunId = undefined;
    setState('starting', false);
    const hadSseSubscription = !!sseController;
    stopSseSubscription();
    if (!isConnected()) {
      markDisconnected();
    } else if (hadSseSubscription) {
      observer.setState('sseStatus', 'closed');
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
    if (currentRunId && isConnected()) {
      config.cancelRun(currentRunId).catch(() => {});
    }
    currentRunId = undefined;
    const hadSseSubscription = !!sseController;
    stopSseSubscription();
    setState('starting', false);
    if (!isConnected()) {
      markDisconnected();
    } else if (hadSseSubscription) {
      observer.setState('sseStatus', 'closed');
    }
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
