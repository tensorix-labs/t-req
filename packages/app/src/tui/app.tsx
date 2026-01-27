import type { CliRenderer } from '@opentui/core';
import { useRenderer } from '@opentui/solid';
import { createMemo, createSignal, Match, onCleanup, Show, Switch } from 'solid-js';
import { CommandDialog } from './components/command-dialog';
import { DebugConsoleDialog } from './components/debug-console-dialog';
import { ExecutionList } from './components/execution-list';
import { FileRequestPicker } from './components/file-request-picker';
import { FileTree } from './components/file-tree';
import { ExecutionDetailView } from './components/execution-detail';
import { FrameworkSelectDialog } from './components/framework-select';
import { RunnerSelectDialog } from './components/runner-select';
import { ScriptOutput } from './components/script-output';
import { useDialog, useExit, useObserver, useSDK, useStore } from './context';
import { isRunnableScript, isHttpFile, isTestFile } from './store';
import { rgba, theme } from './theme';
import {
  useExecutionDetail,
  useFlowSubscription,
  useScriptRunner,
  useTestRunner,
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

type LeftPanelMode = 'tree' | 'executions';

export function App() {
  const sdk = useSDK();
  const observer = useObserver();
  const exit = useExit();
  const dialog = useDialog();
  const renderer = useRenderer();
  const store = useStore();

  // Custom hooks encapsulate business logic
  const workspace = useWorkspace();
  const requestExecution = useRequestExecution();
  const flowSubscription = useFlowSubscription();
  const { detail: executionDetail, isLoading: loadingDetail } = useExecutionDetail();

  const scriptRunner = useScriptRunner({
    onRunnerDialogNeeded: (scriptPath, options, onSelect) => {
      dialog.replace(() => (
        <RunnerSelectDialog scriptPath={scriptPath} options={options} onSelect={onSelect} />
      ));
    }
  });

  const testRunner = useTestRunner({
    onFrameworkDialogNeeded: (testPath, options, onSelect) => {
      dialog.replace(() => (
        <FrameworkSelectDialog testPath={testPath} options={options} onSelect={onSelect} />
      ));
    }
  });

  // Left panel mode state
  const [leftPanelMode, setLeftPanelMode] = createSignal<LeftPanelMode>('tree');
  const [panelHidden, setPanelHidden] = createSignal(false);

  // Tab toggles between tree and executions
  const togglePanelMode = () => {
    setLeftPanelMode((mode) => (mode === 'tree' ? 'executions' : 'tree'));
  };

  // Ctrl+H toggles panel visibility
  const togglePanelHidden = () => {
    setPanelHidden((hidden) => !hidden);
  };

  // Derived state
  const isRunning = createMemo(() => !!observer.state.runningScript);

  // File execution handler - delegates to appropriate executor
  function handleFileExecute(filePath: string) {
    if (isTestFile(filePath)) {
      void testRunner.runTest(filePath);
    } else if (isRunnableScript(filePath)) {
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
    testRunner.cleanup();
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
    onCancel: () => {
      scriptRunner.cancelScript();
      testRunner.cancelTest();
    },
    onNavigateDown: () => {
      if (leftPanelMode() === 'tree') {
        store.selectNext();
      } else {
        observer.selectNextExecution();
      }
    },
    onNavigateUp: () => {
      if (leftPanelMode() === 'tree') {
        store.selectPrevious();
      } else {
        observer.selectPreviousExecution();
      }
    },
    onTabPress: togglePanelMode,
    onToggleHide: togglePanelHidden,
    onEnter: () => {
      if (leftPanelMode() === 'tree') {
        const selectedNode = store.selectedNode();
        if (selectedNode) {
          if (selectedNode.node.isDir) {
            store.toggleDir(selectedNode.node.path);
          } else {
            handleFileExecute(selectedNode.node.path);
            setLeftPanelMode('executions');
          }
        }
      }
    }
  });

  // Cleanup on unmount
  onCleanup(() => {
    scriptRunner.cleanup();
    testRunner.cleanup();
    flowSubscription.cleanup();
  });

  // Render - semantic layout structure
  return (
    <FullScreenLayout>
      <SplitPanel>
        <Show when={!panelHidden()}>
          <Panel width="40%">
            <Switch>
              <Match when={leftPanelMode() === 'tree'}>
                <FileTree
                  nodes={store.flattenedVisible()}
                  selectedIndex={store.selectedIndex()}
                  onSelect={store.setSelectedIndex}
                  onToggle={store.toggleDir}
                />
              </Match>
              <Match when={leftPanelMode() === 'executions'}>
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
              </Match>
            </Switch>
          </Panel>
          <VerticalDivider />
        </Show>

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
