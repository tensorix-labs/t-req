import { createContext, createSignal, onCleanup, useContext, type Accessor, type JSX } from 'solid-js';
import { useObserver, useWorkspace } from './index';
import type { TestFrameworkOption, SDK } from '../sdk';

export interface TestRunnerContextValue {
  runTest: (testPath: string) => Promise<void>;
  cancelTest: () => void;
  isRunning: Accessor<boolean>;
  // Dialog state
  dialogOpen: Accessor<boolean>;
  dialogTestPath: Accessor<string>;
  dialogOptions: Accessor<TestFrameworkOption[]>;
  handleFrameworkSelect: (frameworkId: string) => void;
  handleDialogClose: () => void;
}

const TestRunnerContext = createContext<TestRunnerContextValue>();

export function TestRunnerProvider(props: { children: JSX.Element }) {
  const workspace = useWorkspace();
  const observer = useObserver();

  let currentRunId: string | undefined;
  let sseUnsubscribe: (() => void) | undefined;

  const [isStarting, setIsStarting] = createSignal(false);

  // Framework selection dialog state
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [dialogTestPath, setDialogTestPath] = createSignal('');
  const [dialogOptions, setDialogOptions] = createSignal<TestFrameworkOption[]>([]);
  const [dialogCallback, setDialogCallback] = createSignal<((id: string) => void) | null>(null);

  function subscribeToFlow(sdk: SDK, flowId: string) {
    if (sseUnsubscribe) {
      sseUnsubscribe();
      sseUnsubscribe = undefined;
    }

    observer.setState('flowId', flowId);
    observer.setState('sseStatus', 'connecting');

    sseUnsubscribe = sdk.subscribeEvents(
      flowId,
      (event) => {
        if (observer.state.sseStatus !== 'open') {
          observer.setState('sseStatus', 'open');
        }
        observer.handleSSEEvent(event);
      },
      (error) => {
        console.error('SSE error:', error);
        observer.setState('sseStatus', 'error');
      },
      () => {
        observer.setState('sseStatus', 'closed');
      }
    );
  }

  async function startTest(testPath: string, frameworkId?: string) {
    const sdk = workspace.sdk();
    if (!sdk) return;

    let flowId: string | undefined;
    try {
      const createdFlow = await sdk.createFlow(`Test: ${testPath}`);
      flowId = createdFlow.flowId;

      subscribeToFlow(sdk, flowId);

      const { runId } = await sdk.runTest(testPath, frameworkId, flowId);
      currentRunId = runId;

      if (!observer.state.runningScript) {
        observer.setState('runningScript', {
          path: testPath,
          pid: 0,
          startedAt: Date.now()
        });
      }
    } catch (err) {
      console.error('Failed to start test:', err);
      if (flowId) {
        if (sseUnsubscribe) {
          sseUnsubscribe();
          sseUnsubscribe = undefined;
        }
        observer.setState('flowId', undefined);
      }
      observer.setState('sseStatus', 'error');
      currentRunId = undefined;
    }
  }

  async function runTest(testPath: string) {
    const sdk = workspace.sdk();
    if (!sdk) return;

    if (observer.state.runningScript || isStarting()) {
      return;
    }

    setIsStarting(true);
    observer.clearScriptOutput();

    try {
      const { detected, options: frameworkOptions } = await sdk.getTestFrameworks(testPath);

      if (detected) {
        await startTest(testPath, detected);
      } else {
        setDialogTestPath(testPath);
        setDialogOptions(frameworkOptions);
        setDialogCallback(() => (selectedFrameworkId: string) => {
          void startTest(testPath, selectedFrameworkId);
        });
        setDialogOpen(true);
      }
    } catch (err) {
      console.error('Failed to get test frameworks:', err);
      observer.setState('sseStatus', 'error');
    } finally {
      setIsStarting(false);
    }
  }

  async function cancelTest() {
    const sdk = workspace.sdk();
    if (currentRunId && sdk) {
      try {
        await sdk.cancelTest(currentRunId);
      } catch {
        // Test may have already finished
      }
      currentRunId = undefined;
    }
    setIsStarting(false);
    if (sseUnsubscribe) {
      sseUnsubscribe();
      sseUnsubscribe = undefined;
    }
  }

  function handleFrameworkSelect(frameworkId: string) {
    const callback = dialogCallback();
    if (callback) {
      callback(frameworkId);
    }
    setDialogOpen(false);
    setDialogCallback(null);
  }

  function handleDialogClose() {
    setDialogOpen(false);
    setDialogCallback(null);
  }

  function cleanup() {
    const sdk = workspace.sdk();
    if (currentRunId && sdk) {
      sdk.cancelTest(currentRunId).catch(() => {});
      currentRunId = undefined;
    }
    if (sseUnsubscribe) {
      sseUnsubscribe();
      sseUnsubscribe = undefined;
    }
    setIsStarting(false);
  }

  onCleanup(cleanup);

  const value: TestRunnerContextValue = {
    runTest,
    cancelTest,
    isRunning: () => isStarting() || !!observer.state.runningScript,
    dialogOpen,
    dialogTestPath,
    dialogOptions,
    handleFrameworkSelect,
    handleDialogClose
  };

  return (
    <TestRunnerContext.Provider value={value}>
      {props.children}
    </TestRunnerContext.Provider>
  );
}

export function useTestRunner(): TestRunnerContextValue {
  const ctx = useContext(TestRunnerContext);
  if (!ctx) {
    throw new Error('useTestRunner must be used within TestRunnerProvider');
  }
  return ctx;
}
