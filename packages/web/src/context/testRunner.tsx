import { createContext, useContext, type Accessor, type JSX } from 'solid-js';
import { useObserver } from './index';
import { useSDK } from './sdk';
import type { TestFrameworkOption } from '../sdk';
import { createRunnerLifecycle } from '../hooks/createRunnerLifecycle';

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
  const observer = useObserver();
  const getSDK = useSDK();

  const lifecycle = createRunnerLifecycle<TestFrameworkOption>({
    getSDK,
    observer,
    detectRunners: (sdk, path) => sdk.getTestFrameworks(path),
    startRun: (sdk, path, frameworkId, flowId) => sdk.runTest(path, frameworkId, flowId),
    cancelRun: (sdk, runId) => sdk.cancelTest(runId),
    flowLabel: 'Test'
  });

  const value: TestRunnerContextValue = {
    runTest: lifecycle.run,
    cancelTest: lifecycle.cancel,
    isRunning: lifecycle.isRunning,
    dialogOpen: lifecycle.dialogOpen,
    dialogTestPath: lifecycle.dialogPath,
    dialogOptions: lifecycle.dialogOptions,
    handleFrameworkSelect: lifecycle.handleSelect,
    handleDialogClose: lifecycle.handleDialogClose
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
