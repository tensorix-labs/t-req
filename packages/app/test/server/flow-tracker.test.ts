import { describe, expect, test } from 'bun:test';
import type { FlowManager } from '../../src/server/service/flow-manager';
import { createFlowTracker } from '../../src/server/service/flow-tracker';
import type { Flow, ServiceContext, StoredExecution } from '../../src/server/service/types';

function createMockContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    workspaceRoot: '/workspace',
    maxBodyBytes: 1024 * 1024,
    maxSessions: 10,
    sessionTtlMs: 3600000,
    now: () => Date.now(),
    ...overrides
  };
}

function createMockFlow(id = 'flow-1'): Flow {
  return {
    id,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    finished: false,
    executions: new Map(),
    seq: 0
  };
}

function createMockFlowManager(): FlowManager & {
  emittedEvents: Array<{ flowId: string; event: Record<string, unknown> }>;
} {
  const emittedEvents: Array<{ flowId: string; event: Record<string, unknown> }> = [];
  return {
    emittedEvents,
    create: () => ({ flowId: 'flow-1' }),
    finish: () => ({
      flowId: 'flow-1',
      summary: { total: 0, succeeded: 0, failed: 0, durationMs: 0 }
    }),
    getExecution: () => {
      throw new Error('not impl');
    },
    storeExecution: (_flowId: string, _exec: StoredExecution) => {
      // Store in the mock flow
    },
    get: () => undefined,
    emitEvent: (
      flow: Flow,
      _runId: string,
      _reqExecId: string | undefined,
      event: Record<string, unknown>
    ) => {
      emittedEvents.push({ flowId: flow.id, event });
    },
    dispose: () => {},
    getFlows: () => new Map()
  };
}

