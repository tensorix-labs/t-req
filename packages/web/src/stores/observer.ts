/**
 * Observer Store - State management for request execution and observation.
 *
 * Manages:
 * - Flow state (current flowId, SSE connection status)
 * - Executions (live updates from SSE, selection)
 * - Execute actions
 */

import {
  type ExecuteResponse,
  type PluginReport,
  type TreqClient,
  unwrap
} from '@t-req/sdk/client';
import { type Accessor, createMemo } from 'solid-js';
import { createStore, produce, reconcile, type SetStoreFunction } from 'solid-js/store';
import type { EventEnvelope } from '../sdk';

export type SSEStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export type ExecutionStatus = 'pending' | 'running' | 'success' | 'failed';

export interface ExecutionSummary {
  reqExecId: string;
  flowId: string;
  sessionId?: string;
  reqLabel?: string;
  method?: string;
  urlTemplate?: string;
  urlResolved?: string;
  status: ExecutionStatus;
  timing: {
    startTime: number;
    endTime?: number;
    durationMs?: number;
  };
  response?: {
    status: number;
    statusText: string;
    headers: Array<{ name: string; value: string }>;
    body?: string;
    encoding: 'utf-8' | 'base64';
    truncated: boolean;
    bodyBytes: number;
  };
  pluginReports?: PluginReport[];
  error?: {
    stage: string;
    message: string;
  };
}

export interface RunningScript {
  path: string;
  pid: number;
  startedAt: number;
}

export interface ObserverState {
  flowId: string | undefined;
  sseStatus: SSEStatus;
  executionsById: Record<string, ExecutionSummary>;
  executionOrder: string[];
  selectedReqExecId: string | undefined;
  executing: boolean;
  executeError: string | undefined;
  // Script execution state
  runningScript: RunningScript | undefined;
  stdoutLines: string[];
  stderrLines: string[];
  exitCode: number | null | undefined;
  // History modal state
  showHistory: boolean;
}

export interface ObserverStore {
  // Direct state access (reactive)
  state: ObserverState;
  setState: SetStoreFunction<ObserverState>;

  // Flow lifecycle
  openFlow: (client: TreqClient) => Promise<string>;
  closeFlow: () => void;

  // Actions
  execute: (
    client: TreqClient,
    path: string,
    requestIndex: number,
    profile?: string
  ) => Promise<ExecuteResponse | undefined>;
  clearExecutions: () => void;
  selectExecution: (reqExecId: string | undefined) => void;

  // Derived
  selectedExecution: Accessor<ExecutionSummary | undefined>;
  executionsList: Accessor<ExecutionSummary[]>;

  // Navigation
  selectNextExecution: () => void;
  selectPreviousExecution: () => void;

  // Script output helpers
  appendStdout: (data: string) => void;
  appendStderr: (data: string) => void;
  clearScriptOutput: () => void;

  // SSE event handling
  handleSSEEvent: (event: EventEnvelope) => void;

  // History modal
  openHistory: () => void;
  closeHistory: () => void;

  // Reset
  reset: () => void;
}

// ============================================================================
// Store Factory
// ============================================================================

function createInitialState(): ObserverState {
  return {
    flowId: undefined,
    sseStatus: 'idle',
    executionsById: {},
    executionOrder: [],
    selectedReqExecId: undefined,
    executing: false,
    executeError: undefined,
    // Script execution state
    runningScript: undefined,
    stdoutLines: [],
    stderrLines: [],
    exitCode: undefined,
    // History modal state
    showHistory: false
  };
}

const MAX_OUTPUT_LINES = 1000;

