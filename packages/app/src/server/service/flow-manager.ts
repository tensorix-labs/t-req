import {
  ExecutionNotFoundError,
  FlowLimitReachedError,
  FlowNotFoundError,
  SessionNotFoundError
} from '../errors';
import type {
  CreateFlowRequest,
  CreateFlowResponse,
  ExecutionDetail,
  FinishFlowResponse,
  FlowSummary
} from '../schemas';
import type { SessionManager } from './session-manager';
import type { Flow, ServiceContext, StoredExecution } from './types';
import { CLEANUP_INTERVAL_MS, FLOW_TTL_MS, MAX_EXECUTIONS_PER_FLOW, MAX_FLOWS } from './types';
import { generateFlowId, sanitizeHeaders } from './utils';

export interface FlowManager {
  create(request: CreateFlowRequest): CreateFlowResponse;
  finish(flowId: string): FinishFlowResponse;
  getExecution(flowId: string, reqExecId: string): ExecutionDetail;
  storeExecution(flowId: string, execution: StoredExecution): void;
  get(flowId: string): Flow | undefined;
  emitEvent(
    flow: Flow,
    runId: string,
    reqExecId: string | undefined,
    event: { type: string } & Record<string, unknown>
  ): void;
  dispose(): void;
  /** For testing - get the internal flows map */
  getFlows(): Map<string, Flow>;
}

export function createFlowManager(
  context: ServiceContext,
  sessionManager: SessionManager
): FlowManager {
  const flows = new Map<string, Flow>();

  // Flow cleanup interval
  const cleanupInterval = setInterval(() => {
    const now = context.now();
    for (const [id, flow] of flows) {
      if (now - flow.lastActivityAt > FLOW_TTL_MS) {
        flows.delete(id);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Evict oldest flow when limit reached
  function evictOldestFlow(): boolean {
    let oldest: Flow | null = null;
    for (const flow of flows.values()) {
      if (!flow.finished) continue;
      if (!oldest || flow.lastActivityAt < oldest.lastActivityAt) {
        oldest = flow;
      }
    }
    if (oldest) {
      flows.delete(oldest.id);
      return true;
    }
    return false;
  }

  // Get next sequence number for a flow
  function getFlowSeq(flowId: string): number {
    const flow = flows.get(flowId);
    if (!flow) return 0;
    flow.seq++;
    return flow.seq;
  }

  function emitEvent(
    flow: Flow,
    runId: string,
    reqExecId: string | undefined,
    event: { type: string } & Record<string, unknown>
  ): void {
    const seq = getFlowSeq(flow.id);
    context.onEvent?.(flow.sessionId, runId, {
      ...event,
      flowId: flow.id,
      reqExecId,
      seq,
      ts: context.now()
    });
  }

  function create(request: CreateFlowRequest): CreateFlowResponse {
    // Validate sessionId if provided
    if (request.sessionId && !sessionManager.has(request.sessionId)) {
      throw new SessionNotFoundError(request.sessionId);
    }

    // Evict oldest flow when limit reached
    if (flows.size >= MAX_FLOWS) {
      const evicted = evictOldestFlow();
      if (!evicted) {
        throw new FlowLimitReachedError(MAX_FLOWS);
      }
    }

    const flowId = generateFlowId();
    const now = context.now();

    const flow: Flow = {
      id: flowId,
      sessionId: request.sessionId,
      label: request.label,
      meta: request.meta,
      createdAt: now,
      lastActivityAt: now,
      finished: false,
      executions: new Map(),
      seq: 0
    };

    flows.set(flowId, flow);

    // Emit flowStarted event
    const runId = `flow-${flowId}`;
    emitEvent(flow, runId, undefined, {
      type: 'flowStarted',
      flowId,
      sessionId: request.sessionId,
      label: request.label,
      ts: now
    });

    return { flowId };
  }

  function finish(flowId: string): FinishFlowResponse {
    const flow = flows.get(flowId);
    if (!flow) {
      throw new FlowNotFoundError(flowId);
    }

    flow.finished = true;
    flow.lastActivityAt = context.now();

    // Calculate summary
    let total = 0;
    let succeeded = 0;
    let failed = 0;
    let earliestStart: number | undefined;
    let latestEnd: number | undefined;

    for (const exec of flow.executions.values()) {
      total++;
      if (exec.status === 'success') succeeded++;
      if (exec.status === 'failed') failed++;

      if (earliestStart === undefined || exec.timing.startTime < earliestStart) {
        earliestStart = exec.timing.startTime;
      }
      if (exec.timing.endTime !== undefined) {
        if (latestEnd === undefined || exec.timing.endTime > latestEnd) {
          latestEnd = exec.timing.endTime;
        }
      }
    }

    const durationMs =
      earliestStart !== undefined && latestEnd !== undefined ? latestEnd - earliestStart : 0;

    const summary: FlowSummary = { total, succeeded, failed, durationMs };

    // Emit flowFinished event
    const runId = `flow-${flowId}`;
    emitEvent(flow, runId, undefined, {
      type: 'flowFinished',
      flowId,
      summary
    });

    return { flowId, summary };
  }

  function getExecution(flowId: string, reqExecId: string): ExecutionDetail {
    const flow = flows.get(flowId);
    if (!flow) {
      throw new FlowNotFoundError(flowId);
    }

    const exec = flow.executions.get(reqExecId);
    if (!exec) {
      throw new ExecutionNotFoundError(flowId, reqExecId);
    }

    // Return sanitized execution detail
    return {
      reqExecId: exec.reqExecId,
      flowId: exec.flowId,
      sessionId: exec.sessionId,
      reqLabel: exec.reqLabel,
      source: exec.source,
      rawHttpBlock: exec.rawHttpBlock,
      method: exec.method,
      urlTemplate: exec.urlTemplate,
      urlResolved: exec.urlResolved,
      headers: exec.headers ? sanitizeHeaders(exec.headers) : undefined,
      bodyPreview: exec.bodyPreview,
      timing: exec.timing,
      response: exec.response
        ? {
            ...exec.response,
            headers: sanitizeHeaders(exec.response.headers)
          }
        : undefined,
      pluginHooks: exec.pluginHooks,
      status: exec.status,
      error: exec.error
    };
  }

  function storeExecution(flowId: string, execution: StoredExecution): void {
    const flow = flows.get(flowId);
    if (!flow) return;

    // Evict oldest executions if over limit
    if (flow.executions.size >= MAX_EXECUTIONS_PER_FLOW) {
      // Find oldest execution by startTime
      let oldest: StoredExecution | null = null;
      for (const exec of flow.executions.values()) {
        if (!oldest || exec.timing.startTime < oldest.timing.startTime) {
          oldest = exec;
        }
      }
      if (oldest) {
        flow.executions.delete(oldest.reqExecId);
      }
    }

    flow.executions.set(execution.reqExecId, execution);
    flow.lastActivityAt = context.now();
  }

  function get(flowId: string): Flow | undefined {
    return flows.get(flowId);
  }

  function dispose(): void {
    clearInterval(cleanupInterval);
    flows.clear();
  }

  function getFlows(): Map<string, Flow> {
    return flows;
  }

  return {
    create,
    finish,
    getExecution,
    storeExecution,
    get,
    emitEvent,
    dispose,
    getFlows
  };
}
