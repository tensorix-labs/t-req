import type { CliRenderer } from '@opentui/core';
import { useRenderer } from '@opentui/solid';
import { createMemo, onCleanup, Show } from 'solid-js';
import { CommandDialog } from './components/command-dialog';
import { DebugConsoleDialog } from './components/debug-console-dialog';
import { ExecutionList } from './components/execution-list';
import { FileRequestPicker } from './components/file-request-picker';
import { ExecutionDetailView } from './components/execution-detail';
import { RunnerSelectDialog } from './components/runner-select';
import { ScriptOutput } from './components/script-output';
import { useDialog, useExit, useObserver, useSDK } from './context';
import { isRunnableScript, isHttpFile } from './store';
import { rgba, theme } from './theme';
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
            <Show
              when={observer.state.flowId}
              keyed
              fallback={
                <box
                  flexGrow={1}
                  flexDirection="column"
                  overflow="hidden"
                  backgroundColor={rgba(theme.backgroundPanel)}
                >
                  <box paddingLeft={2} paddingTop={1} paddingBottom={1}>
                    <text fg={rgba(theme.primary)} attributes={1}>
                      Executions
                    </text>
                  </box>
                  <box paddingLeft={2}>
                    <text fg={rgba(theme.textMuted)}>No executions yet</text>
                  </box>
                </box>
              }
            >
              {() => (
                <ExecutionList
                  executions={observer.executionsList()}
                  selectedId={observer.state.selectedReqExecId}
                  onSelect={(id) => observer.setState('selectedReqExecId', id)}
                  isRunning={isRunning()}
                />
              )}
            </Show>
          </Section>
          <HorizontalDivider />
          <Section flexGrow={1}>
            <Show
              when={observer.state.flowId}
              keyed
              fallback={
                <box
                  flexGrow={1}
                  flexDirection="column"
                  overflow="hidden"
                  backgroundColor={rgba(theme.backgroundPanel)}
                >
                  <box paddingLeft={2} paddingTop={1} paddingBottom={1}>
                    <text fg={rgba(theme.primary)} attributes={1}>
                      Output
                    </text>
                  </box>
                  <box paddingLeft={2}>
                    <text fg={rgba(theme.textMuted)}>No output yet</text>
                  </box>
                </box>
              }
            >
              {() => (
                <ScriptOutput
                  stdoutLines={observer.state.stdoutLines}
                  stderrLines={observer.state.stderrLines}
                  exitCode={observer.state.exitCode}
                  isRunning={isRunning()}
                  scriptPath={observer.state.runningScript?.path}
                />
              )}
            </Show>
          </Section>
        </Panel>

        <VerticalDivider />

        {/* Right Panel: Execution Details */}
        <Panel flexGrow={1}>
          <Show
            when={observer.state.flowId}
            keyed
            fallback={
              <box
                flexGrow={1}
                flexDirection="column"
                overflow="hidden"
                backgroundColor={rgba(theme.backgroundPanel)}
              >
                <box paddingLeft={2} paddingTop={1} paddingBottom={1}>
                  <text fg={rgba(theme.primary)} attributes={1}>
                    Details
                  </text>
                </box>
                <box paddingLeft={2}>
                  <text fg={rgba(theme.textMuted)}>Select an execution to view details</text>
                </box>
              </box>
            }
          >
            {() => (
              <ExecutionDetailView
                execution={executionDetail()}
                isLoading={loadingDetail()}
              />
            )}
          </Show>
        </Panel>
      </SplitPanel>

      <StatusBar isRunning={isRunning()} />
    </FullScreenLayout>
  );
}
