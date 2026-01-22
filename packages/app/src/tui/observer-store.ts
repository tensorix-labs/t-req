/**
 * Observer Store - State management for script running and execution observation.
 *
 * Manages:
 * - Flow state (current flowId, SSE connection status)
 * - Running script state (path, PID, stdout/stderr, exit code)
 * - Executions (live updates from SSE, selection)
 */

import { type Accessor, createMemo, createSignal } from 'solid-js';

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

export interface ObserverStore {
  // Flow state
  flowId: Accessor<string | undefined>;
  setFlowId: (id: string | undefined) => void;
  sseStatus: Accessor<SSEStatus>;
  setSseStatus: (status: SSEStatus) => void;
  lastFlowSeq: Accessor<number>;
  setLastFlowSeq: (seq: number) => void;

  // Runner state
  runningScript: Accessor<RunningScriptInfo | undefined>;
  setRunningScript: (script: RunningScriptInfo | undefined) => void;
  stdoutLines: Accessor<string[]>;
  appendStdout: (data: string) => void;
  stderrLines: Accessor<string[]>;
  appendStderr: (data: string) => void;
  exitCode: Accessor<number | null | undefined>;
  setExitCode: (code: number | null | undefined) => void;
  clearOutput: () => void;

  // Executions
  executionsById: Accessor<Record<string, ExecutionSummary>>;
  executionOrder: Accessor<string[]>;
  selectedReqExecId: Accessor<string | undefined>;
  setSelectedReqExecId: (id: string | undefined) => void;

  // Execution mutations
  addExecution: (exec: ExecutionSummary) => void;
  updateExecution: (reqExecId: string, updates: Partial<ExecutionSummary>) => void;
  clearExecutions: () => void;

  // Derived
  selectedExecution: Accessor<ExecutionSummary | undefined>;
  executionsList: Accessor<ExecutionSummary[]>;

  // Selection navigation
  selectNextExecution: () => void;
  selectPreviousExecution: () => void;

  // Reset all state for new run
  reset: () => void;
}

// ============================================================================
// Store Factory
// ============================================================================

const MAX_OUTPUT_LINES = 1000;

export function createObserverStore(): ObserverStore {
  // Flow state
  const [flowId, setFlowId] = createSignal<string | undefined>(undefined);
  const [sseStatus, setSseStatus] = createSignal<SSEStatus>('idle');
  const [lastFlowSeq, setLastFlowSeq] = createSignal<number>(0);

  // Runner state
  const [runningScript, setRunningScript] = createSignal<RunningScriptInfo | undefined>(undefined);
  const [stdoutLines, setStdoutLines] = createSignal<string[]>([]);
  const [stderrLines, setStderrLines] = createSignal<string[]>([]);
  const [exitCode, setExitCode] = createSignal<number | null | undefined>(undefined);

  // Executions
  const [executionsById, setExecutionsById] = createSignal<Record<string, ExecutionSummary>>({});
  const [executionOrder, setExecutionOrder] = createSignal<string[]>([]);
  const [selectedReqExecId, setSelectedReqExecId] = createSignal<string | undefined>(undefined);

  // Helper to append output while limiting lines
  const appendStdout = (data: string) => {
    setStdoutLines((prev) => {
      // Split incoming data into lines, preserving partial lines
      const newLines = data.split('\n');
      const combined = [...prev];

      // If the last line didn't end with newline, append to it
      if (combined.length > 0 && !prev[prev.length - 1]?.endsWith('\n')) {
        combined[combined.length - 1] = (combined[combined.length - 1] ?? '') + newLines[0];
        combined.push(...newLines.slice(1));
      } else {
        combined.push(...newLines);
      }

      // Limit lines
      if (combined.length > MAX_OUTPUT_LINES) {
        return combined.slice(-MAX_OUTPUT_LINES);
      }
      return combined;
    });
  };

  const appendStderr = (data: string) => {
    setStderrLines((prev) => {
      const newLines = data.split('\n');
      const combined = [...prev];

      if (combined.length > 0 && !prev[prev.length - 1]?.endsWith('\n')) {
        combined[combined.length - 1] = (combined[combined.length - 1] ?? '') + newLines[0];
        combined.push(...newLines.slice(1));
      } else {
        combined.push(...newLines);
      }

      if (combined.length > MAX_OUTPUT_LINES) {
        return combined.slice(-MAX_OUTPUT_LINES);
      }
      return combined;
    });
  };

  const clearOutput = () => {
    setStdoutLines([]);
    setStderrLines([]);
    setExitCode(undefined);
  };

  // Execution mutations
  const addExecution = (exec: ExecutionSummary) => {
    setExecutionsById((prev) => ({
      ...prev,
      [exec.reqExecId]: exec
    }));
    setExecutionOrder((prev) => [...prev, exec.reqExecId]);

    // Auto-select first execution
    if (selectedReqExecId() === undefined) {
      setSelectedReqExecId(exec.reqExecId);
    }
  };

  const updateExecution = (reqExecId: string, updates: Partial<ExecutionSummary>) => {
    setExecutionsById((prev) => {
      const existing = prev[reqExecId];
      if (!existing) return prev;
      return {
        ...prev,
        [reqExecId]: { ...existing, ...updates }
      };
    });
  };

  const clearExecutions = () => {
    setExecutionsById({});
    setExecutionOrder([]);
    setSelectedReqExecId(undefined);
  };

  // Derived
  const selectedExecution = createMemo(() => {
    const id = selectedReqExecId();
    if (!id) return undefined;
    return executionsById()[id];
  });

  const executionsList = createMemo(() => {
    const byId = executionsById();
    return executionOrder()
      .map((id) => byId[id])
      .filter(Boolean) as ExecutionSummary[];
  });

  // Selection navigation
  const selectNextExecution = () => {
    const order = executionOrder();
    const currentId = selectedReqExecId();
    if (order.length === 0) return;

    if (!currentId) {
      setSelectedReqExecId(order[0]);
      return;
    }

    const currentIndex = order.indexOf(currentId);
    if (currentIndex < order.length - 1) {
      setSelectedReqExecId(order[currentIndex + 1]);
    }
  };

  const selectPreviousExecution = () => {
    const order = executionOrder();
    const currentId = selectedReqExecId();
    if (order.length === 0) return;

    if (!currentId) {
      setSelectedReqExecId(order[order.length - 1]);
      return;
    }

    const currentIndex = order.indexOf(currentId);
    if (currentIndex > 0) {
      setSelectedReqExecId(order[currentIndex - 1]);
    }
  };

  // Reset all state
  const reset = () => {
    setFlowId(undefined);
    setSseStatus('idle');
    setLastFlowSeq(0);
    setRunningScript(undefined);
    clearOutput();
    clearExecutions();
  };

  return {
    // Flow state
    flowId,
    setFlowId,
    sseStatus,
    setSseStatus,
    lastFlowSeq,
    setLastFlowSeq,

    // Runner state
    runningScript,
    setRunningScript,
    stdoutLines,
    appendStdout,
    stderrLines,
    appendStderr,
    exitCode,
    setExitCode,
    clearOutput,

    // Executions
    executionsById,
    executionOrder,
    selectedReqExecId,
    setSelectedReqExecId,
    addExecution,
    updateExecution,
    clearExecutions,

    // Derived
    selectedExecution,
    executionsList,

    // Navigation
    selectNextExecution,
    selectPreviousExecution,

    // Reset
    reset
  };
}
