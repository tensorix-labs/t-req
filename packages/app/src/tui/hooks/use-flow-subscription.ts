/**
 * useFlowSubscription Hook
 *
 * Encapsulates SSE subscription and event processing for HTTP request execution.
 * Manages the SSE connection lifecycle and updates observer state with execution events.
 */

import type { Accessor } from 'solid-js';
import { useObserver, useSDK } from '../context';
import type { ExecutionStatus, SSEStatus } from '../observer-store';
import type { EventEnvelope } from '../sdk';

export interface FlowSubscriptionReturn {
  subscribe: (flowId: string) => () => void;
  unsubscribe: () => void;
  sseStatus: Accessor<SSEStatus>;
  cleanup: () => void;
}

export function useFlowSubscription(): FlowSubscriptionReturn {
  const sdk = useSDK();
  const observer = useObserver();

  // Keep track of unsubscribe function
  let sseUnsubscribe: (() => void) | undefined;

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
        const payload = event.payload as { reqLabel?: string; source?: unknown };
        observer.addExecution({
          reqExecId: event.reqExecId!,
          flowId: event.flowId!,
          sessionId: event.sessionId,
          reqLabel: payload.reqLabel,
          status: 'pending',
          timing: { startTime: event.ts }
        });
        break;
      }
      case 'fetchStarted': {
        // Update execution to running status
        const payload = event.payload as { method?: string; url?: string };
        observer.updateExecution(event.reqExecId!, {
          status: 'running',
          method: payload.method,
          urlResolved: payload.url
        });
        break;
      }
      case 'fetchFinished': {
        // Update execution to success
        const payload = event.payload as { status?: number };
        const endTime = event.ts;
        const exec = observer.state.executionsById[event.reqExecId!];
        observer.updateExecution(event.reqExecId!, {
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
        const payload = event.payload as { stage?: string; message?: string };
        const endTime = event.ts;
        const exec = observer.state.executionsById[event.reqExecId!];
        observer.updateExecution(event.reqExecId!, {
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
    }
  }

  function subscribe(flowId: string): () => void {
    // Unsubscribe from any previous subscription
    if (sseUnsubscribe) {
      sseUnsubscribe();
      sseUnsubscribe = undefined;
    }

    observer.setState('sseStatus', 'connecting');

    // Capture the specific unsubscribe function for this subscription
    const currentUnsubscribe = sdk.subscribeEvents(
      flowId,
      handleSSEEvent,
      (error) => {
        observer.setState('sseStatus', 'error');
        console.error('SSE error:', error);
      },
      () => {
        observer.setState('sseStatus', 'closed');
      }
    );

    sseUnsubscribe = currentUnsubscribe;
    observer.setState('sseStatus', 'open');

    // Return a function that unsubscribes THIS specific subscription
    return () => {
      currentUnsubscribe(); // Use captured value, not closure variable
      if (sseUnsubscribe === currentUnsubscribe) {
        sseUnsubscribe = undefined;
      }
      observer.setState('sseStatus', 'closed');
    };
  }

  function unsubscribe() {
    if (sseUnsubscribe) {
      sseUnsubscribe();
      sseUnsubscribe = undefined;
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
