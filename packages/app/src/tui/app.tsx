import type { CliRenderer } from '@opentui/core';
import { useRenderer } from '@opentui/solid';
import { createMemo, onCleanup } from 'solid-js';
import { CommandDialog } from './components/command-dialog';
import { DebugConsoleDialog } from './components/debug-console-dialog';
import { ExecutionList } from './components/execution-list';
import { FileRequestPicker } from './components/file-request-picker';
import { ExecutionDetailView } from './components/execution-detail';
import { RunnerSelectDialog } from './components/runner-select';
import { ScriptOutput } from './components/script-output';
import { useDialog, useExit, useObserver, useSDK } from './context';
import { isRunnableScript, isHttpFile } from './store';
import {
  useExecutionDetail,
  useFlowSubscription,
  useScriptRunner,
  useWorkspace,
  useRequestExecution,
  useKeyboardCommands
} from './hooks';
import {
  FullScreenLayout,
  SplitPanel,
  Panel,
  Section,
  HorizontalDivider,
  VerticalDivider,
  StatusBar
} from './layouts';
import { openInEditor } from './editor';

export function App() {
  const sdk = useSDK();
  const observer = useObserver();
  const exit = useExit();
  const dialog = useDialog();
  const renderer = useRenderer();

  // Custom hooks encapsulate business logic
  const workspace = useWorkspace();
  const requestExecution = useRequestExecution();
  const flowSubscription = useFlowSubscription();
  const { detail: executionDetail, isLoading: loadingDetail } = useExecutionDetail();

  const scriptRunner = useScriptRunner({
    onRunnerDialogNeeded: (scriptPath, onSelect) => {
      dialog.replace(() => (
        <RunnerSelectDialog scriptPath={scriptPath} onSelect={onSelect} />
      ));
    }
  });

  // Derived state
  const isRunning = createMemo(() => !!observer.state.runningScript);

  // File execution handler - delegates to appropriate executor
  function handleFileExecute(filePath: string) {
    if (isRunnableScript(filePath)) {
      void scriptRunner.runScript(filePath);
    } else if (isHttpFile(filePath)) {
      void executeFirstRequest(filePath);
    }
  }

  // Execute first request in an HTTP file
  async function executeFirstRequest(filePath: string) {
    const requests = await workspace.loadRequests(filePath);
    const firstRequest = requests?.[0];
    if (firstRequest) {
      void requestExecution.executeRequest(filePath, firstRequest.index);
    }
  }

  // Cleanup handler
  async function cleanupAndExit() {
    scriptRunner.cleanup();
    flowSubscription.cleanup();
    // Best-effort finish flow
    const flowId = observer.state.flowId;
    if (flowId) {
      try {
        await sdk.finishFlow(flowId);
      } catch {
        // Ignore errors
      }
    }
    void exit();
  }

  // Command registry - declarative action mapping
  useKeyboardCommands({
    commands: {
      debug_console: {
        action: () => dialog.replace(() => <DebugConsoleDialog />)
      },
      command_list: {
        action: () => dialog.replace(() => <CommandDialog />)
      },
      file_picker: {
        action: () => dialog.replace(() => (
          <FileRequestPicker
            onSelect={workspace.navigateToFile}
            onExecute={handleFileExecute}
          />
        ))
      },
      quit: {
        action: cleanupAndExit
      },
      open_in_editor: {
        action: () => {
          const detail = executionDetail();
          if (detail) {
            void openInEditor(detail, renderer as CliRenderer);
          }
        }
      }
    },
    onCancel: scriptRunner.cancelScript,
    onNavigateDown: observer.selectNextExecution,
    onNavigateUp: observer.selectPreviousExecution
  });

  // Cleanup on unmount
  onCleanup(() => {
    scriptRunner.cleanup();
    flowSubscription.cleanup();
  });

  // Render - semantic layout structure
  return (
    <FullScreenLayout>
      <SplitPanel>
        {/* Left Panel: Executions + Output */}
        <Panel width="50%">
          <Section height="50%">
            <ExecutionList
              executions={observer.executionsList()}
              selectedId={observer.state.selectedReqExecId}
              onSelect={(id) => observer.setState('selectedReqExecId', id)}
              isRunning={isRunning()}
            />
          </Section>
          <HorizontalDivider />
          <Section flexGrow={1}>
            <ScriptOutput
              stdoutLines={observer.state.stdoutLines}
              stderrLines={observer.state.stderrLines}
              exitCode={observer.state.exitCode}
              isRunning={isRunning()}
              scriptPath={observer.state.runningScript?.path}
            />
          </Section>
        </Panel>

        <VerticalDivider />

        {/* Right Panel: Execution Details */}
        <Panel flexGrow={1}>
          <ExecutionDetailView
            execution={executionDetail()}
            isLoading={loadingDetail()}
          />
        </Panel>
      </SplitPanel>

      <StatusBar isRunning={isRunning()} />
    </FullScreenLayout>
  );
}
