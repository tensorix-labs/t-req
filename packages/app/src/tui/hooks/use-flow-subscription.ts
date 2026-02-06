/**
 * useFlowSubscription Hook
 *
 * Encapsulates SSE subscription and event processing for HTTP request execution.
 * Manages the SSE connection lifecycle and updates observer state with execution events.
 */

import type { EventEnvelope } from '@t-req/sdk/client';
import type { Accessor } from 'solid-js';
import { useObserver, useSDK } from '../context';
import type { ExecutionStatus, SSEStatus } from '../observer-store';

export interface FlowSubscriptionReturn {
  subscribe: (flowId: string) => () => void;
  unsubscribe: () => void;
  sseStatus: Accessor<SSEStatus>;
  cleanup: () => void;
}

export function useFlowSubscription(): FlowSubscriptionReturn {
  const sdk = useSDK();
  const observer = useObserver();

  // Keep track of abort controller for current subscription
  let currentController: AbortController | undefined;

  // Handle SSE events
  function handleSSEEvent(event: EventEnvelope) {
    // Reject events from different/old flows to prevent duplicates after reset
    const currentFlowId = observer.state.flowId;
    if (event.flowId && event.flowId !== currentFlowId) {
      return;
    }

    const seq = event.seq;
    const lastSeq = observer.state.lastFlowSeq;

    // Flow-global idempotency: skip if we've already processed this or later
    if (seq <= lastSeq) return;
    observer.setState('lastFlowSeq', seq);

    switch (event.type) {
      case 'requestQueued': {
        // Create execution with pending status
        const reqExecId = event.reqExecId;
        const flowId = event.flowId;
        if (!reqExecId || !flowId) return;

        const payload = event.payload as { reqLabel?: string; source?: unknown };
        observer.addExecution({
          reqExecId,
          flowId,
          sessionId: event.sessionId,
          reqLabel: payload.reqLabel,
          status: 'pending',
          timing: { startTime: event.ts }
        });
        break;
      }
      case 'fetchStarted': {
        // Update execution to running status
        const reqExecId = event.reqExecId;
        if (!reqExecId) return;

        const payload = event.payload as { method?: string; url?: string };
        observer.updateExecution(reqExecId, {
          status: 'running',
          method: payload.method,
          urlResolved: payload.url
        });
        break;
      }
      case 'fetchFinished': {
        // Update execution to success
        const reqExecId = event.reqExecId;
        if (!reqExecId) return;

        const payload = event.payload as { status?: number };
        const endTime = event.ts;
        const exec = observer.state.executionsById[reqExecId];
        observer.updateExecution(reqExecId, {
          status: 'success',
          statusCode: payload.status,
          timing: {
            ...exec?.timing,
            startTime: exec?.timing.startTime ?? endTime,
            endTime,
            durationMs: exec ? endTime - exec.timing.startTime : 0
          }
        });
        break;
      }
      case 'executionFailed': {
        // Update execution to failed
        const reqExecId = event.reqExecId;
        if (!reqExecId) return;

        const payload = event.payload as { stage?: string; message?: string };
        const endTime = event.ts;
        const exec = observer.state.executionsById[reqExecId];
        observer.updateExecution(reqExecId, {
          status: 'failed' as ExecutionStatus,
          error: {
            stage: payload.stage ?? 'unknown',
            message: payload.message ?? 'Unknown error'
          },
          timing: {
            ...exec?.timing,
            startTime: exec?.timing.startTime ?? endTime,
            endTime,
            durationMs: exec ? endTime - exec.timing.startTime : 0
          }
        });
        break;
      }

      // Script events
      case 'scriptStarted': {
        const payload = event.payload as { runId: string; filePath: string; runner: string };
        observer.setState('runningScript', {
          path: payload.filePath,
          pid: 0, // PID is set by server, we don't need it on client
          startedAt: event.ts
        });
        break;
      }
      case 'scriptOutput': {
        const payload = event.payload as {
          runId: string;
          stream: 'stdout' | 'stderr';
          data: string;
        };
        if (payload.stream === 'stdout') {
          observer.appendStdout(payload.data);
        } else {
          observer.appendStderr(payload.data);
        }
        break;
      }
      case 'scriptFinished': {
        const payload = event.payload as { runId: string; exitCode: number | null };
        observer.setState('exitCode', payload.exitCode);
        observer.setState('runningScript', undefined);
        break;
      }

      // Plugin events: pluginHookFinished events are stored on the server
      // and returned via getExecution endpoint. No client-side handling needed.

      // Test events (same handling as script events)
      case 'testStarted': {
        const payload = event.payload as { runId: string; filePath: string; framework: string };
        observer.setState('runningScript', {
          path: payload.filePath,
          pid: 0,
          startedAt: event.ts
        });
        break;
      }
      case 'testOutput': {
        const payload = event.payload as {
          runId: string;
          stream: 'stdout' | 'stderr';
          data: string;
        };
        if (payload.stream === 'stdout') {
          observer.appendStdout(payload.data);
        } else {
          observer.appendStderr(payload.data);
        }
        break;
      }
      case 'testFinished': {
        const payload = event.payload as { runId: string; exitCode: number | null; status: string };
        observer.setState('exitCode', payload.exitCode);
        observer.setState('runningScript', undefined);
        break;
      }
    }
  }

  function subscribe(flowId: string): () => void {
    // Unsubscribe from any previous subscription
    if (currentController) {
      currentController.abort();
      currentController = undefined;
    }

    const controller = new AbortController();
    currentController = controller;

    observer.setState('sseStatus', 'connecting');

    // Use generated SSE client — getEvent returns { stream } with onSseEvent callback
    const resultPromise = sdk.getEvent({
      query: { flowId },
      signal: controller.signal,
      onSseEvent: (event) => {
        handleSSEEvent(event.data as EventEnvelope);
      },
      onSseError: () => {
        if (!controller.signal.aborted) {
          observer.setState('sseStatus', 'error');
        }
      },
      sseMaxRetryAttempts: 0
    });

    // Drive the generator to consume events
    (async () => {
      try {
        const { stream } = await resultPromise;
        observer.setState('sseStatus', 'open');
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of stream) {
          // onSseEvent handles dispatch
        }
        if (!controller.signal.aborted) {
          observer.setState('sseStatus', 'closed');
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          observer.setState('sseStatus', 'error');
          console.error('SSE error:', err);
        }
      }
    })();

    // Return a function that unsubscribes THIS specific subscription
    return () => {
      controller.abort();
      if (currentController === controller) {
        currentController = undefined;
      }
      observer.setState('sseStatus', 'closed');
    };
  }

  function unsubscribe() {
    if (currentController) {
      currentController.abort();
      currentController = undefined;
    }
    observer.setState('sseStatus', 'closed');
  }

  function cleanup() {
    unsubscribe();
  }

  return {
    subscribe,
    unsubscribe,
    sseStatus: () => observer.state.sseStatus,
    cleanup
  };
}
