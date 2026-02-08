import { createContext, useContext, type Accessor, type JSX } from 'solid-js';
import { useObserver } from './index';
import { useSDK } from './sdk';
import type { RunnerOption } from '../sdk';
import { createRunnerLifecycle } from '../hooks/createRunnerLifecycle';

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
  const getSDK = useSDK();

  const lifecycle = createRunnerLifecycle<RunnerOption>({
    getSDK,
    observer,
    detectRunners: (sdk, path) => sdk.getRunners(path),
    startRun: (sdk, path, runnerId, flowId) => sdk.runScript(path, runnerId, flowId),
    cancelRun: (sdk, runId) => sdk.cancelScript(runId),
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
    <ScriptRunnerContext.Provider value={value}>
      {props.children}
    </ScriptRunnerContext.Provider>
  );
}

export function useScriptRunner(): ScriptRunnerContextValue {
  const ctx = useContext(ScriptRunnerContext);
  if (!ctx) {
    throw new Error('useScriptRunner must be used within ScriptRunnerProvider');
  }
  return ctx;
}
