import type { ExecutionStatus } from '../schemas';
import type { FlowManager } from './flow-manager';
import type { Flow, PluginHookInfo, ServiceContext, StoredExecution } from './types';

export interface FlowTracker {
  readonly state: {
    urlResolved?: string;
    status: ExecutionStatus;
    error?: { stage: string; message: string };
  };
  failExecution(stage: string, message: string): void;
  createEventHandler(
    sessionId: string | undefined
  ): (event: { type: string } & Record<string, unknown>) => void;
  initPendingExecution(params: {
    reqExecId: string;
    sessionId?: string;
    reqLabel?: string;
    source?: StoredExecution['source'];
    selectedRequest: {
      raw: string;
      method: string;
      url: string;
      headers: Record<string, string>;
      body?: string;
    };
    startTime: number;
  }): void;
  finalizeExecution(params: {
    reqExecId: string;
    selectedRequest: { url: string };
    endTime: number;
    startTime: number;
    responseData: StoredExecution['response'];
  }): void;
}

export function createFlowTracker(
  flowManager: FlowManager,
  context: ServiceContext,
  flow: Flow | undefined,
  runId: string,
  reqExecId: string | undefined,
  startTime: number
): FlowTracker {
  const state = {
    urlResolved: undefined as string | undefined,
    status: 'pending' as ExecutionStatus,
    error: undefined as { stage: string; message: string } | undefined
  };

  let failureEmitted = false;

  function failExecution(stage: string, message: string): void {
    state.status = 'failed';
    state.error = { stage, message };

    if (flow && reqExecId) {
      const exec = flow.executions.get(reqExecId);
      if (exec) {
        exec.status = 'failed';
        exec.error = state.error;
        const endTime = Date.now();
        exec.timing.endTime = endTime;
        exec.timing.durationMs = endTime - startTime;
      }

      if (!failureEmitted) {
        failureEmitted = true;
        flowManager.emitEvent(flow, runId, reqExecId, {
          type: 'executionFailed',
          stage,
          message
        });
      }
    }
  }

  function createEventHandler(sessionId: string | undefined) {
    return (event: { type: string } & Record<string, unknown>) => {
      // Capture resolved URL from fetchStarted
      if (event.type === 'fetchStarted' && typeof event.url === 'string') {
        state.urlResolved = event.url;
        state.status = 'running';

        if (flow && reqExecId) {
          const exec = flow.executions.get(reqExecId);
          if (exec) {
            exec.urlResolved = event.url;
            exec.status = 'running';
          }
        }
      }

      // Capture TTFB from fetchFinished
      if (event.type === 'fetchFinished' && typeof event.ttfb === 'number') {
        if (flow && reqExecId) {
          const exec = flow.executions.get(reqExecId);
          if (exec) {
            exec.timing.ttfb = event.ttfb;
          }
        }
      }

      // Capture errors
      if (event.type === 'error') {
        const stage = String(event.stage ?? 'unknown');
        const message = String(event.message ?? 'Unknown error');
        failExecution(stage, message);
      }

      // Capture plugin hook execution info
      if (event.type === 'pluginHookFinished' && flow && reqExecId) {
        const exec = flow.executions.get(reqExecId);
        if (exec) {
          const hookInfo: PluginHookInfo = {
            pluginName: String(event.name ?? 'unknown'),
            hook: String(event.hook ?? 'unknown'),
            durationMs: typeof event.durationMs === 'number' ? event.durationMs : 0,
            modified: Boolean(event.modified)
          };
          exec.pluginHooks = exec.pluginHooks ?? [];
          exec.pluginHooks.push(hookInfo);
        }
      }

      // Emit to subscribers with flow context
      if (flow && reqExecId) {
        flowManager.emitEvent(flow, runId, reqExecId, event);
      } else {
        // Legacy non-flow event emission
        context.onEvent?.(sessionId, runId, event);
      }
    };
  }

  function initPendingExecution(params: {
    reqExecId: string;
    sessionId?: string;
    reqLabel?: string;
    source?: StoredExecution['source'];
    selectedRequest: {
      raw: string;
      method: string;
      url: string;
      headers: Record<string, string>;
      body?: string;
    };
    startTime: number;
  }): void {
    if (!flow || !reqExecId) return;

    const pendingExecution: StoredExecution = {
      reqExecId: params.reqExecId,
      flowId: flow.id,
      sessionId: params.sessionId,
      reqLabel: params.reqLabel,
      source: params.source,
      rawHttpBlock: params.selectedRequest.raw,
      method: params.selectedRequest.method,
      urlTemplate: params.selectedRequest.url,
      urlResolved: undefined,
      headers: Object.entries(params.selectedRequest.headers).map(([name, value]) => ({
        name,
        value
      })),
      bodyPreview: params.selectedRequest.body?.slice(0, 1000),
      timing: {
        startTime: params.startTime,
        endTime: undefined,
        durationMs: undefined
      },
      response: undefined,
      status: 'pending',
      error: undefined
    };

    flowManager.storeExecution(flow.id, pendingExecution);

    flowManager.emitEvent(flow, runId, params.reqExecId, {
      type: 'requestQueued',
      reqLabel: params.reqLabel,
      source: params.source
    });
  }

  function finalizeExecution(params: {
    reqExecId: string;
    selectedRequest: { url: string };
    endTime: number;
    startTime: number;
    responseData: StoredExecution['response'];
  }): void {
    if (!flow || !reqExecId) return;

    const exec = flow.executions.get(params.reqExecId);
    if (exec) {
      exec.urlResolved = state.urlResolved ?? params.selectedRequest.url;
      exec.timing.endTime = params.endTime;
      exec.timing.durationMs = params.endTime - params.startTime;
      exec.response = params.responseData;
      exec.status = state.status === 'failed' ? 'failed' : 'success';
      exec.error = state.error;
      flow.lastActivityAt = context.now();
    }
  }

  return {
    state,
    failExecution,
    createEventHandler,
    initPendingExecution,
    finalizeExecution
  };
}