export function createObserverStore(): ObserverStore {
  const [state, setState] = createStore<ObserverState>(createInitialState());

  let sseController: AbortController | null = null;

  const handleSSEEvent = (event: EventEnvelope) => {
    const { type, reqExecId, payload } = event;

    switch (type) {
      // Script events (don't require reqExecId)
      case 'scriptStarted': {
        const p = payload as { runId: string; filePath: string; runner: string };
        setState('runningScript', {
          path: p.filePath,
          pid: 0,
          startedAt: event.ts
        });
        break;
      }
      case 'scriptOutput': {
        const p = payload as { runId: string; stream: 'stdout' | 'stderr'; data: string };
        if (p.stream === 'stdout') {
          appendStdout(p.data);
        } else {
          appendStderr(p.data);
        }
        break;
      }
      case 'scriptFinished': {
        const p = payload as { runId: string; exitCode: number | null };
        setState('exitCode', p.exitCode);
        setState('runningScript', undefined);
        break;
      }

      // Test events (same handling as script events)
      case 'testStarted': {
        const p = payload as { runId: string; filePath: string; framework: string };
        setState('runningScript', {
          path: p.filePath,
          pid: 0,
          startedAt: event.ts
        });
        break;
      }
      case 'testOutput': {
        const p = payload as { runId: string; stream: 'stdout' | 'stderr'; data: string };
        if (p.stream === 'stdout') {
          appendStdout(p.data);
        } else {
          appendStderr(p.data);
        }
        break;
      }
      case 'testFinished': {
        const p = payload as { runId: string; exitCode: number | null; status: string };
        setState('exitCode', p.exitCode);
        setState('runningScript', undefined);
        break;
      }
    }

    // Request events require reqExecId
    if (!reqExecId) return;

    switch (type) {
      case 'request:start': {
        const exec: ExecutionSummary = {
          reqExecId,
          flowId: event.flowId ?? state.flowId ?? '',
          sessionId: event.sessionId,
          method: payload.method as string | undefined,
          urlTemplate: payload.urlTemplate as string | undefined,
          urlResolved: payload.urlResolved as string | undefined,
          reqLabel: payload.reqLabel as string | undefined,
          status: 'running',
          timing: {
            startTime: event.ts
          }
        };
        setState('executionsById', reqExecId, exec);
        setState('executionOrder', (prev) => [...prev, reqExecId]);

        // Auto-select first execution
        if (state.selectedReqExecId === undefined) {
          setState('selectedReqExecId', reqExecId);
        }
        break;
      }

      case 'request:success': {
        setState(
          produce((s) => {
            const existing = s.executionsById[reqExecId];
            if (!existing) return;
            existing.status = 'success';
            existing.timing.endTime = event.ts;
            existing.timing.durationMs = payload.durationMs as number | undefined;
            if (payload.response) {
              existing.response = payload.response as ExecutionSummary['response'];
            }
          })
        );
        break;
      }

      case 'request:fail': {
        setState(
          produce((s) => {
            const existing = s.executionsById[reqExecId];
            if (!existing) return;
            existing.status = 'failed';
            existing.timing.endTime = event.ts;
            existing.timing.durationMs = payload.durationMs as number | undefined;
            if (payload.error) {
              existing.error = payload.error as ExecutionSummary['error'];
            }
          })
        );
        break;
      }
      case 'pluginReport': {
        const report = (payload as { report?: PluginReport }).report;
        if (!report) break;
        setState(
          produce((s) => {
            const existing = s.executionsById[reqExecId];
            if (!existing) return;
            existing.pluginReports = existing.pluginReports ?? [];
            existing.pluginReports.push(report);
          })
        );
        break;
      }
    }
  };

  // Script output helpers
  const appendStdout = (data: string) => {
    const lines = data.split('\n').filter((line) => line.length > 0);
    setState('stdoutLines', (prev) => {
      const combined = [...prev, ...lines];
      return combined.slice(-MAX_OUTPUT_LINES);
    });
  };

  const appendStderr = (data: string) => {
    const lines = data.split('\n').filter((line) => line.length > 0);
    setState('stderrLines', (prev) => {
      const combined = [...prev, ...lines];
      return combined.slice(-MAX_OUTPUT_LINES);
    });
  };

  const clearScriptOutput = () => {
    setState('runningScript', undefined);
    setState('stdoutLines', []);
    setState('stderrLines', []);
    setState('exitCode', undefined);
  };

  const openHistory = () => setState('showHistory', true);
  const closeHistory = () => setState('showHistory', false);

  // ── Flow Lifecycle ──────────────────────────────────────────────────────
  // openFlow/closeFlow are the primary interface for SSE connection management.
  // All SSE teardown goes through closeFlow — no duplication.

  /** Tear down the SSE connection and clear flow state. Idempotent. */
  const closeFlow = () => {
    if (sseController) {
      sseController.abort();
      sseController = null;
    }
    setState('flowId', undefined);
    setState('sseStatus', 'idle');
  };

  /** Subscribe SSE to a specific flow. Tears down any existing connection first. */
  const subscribeToSSE = (client: TreqClient, flowId: string) => {
    closeFlow();

    setState('flowId', flowId);
    setState('sseStatus', 'connecting');

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
            setState('sseStatus', 'error');
          }
        });

        for await (const event of stream) {
          if (controller.signal.aborted) {
            break;
          }

          if (state.sseStatus !== 'open') {
            setState('sseStatus', 'open');
          }
          handleSSEEvent(event as EventEnvelope);
        }

        if (!controller.signal.aborted && sseController === controller && !hadSseError) {
          setState('sseStatus', 'closed');
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('SSE error:', error);
        setState('sseStatus', 'error');
      } finally {
        if (sseController === controller) {
          sseController = null;
        }
      }
    })();
  };

  /** Create a flow and subscribe to its SSE stream. Reuses existing flow. */
  const openFlow = async (client: TreqClient): Promise<string> => {
    if (state.flowId) return state.flowId;

    const { flowId } = await unwrap(client.postFlows({ body: { label: 'web-execution' } }));
    subscribeToSSE(client, flowId);
    return flowId;
  };

  // ── Execute ─────────────────────────────────────────────────────────────

  const execute = async (
    client: TreqClient,
    path: string,
    requestIndex: number,
    profile?: string
  ): Promise<ExecuteResponse | undefined> => {
    setState('executing', true);
    setState('executeError', undefined);

    try {
      const flowId = await openFlow(client);

      // Execute the request with profile
      const response = await unwrap(
        client.postExecute({
          body: {
            flowId,
            path,
            requestIndex,
            profile
          }
        })
      );

      // If we got a response directly (non-SSE mode), add it to state
      const reqExecId = response.reqExecId;
      if (reqExecId && !state.executionsById[reqExecId]) {
        const exec: ExecutionSummary = {
          reqExecId,
          flowId: response.flowId ?? flowId,
          method: response.request.method,
          urlResolved: response.request.url,
          reqLabel: response.request.name,
          status: 'success',
          timing: response.timing,
          response: response.response,
          pluginReports: response.pluginReports
        };
        setState('executionsById', reqExecId, exec);
        setState('executionOrder', (prev) => [...prev, reqExecId]);

        // Auto-select
        if (state.selectedReqExecId === undefined) {
          setState('selectedReqExecId', reqExecId);
        }
      }

      setState('executing', false);
      return response;
    } catch (err) {
      closeFlow();
      const message = err instanceof Error ? err.message : String(err);
      setState('executeError', message);
      setState('executing', false);
      return undefined;
    }
  };

  const clearExecutions = () => {
    setState('executionsById', {});
    setState('executionOrder', []);
    setState('selectedReqExecId', undefined);
  };

  const selectExecution = (reqExecId: string | undefined) => {
    setState('selectedReqExecId', reqExecId);
  };

  const selectedExecution = createMemo(() => {
    const id = state.selectedReqExecId;
    if (!id) return undefined;
    return state.executionsById[id];
  });

  const executionsList = createMemo(() => {
    return state.executionOrder
      .map((id) => state.executionsById[id])
      .filter(Boolean) as ExecutionSummary[];
  });

  const selectNextExecution = () => {
    const order = state.executionOrder;
    const currentId = state.selectedReqExecId;
    if (order.length === 0) return;

    if (!currentId) {
      setState('selectedReqExecId', order[0]);
      return;
    }

    const currentIndex = order.indexOf(currentId);
    if (currentIndex < order.length - 1) {
      setState('selectedReqExecId', order[currentIndex + 1]);
    }
  };

  const selectPreviousExecution = () => {
    const order = state.executionOrder;
    const currentId = state.selectedReqExecId;
    if (order.length === 0) return;

    if (!currentId) {
      setState('selectedReqExecId', order[order.length - 1]);
      return;
    }

    const currentIndex = order.indexOf(currentId);
    if (currentIndex > 0) {
      setState('selectedReqExecId', order[currentIndex - 1]);
    }
  };

  // Reset all state
  const reset = () => {
    closeFlow();
    setState(reconcile(createInitialState()));
  };

  return {
    state,
    setState,

    openFlow,
    closeFlow,

    execute,
    clearExecutions,
    selectExecution,

    selectedExecution,
    executionsList,

    selectNextExecution,
    selectPreviousExecution,

    // Script output helpers
    appendStdout,
    appendStderr,
    clearScriptOutput,

    // SSE event handling
    handleSSEEvent,

    // History modal
    openHistory,
    closeHistory,

    reset
  };
}
