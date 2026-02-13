import { describe, expect, test } from 'bun:test';
import { createRoot } from 'solid-js';
import type { SDK } from '../sdk';
import { createObserverStore } from '../stores/observer';
import { createRunnerLifecycle } from './createRunnerLifecycle';

function createMockSdk(onUnsubscribe?: () => void): SDK {
  return {
    createFlow: async () => ({ flowId: 'flow-1' }),
    subscribeEvents: () => {
      return () => {
        onUnsubscribe?.();
      };
    }
  } as unknown as SDK;
}

describe('createRunnerLifecycle disconnect handling', () => {
  test('does not set SSE error when disconnected between detect and start', async () => {
    const observer = createObserverStore();
    let connected = true;
    let releaseStart!: () => void;
    const startGate = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });

    const { lifecycle, dispose } = createRoot((dispose) => {
      const sdk = createMockSdk();
      return {
        lifecycle: createRunnerLifecycle({
          getSDK: () => (connected ? sdk : null),
          isConnected: () => connected,
          observer,
          detectRunners: async () => ({ detected: 'runner-1', options: [] as string[] }),
          startRun: async () => {
            await startGate;
            if (!connected) {
              throw new Error('Not connected');
            }
            return { runId: 'run-1' };
          },
          cancelRun: async () => {},
          flowLabel: 'Script'
        }),
        dispose
      };
    });

    const runPromise = lifecycle.run('script.ts');
    connected = false;
    releaseStart();
    await runPromise;

    expect(observer.state.sseStatus).toBe('idle');
    dispose();
  });

  test('returns early when disconnected before run', async () => {
    const observer = createObserverStore();
    let detectCalls = 0;

    const { lifecycle, dispose } = createRoot((dispose) => {
      const sdk = createMockSdk();
      return {
        lifecycle: createRunnerLifecycle({
          getSDK: () => sdk,
          isConnected: () => false,
          observer,
          detectRunners: async () => {
            detectCalls += 1;
            return { detected: null, options: [] as string[] };
          },
          startRun: async () => ({ runId: 'run-1' }),
          cancelRun: async () => {},
          flowLabel: 'Script'
        }),
        dispose
      };
    });

    await lifecycle.run('script.ts');

    expect(detectCalls).toBe(0);
    expect(observer.state.sseStatus).toBe('idle');
    dispose();
  });

  test('sets SSE error for real detect failure while connected', async () => {
    const observer = createObserverStore();

    const { lifecycle, dispose } = createRoot((dispose) => {
      const sdk = createMockSdk();
      return {
        lifecycle: createRunnerLifecycle({
          getSDK: () => sdk,
          isConnected: () => true,
          observer,
          detectRunners: async () => {
            throw new Error('detect failed');
          },
          startRun: async () => ({ runId: 'run-1' }),
          cancelRun: async () => {},
          flowLabel: 'Script'
        }),
        dispose
      };
    });

    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      await lifecycle.run('script.ts');
    } finally {
      console.error = originalConsoleError;
    }

    expect(observer.state.sseStatus).toBe('error');
    dispose();
  });

  test('cancel and cleanup do not throw after disconnect', async () => {
    const observer = createObserverStore();
    let connected = true;
    let unsubscribeCalls = 0;

    const { lifecycle, dispose } = createRoot((dispose) => {
      const sdk = createMockSdk(() => {
        unsubscribeCalls += 1;
      });
      return {
        lifecycle: createRunnerLifecycle({
          getSDK: () => (connected ? sdk : null),
          isConnected: () => connected,
          observer,
          detectRunners: async () => ({ detected: 'runner-1', options: [] as string[] }),
          startRun: async () => ({ runId: 'run-1' }),
          cancelRun: async () => {
            if (!connected) {
              throw new Error('Not connected');
            }
          },
          flowLabel: 'Script'
        }),
        dispose
      };
    });

    await lifecycle.run('script.ts');
    connected = false;

    await expect(lifecycle.cancel()).resolves.toBeUndefined();
    expect(observer.state.sseStatus).toBe('idle');
    expect(() => dispose()).not.toThrow();
    expect(unsubscribeCalls).toBeGreaterThan(0);
  });
});
