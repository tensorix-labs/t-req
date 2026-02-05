/**
 * Observer Store - State management for script running and execution observation.
 *
 * Manages:
 * - Flow state (current flowId, SSE connection status)
 * - Running script state (path, PID, stdout/stderr, exit code)
 * - Executions (live updates from SSE, selection)
 */

import { type Accessor, createMemo } from 'solid-js';
import { createStore, produce, reconcile, type SetStoreFunction } from 'solid-js/store';
import type { StreamConnectionStatus, StreamProtocol, StreamState } from './stream';
import { MAX_STREAM_MESSAGES } from './stream';

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
  error?: {
    stage: string;
    message: string;
  };
  // For display
  statusCode?: number;
}

export interface RunningScriptInfo {
  path: string;
  pid: number;
  startedAt: number;
}

export interface ObserverState {
  flowId: string | undefined;
  sseStatus: SSEStatus;
  lastFlowSeq: number;
  runningScript: RunningScriptInfo | undefined;
  stdoutLines: string[];
  stderrLines: string[];
  exitCode: number | null | undefined;
  executionsById: Record<string, ExecutionSummary>;
  executionOrder: string[];
  selectedReqExecId: string | undefined;
  streamState: StreamState | undefined;
}

export interface ObserverStore {
  // Direct state access (reactive)
  state: ObserverState;
  setState: SetStoreFunction<ObserverState>;

  // Complex mutations (keep as methods)
  appendStdout: (data: string) => void;
  appendStderr: (data: string) => void;
  clearOutput: () => void;
  addExecution: (exec: ExecutionSummary) => void;
  updateExecution: (reqExecId: string, updates: Partial<ExecutionSummary>) => void;
  clearExecutions: () => void;

  // Derived (still memos)
  selectedExecution: Accessor<ExecutionSummary | undefined>;
  executionsList: Accessor<ExecutionSummary[]>;

  // Stream methods
  startStream: (protocol: StreamProtocol, method: string, url: string) => void;
  markStreamConnected: () => void;
  addStreamMessage: (data: string, meta?: Record<string, string | number | undefined>) => void;
  endStream: (status: StreamConnectionStatus, errorMsg?: string) => void;
  setStreamCloseRef: (close: () => void) => void;
  disconnectStream: () => void;

  // Navigation & reset
  selectNextExecution: () => void;
  selectPreviousExecution: () => void;
  reset: () => void;
}

// ============================================================================
// Store Factory
// ============================================================================

const MAX_OUTPUT_LINES = 1000;

function createInitialState(): ObserverState {
  return {
    flowId: undefined,
    sseStatus: 'idle',
    lastFlowSeq: 0,
    runningScript: undefined,
    stdoutLines: [],
    stderrLines: [],
    exitCode: undefined,
    executionsById: {},
    executionOrder: [],
    selectedReqExecId: undefined,
    streamState: undefined
  };
}