describe('createFlowTracker', () => {
  describe('failExecution', () => {
    test('updates state with error info', () => {
      const context = createMockContext();
      const flowManager = createMockFlowManager();
      const flow = createMockFlow();
      const reqExecId = 'req-1';

      const tracker = createFlowTracker(flowManager, context, flow, 'run-1', reqExecId, Date.now());

      tracker.failExecution('fetch', 'Connection refused');

      expect(tracker.state.status).toBe('failed');
      expect(tracker.state.error).toEqual({ stage: 'fetch', message: 'Connection refused' });
    });

    test('emits executionFailed event when flow is present', () => {
      const context = createMockContext();
      const flowManager = createMockFlowManager();
      const flow = createMockFlow();
      const reqExecId = 'req-1';

      // Add a stored execution
      flow.executions.set(reqExecId, {
        reqExecId,
        flowId: flow.id,
        timing: { startTime: Date.now() },
        status: 'running'
      } as StoredExecution);

      const tracker = createFlowTracker(flowManager, context, flow, 'run-1', reqExecId, Date.now());

      tracker.failExecution('fetch', 'timeout');

      expect(flowManager.emittedEvents).toHaveLength(1);
      expect(flowManager.emittedEvents[0]?.event.type).toBe('executionFailed');
      expect(flowManager.emittedEvents[0]?.event.stage).toBe('fetch');
    });

    test('only emits failure event once', () => {
      const context = createMockContext();
      const flowManager = createMockFlowManager();
      const flow = createMockFlow();
      const reqExecId = 'req-1';

      flow.executions.set(reqExecId, {
        reqExecId,
        flowId: flow.id,
        timing: { startTime: Date.now() },
        status: 'running'
      } as StoredExecution);

      const tracker = createFlowTracker(flowManager, context, flow, 'run-1', reqExecId, Date.now());

      tracker.failExecution('fetch', 'first error');
      tracker.failExecution('fetch', 'second error');

      expect(flowManager.emittedEvents).toHaveLength(1);
    });
  });

  describe('createEventHandler', () => {
    test('captures URL from fetchStarted event', () => {
      const context = createMockContext();
      const flowManager = createMockFlowManager();
      const flow = createMockFlow();
      const reqExecId = 'req-1';

      flow.executions.set(reqExecId, {
        reqExecId,
        flowId: flow.id,
        timing: { startTime: Date.now() },
        status: 'pending'
      } as StoredExecution);

      const tracker = createFlowTracker(flowManager, context, flow, 'run-1', reqExecId, Date.now());
      const handler = tracker.createEventHandler(undefined);

      handler({ type: 'fetchStarted', url: 'https://api.example.com', method: 'GET' });

      expect(tracker.state.urlResolved).toBe('https://api.example.com');
      expect(tracker.state.status).toBe('running');

      const exec = flow.executions.get(reqExecId);
      expect(exec?.urlResolved).toBe('https://api.example.com');
      expect(exec?.status).toBe('running');
    });

    test('captures TTFB from fetchFinished event', () => {
      const context = createMockContext();
      const flowManager = createMockFlowManager();
      const flow = createMockFlow();
      const reqExecId = 'req-1';

      flow.executions.set(reqExecId, {
        reqExecId,
        flowId: flow.id,
        timing: { startTime: Date.now() },
        status: 'running'
      } as StoredExecution);

      const tracker = createFlowTracker(flowManager, context, flow, 'run-1', reqExecId, Date.now());
      const handler = tracker.createEventHandler(undefined);

      handler({ type: 'fetchFinished', ttfb: 42.5, status: 200 });

      const exec = flow.executions.get(reqExecId);
      expect(exec?.timing.ttfb).toBe(42.5);
    });

    test('captures error events and calls failExecution', () => {
      const context = createMockContext();
      const flowManager = createMockFlowManager();
      const flow = createMockFlow();
      const reqExecId = 'req-1';

      flow.executions.set(reqExecId, {
        reqExecId,
        flowId: flow.id,
        timing: { startTime: Date.now() },
        status: 'running'
      } as StoredExecution);

      const tracker = createFlowTracker(flowManager, context, flow, 'run-1', reqExecId, Date.now());
      const handler = tracker.createEventHandler(undefined);

      handler({ type: 'error', stage: 'fetch', message: 'DNS resolution failed' });

      expect(tracker.state.status).toBe('failed');
      expect(tracker.state.error?.stage).toBe('fetch');
    });

    test('captures pluginHookFinished events', () => {
      const context = createMockContext();
      const flowManager = createMockFlowManager();
      const flow = createMockFlow();
      const reqExecId = 'req-1';

      flow.executions.set(reqExecId, {
        reqExecId,
        flowId: flow.id,
        timing: { startTime: Date.now() },
        status: 'running'
      } as StoredExecution);

      const tracker = createFlowTracker(flowManager, context, flow, 'run-1', reqExecId, Date.now());
      const handler = tracker.createEventHandler(undefined);

      handler({
        type: 'pluginHookFinished',
        name: 'auth-plugin',
        hook: 'request.before',
        durationMs: 5,
        modified: true
      });

      const exec = flow.executions.get(reqExecId);
      expect(exec?.pluginHooks).toHaveLength(1);
      expect(exec?.pluginHooks?.[0]).toEqual({
        pluginName: 'auth-plugin',
        hook: 'request.before',
        durationMs: 5,
        modified: true
      });
    });

    test('emits events via flowManager when flow is present', () => {
      const context = createMockContext();
      const flowManager = createMockFlowManager();
      const flow = createMockFlow();
      const reqExecId = 'req-1';

      const tracker = createFlowTracker(flowManager, context, flow, 'run-1', reqExecId, Date.now());
      const handler = tracker.createEventHandler(undefined);

      handler({ type: 'compileStarted' });

      expect(flowManager.emittedEvents).toHaveLength(1);
      expect(flowManager.emittedEvents[0]?.event.type).toBe('compileStarted');
    });

    test('falls back to context.onEvent when no flow', () => {
      const events: Array<Record<string, unknown>> = [];
      const context = createMockContext({
        onEvent: (_sessionId, _runId, event) => {
          events.push(event as Record<string, unknown>);
        }
      });
      const flowManager = createMockFlowManager();

      const tracker = createFlowTracker(
        flowManager,
        context,
        undefined,
        'run-1',
        undefined,
        Date.now()
      );
      const handler = tracker.createEventHandler('session-1');

      handler({ type: 'fetchStarted', url: 'https://example.com', method: 'GET' });

      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('fetchStarted');
    });
  });

  describe('no-op behavior when flow is undefined', () => {
    test('failExecution is a no-op without flow', () => {
      const context = createMockContext();
      const flowManager = createMockFlowManager();

      const tracker = createFlowTracker(
        flowManager,
        context,
        undefined,
        'run-1',
        undefined,
        Date.now()
      );

      // Should not throw
      tracker.failExecution('test', 'error');

      // State still updates locally
      expect(tracker.state.status).toBe('failed');
      expect(tracker.state.error).toEqual({ stage: 'test', message: 'error' });

      // But no events emitted to flow manager
      expect(flowManager.emittedEvents).toHaveLength(0);
    });

    test('initPendingExecution is a no-op without flow', () => {
      const context = createMockContext();
      const flowManager = createMockFlowManager();

      const tracker = createFlowTracker(
        flowManager,
        context,
        undefined,
        'run-1',
        undefined,
        Date.now()
      );

      // Should not throw
      tracker.initPendingExecution({
        reqExecId: 'req-1',
        selectedRequest: { raw: '', method: 'GET', url: '', headers: {} },
        startTime: Date.now()
      });

      expect(flowManager.emittedEvents).toHaveLength(0);
    });

    test('finalizeExecution is a no-op without flow', () => {
      const context = createMockContext();
      const flowManager = createMockFlowManager();

      const tracker = createFlowTracker(
        flowManager,
        context,
        undefined,
        'run-1',
        undefined,
        Date.now()
      );

      // Should not throw
      tracker.finalizeExecution({
        reqExecId: 'req-1',
        selectedRequest: { url: 'https://example.com' },
        endTime: Date.now(),
        startTime: Date.now() - 100,
        responseData: undefined
      });
    });
  });

  describe('initPendingExecution', () => {
    test('stores execution and emits requestQueued', () => {
      const context = createMockContext();
      const flowManager = createMockFlowManager();
      const flow = createMockFlow();
      const reqExecId = 'req-1';

      // Need to override storeExecution to actually store
      flowManager.storeExecution = (_flowId: string, exec: StoredExecution) => {
        flow.executions.set(exec.reqExecId, exec);
      };

      const tracker = createFlowTracker(flowManager, context, flow, 'run-1', reqExecId, Date.now());

      tracker.initPendingExecution({
        reqExecId,
        sessionId: 'sess-1',
        reqLabel: 'test request',
        source: { kind: 'string', requestIndex: 0 },
        selectedRequest: {
          raw: 'GET https://example.com\n',
          method: 'GET',
          url: 'https://example.com',
          headers: { Accept: 'application/json' },
          body: '{"test": true}'
        },
        startTime: 1000
      });

      expect(flowManager.emittedEvents).toHaveLength(1);
      expect(flowManager.emittedEvents[0]?.event.type).toBe('requestQueued');
    });
  });

  describe('finalizeExecution', () => {
    test('updates stored execution with response data', () => {
      const context = createMockContext();
      const flowManager = createMockFlowManager();
      const flow = createMockFlow();
      const reqExecId = 'req-1';

      flow.executions.set(reqExecId, {
        reqExecId,
        flowId: flow.id,
        timing: { startTime: 1000 },
        status: 'running'
      } as StoredExecution);

      const tracker = createFlowTracker(flowManager, context, flow, 'run-1', reqExecId, 1000);

      tracker.finalizeExecution({
        reqExecId,
        selectedRequest: { url: 'https://example.com' },
        endTime: 1500,
        startTime: 1000,
        responseData: {
          status: 200,
          statusText: 'OK',
          headers: [],
          body: '{"ok":true}',
          encoding: 'utf-8' as const,
          truncated: false,
          bodyBytes: 11
        }
      });

      const exec = flow.executions.get(reqExecId);
      expect(exec).toBeDefined();
      expect(exec?.status).toBe('success');
      expect(exec?.timing.endTime).toBe(1500);
      expect(exec?.timing.durationMs).toBe(500);
      expect(exec?.response?.status).toBe(200);
    });
  });
});
