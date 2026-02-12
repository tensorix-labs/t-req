import type { CliRenderer } from '@opentui/core';
import { useRenderer } from '@opentui/solid';
import { createMemo, createSignal, onCleanup, Show } from 'solid-js';
import { CommandDialog } from './components/command-dialog';
import { DebugConsoleDialog } from './components/debug-console-dialog';
import { ExecutionDetailView } from './components/execution-detail';
import { ExecutionList } from './components/execution-list';
import { FileRequestPicker } from './components/file-request-picker';
import { FrameworkSelectDialog } from './components/framework-select';
import { ProfileSelectDialog } from './components/profile-select';
import { RunnerSelectDialog } from './components/runner-select';
import { ScriptOutput } from './components/script-output';
import { StreamView } from './components/stream-view';
import { Toast } from './components/toast';
import { unwrap, useDialog, useExit, useObserver, useSDK, useStore, useUpdate } from './context';
import { openInEditor } from './editor';
import {
  useExecutionDetail,
  useFlowSubscription,
  useKeyboardCommands,
  usePlugins,
  useRequestExecution,
  useScriptRunner,
  useTestRunner,
  useWorkspace
} from './hooks';
import {
  FullScreenLayout,
  HorizontalDivider,
  Panel,
  Section,
  SplitPanel,
  StatusBar,
  VerticalDivider
} from './layouts';
import { isHttpFile, isRunnableScript, isTestFile } from './store';
import type { StreamState } from './stream';
import { rgba, theme } from './theme';

export function App() {
  const sdk = useSDK();
  const observer = useObserver();
  const exit = useExit();
  const dialog = useDialog();
  const renderer = useRenderer();
  const update = useUpdate();

  // Custom hooks encapsulate business logic
  const store = useStore();
  const workspace = useWorkspace();
  const requestExecution = useRequestExecution();
  const flowSubscription = useFlowSubscription();
  const { plugins: loadedPlugins } = usePlugins();
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

  const [panelHidden, setPanelHidden] = createSignal(false);

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
    if (!firstRequest) return;

    if (firstRequest.protocol === 'sse') {
      void requestExecution.executeStreamRequest(
        filePath,
        firstRequest.index,
        firstRequest.method,
        firstRequest.url
      );
    } else {
      void requestExecution.executeRequest(filePath, firstRequest.index);
    }
  }

  // Execute a specific request by index
  function handleRequestExecute(
    filePath: string,
    requestIndex: number,
    request: { protocol?: string; method: string; url: string }
  ) {
    if (request.protocol === 'sse') {
      void requestExecution.executeStreamRequest(
        filePath,
        requestIndex,
        request.method,
        request.url
      );
    } else {
      void requestExecution.executeRequest(filePath, requestIndex);
    }
  }

  // Execute all requests in an HTTP file
  async function handleFileExecuteAll(filePath: string) {
    if (!isHttpFile(filePath)) return;
    const requests = await workspace.loadRequests(filePath);
    if (!requests || requests.length === 0) return;
    void requestExecution.executeAllRequests(filePath, requests);
  }

  // Cleanup handler
  async function cleanupAndExit() {
    requestExecution.disconnectStream();
    scriptRunner.cleanup();
    testRunner.cleanup();
    flowSubscription.cleanup();
    // Best-effort finish flow
    const flowId = observer.state.flowId;
    if (flowId) {
      try {
        await unwrap(sdk.postFlowsByFlowIdFinish({ path: { flowId } }));
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
        action: () => dialog.replace(() => <CommandDialog update={update} />)
      },
      file_picker: {
        action: () =>
          dialog.replace(() => (
            <FileRequestPicker
              onExecute={handleFileExecute}
              onExecuteAll={handleFileExecuteAll}
              onExecuteRequest={handleRequestExecute}
              loadRequests={(filePath) => workspace.loadRequests(filePath)}
            />
          ))
      },
      profile_select: {
        action: () => dialog.replace(() => <ProfileSelectDialog />)
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
      },
      run_all: {
        action: async () => {
          const selectedNode = store.selectedNode();
          if (!selectedNode || selectedNode.node.isDir) return;
          if (!isHttpFile(selectedNode.node.path)) return;
          await handleFileExecuteAll(selectedNode.node.path);
        }
      }
    },
    onCancel: () => {
      scriptRunner.cancelScript();
      testRunner.cancelTest();
    },
    onNavigateDown: () => observer.selectNextExecution(),
    onNavigateUp: () => observer.selectPreviousExecution(),
    onToggleHide: togglePanelHidden
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
        </Show>

        <Panel flexGrow={1}>
          <Show when={observer.state.streamState}>
            {(stream: () => StreamState) => (
              <StreamView
                stream={stream()}
                onDisconnect={() => requestExecution.disconnectStream()}
              />
            )}
          </Show>
          <Show when={!observer.state.streamState}>
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
                  loadedPlugins={loadedPlugins()}
                />
              )}
            </Show>
          </Show>
        </Panel>
      </SplitPanel>

      <StatusBar isRunning={isRunning()} />
      <Toast />
    </FullScreenLayout>
  );
}
