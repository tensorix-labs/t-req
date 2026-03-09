import type { CliRenderer } from '@opentui/core';
import { useRenderer } from '@opentui/solid';
import { createMemo, createSignal, onCleanup, Show } from 'solid-js';
import { CommandDialog } from './components/command-dialog';
import { DebugConsoleDialog } from './components/debug-console-dialog';
import { ExecutionDetailView } from './components/execution-detail';
import { ExecutionList } from './components/execution-list';
import { FileRequestPicker } from './components/file-request-picker';
import { FileTree } from './components/file-tree';
import { FrameworkSelectDialog } from './components/framework-select';
import { HeaderBar } from './components/header-bar';
import { ProfileSelectDialog } from './components/profile-select';
import { RunnerSelectDialog } from './components/runner-select';
import { StreamView } from './components/stream-view';
import { type LeftPanelTab, TabbedPanel } from './components/tabbed-panel';
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
  Panel,
  Section,
  SplitPanel,
  StatusBar,
  VerticalDivider
} from './layouts';
import { isHttpFile, isRunnableScript, isTestFile } from './store';
import type { StreamState } from './stream';
import { resolveLeftPanelEnterAction } from './util/left-panel-enter-action';

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
  const [activeLeftTab, setActiveLeftTab] = createSignal<LeftPanelTab>('files');

  // Ctrl+H toggles panel visibility
  const togglePanelHidden = () => {
    setPanelHidden((hidden) => !hidden);
  };

  const cycleLeftTab = () => {
    setActiveLeftTab((tab) => (tab === 'files' ? 'executions' : 'files'));
  };

  // Derived state
  const isRunning = createMemo(() => !!observer.state.runningScript);
  const executionsCount = createMemo(() => observer.executionsList().length);

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

  function navigateLeftPanelDown() {
    if (activeLeftTab() === 'files') {
      store.selectNext();
      return;
    }
    observer.selectNextExecution();
  }

  function navigateLeftPanelUp() {
    if (activeLeftTab() === 'files') {
      store.selectPrevious();
      return;
    }
    observer.selectPreviousExecution();
  }

  function executeActiveLeftSelection() {
    const selectedNode = store.selectedNode();

    const action = resolveLeftPanelEnterAction(activeLeftTab(), selectedNode?.node.isDir);
    if (!selectedNode || action === 'none') return false;

    if (action === 'toggle-directory') {
      store.toggleDir(selectedNode.node.path);
      return true;
    }

    handleFileExecute(selectedNode.node.path);
    return true;
  }

  function toggleActiveDirectory() {
    if (activeLeftTab() !== 'files') return false;

    const selectedNode = store.selectedNode();
    if (!selectedNode || !selectedNode.node.isDir) return false;

    store.toggleDir(selectedNode.node.path);
    return true;
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
    onCycleTab: cycleLeftTab,
    onNavigateDown: navigateLeftPanelDown,
    onNavigateUp: navigateLeftPanelUp,
    onEnter: executeActiveLeftSelection,
    onSpace: toggleActiveDirectory,
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
      <HeaderBar />
      <SplitPanel>
        <Show when={!panelHidden()}>
          <Panel width="40%">
            <Section flexGrow={1}>
              <TabbedPanel
                activeTab={activeLeftTab()}
                executionsCount={executionsCount()}
                filesContent={
                  <FileTree
                    nodes={store.flattenedVisible()}
                    selectedIndex={store.selectedIndex()}
                    onSelect={(index) => store.setSelectedIndex(index)}
                    onToggle={(path) => store.toggleDir(path)}
                  />
                }
                executionsContent={
                  <ExecutionList
                    executions={observer.executionsList()}
                    selectedId={observer.state.selectedReqExecId}
                    onSelect={(id) => observer.setState('selectedReqExecId', id)}
                    isRunning={isRunning()}
                  />
                }
              />
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
            <ExecutionDetailView
              execution={executionDetail()}
              isLoading={loadingDetail()}
              loadedPlugins={loadedPlugins()}
              stdoutLines={observer.state.stdoutLines}
              stderrLines={observer.state.stderrLines}
              exitCode={observer.state.exitCode}
              isRunning={isRunning()}
              scriptPath={observer.state.runningScript?.path}
            />
          </Show>
        </Panel>
      </SplitPanel>

      <StatusBar isRunning={isRunning()} />
      <Toast />
    </FullScreenLayout>
  );
}
