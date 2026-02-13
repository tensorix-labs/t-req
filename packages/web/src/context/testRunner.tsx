import { unwrap } from '@t-req/sdk/client';
import { type Accessor, createContext, type JSX, useContext } from 'solid-js';
import { createRunnerLifecycle } from '../hooks/createRunnerLifecycle';
import type { TestFrameworkOption } from '../sdk';
import { useObserver } from './index';
import { useConnection } from './sdk';

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
  const connection = useConnection();

  const lifecycle = createRunnerLifecycle<TestFrameworkOption>({
    getClient: () => connection.client,
    isConnected: () => !!connection.client,
    observer,
    detectRunners: async (path) => {
      const client = connection.client;
      if (!client) throw new Error('Not connected');
      return unwrap(client.getTestFrameworks({ query: { filePath: path } }));
    },
    startRun: async (path, frameworkId, flowId) => {
      const client = connection.client;
      if (!client) throw new Error('Not connected');
      return unwrap(client.postTest({ body: { filePath: path, frameworkId, flowId } }));
    },
    cancelRun: async (runId) => {
      const client = connection.client;
      if (!client) throw new Error('Not connected');
      await unwrap(client.deleteTestByRunId({ path: { runId } }));
    },
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

  return <TestRunnerContext.Provider value={value}>{props.children}</TestRunnerContext.Provider>;
}

export function useTestRunner(): TestRunnerContextValue {
  const ctx = useContext(TestRunnerContext);
  if (!ctx) {
    throw new Error('useTestRunner must be used within TestRunnerProvider');
  }
  return ctx;
}
