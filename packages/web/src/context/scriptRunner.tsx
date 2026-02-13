import { unwrap } from '@t-req/sdk/client';
import { type Accessor, createContext, type JSX, useContext } from 'solid-js';
import { createRunnerLifecycle } from '../hooks/createRunnerLifecycle';
import type { RunnerOption } from '../sdk';
import { useObserver } from './index';
import { useConnection } from './sdk';

export interface ScriptRunnerContextValue {
  runScript: (scriptPath: string) => Promise<void>;
  cancelScript: () => void;
  isRunning: Accessor<boolean>;
  // Dialog state
  dialogOpen: Accessor<boolean>;
  dialogScriptPath: Accessor<string>;
  dialogOptions: Accessor<RunnerOption[]>;
  handleRunnerSelect: (runnerId: string) => void;
  handleDialogClose: () => void;
}

const ScriptRunnerContext = createContext<ScriptRunnerContextValue>();

export function ScriptRunnerProvider(props: { children: JSX.Element }) {
  const observer = useObserver();
  const connection = useConnection();

  const lifecycle = createRunnerLifecycle<RunnerOption>({
    getSDK: () => connection.sdk,
    isConnected: () => !!connection.sdk && !!connection.client,
    observer,
    detectRunners: async (path) => {
      const client = connection.client;
      if (!client) throw new Error('Not connected');
      return unwrap(client.getScriptRunners({ query: { filePath: path } }));
    },
    startRun: async (path, runnerId, flowId) => {
      const client = connection.client;
      if (!client) throw new Error('Not connected');
      return unwrap(client.postScript({ body: { filePath: path, runnerId, flowId } }));
    },
    cancelRun: async (runId) => {
      const client = connection.client;
      if (!client) throw new Error('Not connected');
      await unwrap(client.deleteScriptByRunId({ path: { runId } }));
    },
    flowLabel: 'Script'
  });

  const value: ScriptRunnerContextValue = {
    runScript: lifecycle.run,
    cancelScript: lifecycle.cancel,
    isRunning: lifecycle.isRunning,
    dialogOpen: lifecycle.dialogOpen,
    dialogScriptPath: lifecycle.dialogPath,
    dialogOptions: lifecycle.dialogOptions,
    handleRunnerSelect: lifecycle.handleSelect,
    handleDialogClose: lifecycle.handleDialogClose
  };

  return (
    <ScriptRunnerContext.Provider value={value}>{props.children}</ScriptRunnerContext.Provider>
  );
}

export function useScriptRunner(): ScriptRunnerContextValue {
  const ctx = useContext(ScriptRunnerContext);
  if (!ctx) {
    throw new Error('useScriptRunner must be used within ScriptRunnerProvider');
  }
  return ctx;
}