export function createObserverStore(): ObserverStore {
  const [state, setState] = createStore<ObserverState>(createInitialState());

  // Closure-scoped — can't live in Solid store (functions get proxied).
  // Scoped per createObserverStore() call, not module-level.
  let streamCloseRef: (() => void) | undefined;

  // Helper to append output while limiting lines
  const appendStdout = (data: string) => {
    setState(
      produce((s) => {
        // Split incoming data into lines, preserving partial lines
        const newLines = data.split('\n');

        // If the last line didn't end with newline, append to it
        if (s.stdoutLines.length > 0 && !s.stdoutLines[s.stdoutLines.length - 1]?.endsWith('\n')) {
          s.stdoutLines[s.stdoutLines.length - 1] += newLines.shift() ?? '';
        }
        s.stdoutLines.push(...newLines);

        // Limit lines
        if (s.stdoutLines.length > MAX_OUTPUT_LINES) {
          s.stdoutLines.splice(0, s.stdoutLines.length - MAX_OUTPUT_LINES);
        }
      })
    );
  };

  const appendStderr = (data: string) => {
    setState(
      produce((s) => {
        const newLines = data.split('\n');

        if (s.stderrLines.length > 0 && !s.stderrLines[s.stderrLines.length - 1]?.endsWith('\n')) {
          s.stderrLines[s.stderrLines.length - 1] += newLines.shift() ?? '';
        }
        s.stderrLines.push(...newLines);

        if (s.stderrLines.length > MAX_OUTPUT_LINES) {
          s.stderrLines.splice(0, s.stderrLines.length - MAX_OUTPUT_LINES);
        }
      })
    );
  };

  const clearOutput = () => {
    setState('stdoutLines', []);
    setState('stderrLines', []);
    setState('exitCode', undefined);
  };

  // Execution mutations
  const addExecution = (exec: ExecutionSummary) => {
    setState('executionsById', exec.reqExecId, exec);
    setState('executionOrder', (prev) => [...prev, exec.reqExecId]);

    // Auto-select first execution
    if (state.selectedReqExecId === undefined) {
      setState('selectedReqExecId', exec.reqExecId);
    }
  };

  const updateExecution = (reqExecId: string, updates: Partial<ExecutionSummary>) => {
    setState(
      produce((s) => {
        const existing = s.executionsById[reqExecId];
        if (!existing) return;
        Object.assign(existing, updates);
      })
    );
  };

  const clearExecutions = () => {
    setState('executionsById', {});
    setState('executionOrder', []);
    setState('selectedReqExecId', undefined);
  };

  // Derived
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

  // Selection navigation
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

  // Stream mutations
  const startStream = (protocol: StreamProtocol, method: string, url: string) => {
    setState('streamState', {
      protocol,
      connectionStatus: 'connecting',
      messages: [],
      messageCount: 0,
      startedAt: Date.now(),
      endedAt: undefined,
      requestMethod: method,
      requestUrl: url
    });
  };

  const markStreamConnected = () => {
    setState('streamState', 'connectionStatus', 'connected');
  };

  const addStreamMessage = (
    data: string,
    meta: Record<string, string | number | undefined> = {}
  ) => {
    let isJson = false;
    try {
      JSON.parse(data);
      isJson = true;
    } catch {
      // not JSON
    }

    setState(
      produce((s) => {
        if (!s.streamState) return;
        // Increment first, then use pre-increment value as global index.
        // messageCount tracks total received (survives truncation), messages[] is the buffer.
        const index = s.streamState.messageCount++;
        s.streamState.messages.push({ index, receivedAt: Date.now(), data, isJson, meta });

        // Cap at MAX_STREAM_MESSAGES — drop oldest
        if (s.streamState.messages.length > MAX_STREAM_MESSAGES) {
          s.streamState.messages.splice(0, s.streamState.messages.length - MAX_STREAM_MESSAGES);
        }
      })
    );
  };

  const endStream = (status: StreamConnectionStatus, errorMsg?: string) => {
    setState(
      produce((s) => {
        if (!s.streamState) return;
        s.streamState.connectionStatus = status;
        s.streamState.endedAt = Date.now();
        if (errorMsg) {
          s.streamState.errorMessage = errorMsg;
        }
      })
    );
    streamCloseRef = undefined;
  };

  const setStreamCloseRef = (close: () => void) => {
    streamCloseRef = close;
  };

  const disconnectStream = () => {
    streamCloseRef?.();
    if (
      state.streamState &&
      state.streamState.connectionStatus !== 'disconnected' &&
      state.streamState.connectionStatus !== 'error'
    ) {
      endStream('disconnected');
    }
  };

  // Reset all state
  const reset = () => {
    streamCloseRef?.();
    streamCloseRef = undefined;
    setState(reconcile(createInitialState()));
  };

  return {
    // State access
    state,
    setState,

    // Mutations
    appendStdout,
    appendStderr,
    clearOutput,
    addExecution,
    updateExecution,
    clearExecutions,

    // Derived
    selectedExecution,
    executionsList,

    // Stream
    startStream,
    markStreamConnected,
    addStreamMessage,
    endStream,
    setStreamCloseRef,
    disconnectStream,

    // Navigation
    selectNextExecution,
    selectPreviousExecution,

    // Reset
    reset
  };
}
