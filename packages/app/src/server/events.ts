// ============================================================================
// Event Envelope for SSE streaming
// ============================================================================

export type EventEnvelope = {
  type: string;
  ts: number;
  runId: string;
  sessionId?: string;
  flowId?: string;
  reqExecId?: string;
  seq: number;
  payload: { type: string } & Record<string, unknown>;
};

// ============================================================================
// Event Manager - handles SSE connections and event routing
// ============================================================================

export type EventSubscriber = {
  id: string;
  sessionId?: string;
  flowId?: string;
  send: (event: EventEnvelope) => void;
  close: () => void;
};

// Constants for runSequence cleanup
const RUN_SEQUENCE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RUN_SEQUENCE_CLEANUP_THRESHOLD = 100;
const RUN_SEQUENCE_CLEANUP_PROBABILITY = 0.01; // 1% chance

type RunSequenceEntry = { seq: number; lastUsed: number };

export function createEventManager() {
  const subscribers = new Map<string, EventSubscriber>();
  const runSequences = new Map<string, RunSequenceEntry>();

  function generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  }

  function getNextSeq(runId: string): number {
    const now = Date.now();

    // Probabilistic cleanup (1% of calls when over threshold)
    if (
      runSequences.size > RUN_SEQUENCE_CLEANUP_THRESHOLD &&
      Math.random() < RUN_SEQUENCE_CLEANUP_PROBABILITY
    ) {
      for (const [id, entry] of runSequences) {
        if (now - entry.lastUsed > RUN_SEQUENCE_TTL_MS) {
          runSequences.delete(id);
        }
      }
    }

    const entry = runSequences.get(runId) ?? { seq: 0, lastUsed: now };
    entry.seq++;
    entry.lastUsed = now;
    runSequences.set(runId, entry);
    return entry.seq;
  }

  function subscribe(
    sessionId: string | undefined,
    send: (event: EventEnvelope) => void,
    close: () => void,
    flowId?: string
  ): string {
    const id = generateId();
    subscribers.set(id, { id, sessionId, flowId, send, close });
    return id;
  }

  function unsubscribe(subscriberId: string): void {
    subscribers.delete(subscriberId);
  }

  function emit(
    sessionId: string | undefined,
    runId: string,
    event: { type: string } & Record<string, unknown>
  ): void {
    // Extract flowId and reqExecId from the event if present
    const eventFlowId = event.flowId as string | undefined;
    const eventReqExecId = event.reqExecId as string | undefined;
    const eventSeq = typeof event.seq === 'number' ? event.seq : undefined;

    const envelope: EventEnvelope = {
      type: event.type,
      ts: Date.now(),
      runId,
      sessionId,
      flowId: eventFlowId,
      reqExecId: eventReqExecId,
      // Prefer flow-scoped seq when provided by producer (service).
      // Fallback to run-scoped sequencing for legacy non-flow events.
      seq: eventSeq ?? getNextSeq(runId),
      payload: event
    };

    // Send to subscribers that match the filters
    for (const subscriber of subscribers.values()) {
      // Check session filter
      const sessionMatches =
        subscriber.sessionId === undefined || subscriber.sessionId === sessionId;

      // Check flow filter
      const flowMatches = subscriber.flowId === undefined || subscriber.flowId === eventFlowId;

      if (sessionMatches && flowMatches) {
        try {
          subscriber.send(envelope);
        } catch {
          // Subscriber might be disconnected, remove it
          subscribers.delete(subscriber.id);
        }
      }
    }
  }

  function closeAll(): void {
    for (const subscriber of subscribers.values()) {
      subscriber.close();
    }
    subscribers.clear();
    runSequences.clear();
  }

  return {
    subscribe,
    unsubscribe,
    emit,
    closeAll,
    getSubscriberCount: () => subscribers.size
  };
}

export type EventManager = ReturnType<typeof createEventManager>;
