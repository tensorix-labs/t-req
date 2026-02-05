import { type Component, createSignal, createEffect, on, Show, Switch, Match } from 'solid-js';
import { useWorkspace, useObserver, useScriptRunner, useTestRunner } from '../../context';
import { HttpEditor } from './HttpEditor';
import { CodeEditor } from './CodeEditor';
import { ResizableSplitPane } from './ResizableSplitPane';
import { RequestSelectorBar } from './RequestSelectorBar';
import { ExecutionDetail } from '../execution/ExecutionDetail';
import { ScriptPanel } from '../script';
import { getFileType, type FileType } from '../../utils/fileType';
import type { WorkspaceRequest } from '../../sdk';

interface EditorWithExecutionProps {
  path: string;
}

const COLLAPSE_STORAGE_KEY = 'treq:editor:resultsPanelCollapsed';

export const EditorWithExecution: Component<EditorWithExecutionProps> = (props) => {
  const workspace = useWorkspace();
  const observer = useObserver();
  const scriptRunner = useScriptRunner();
  const testRunner = useTestRunner();

  const fileType = (): FileType => getFileType(props.path);

  const loadCollapsedState = (): boolean => {
    if (typeof localStorage === 'undefined') return true;
    const stored = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    return stored === 'true';
  };

  const [selectedRequestIndex, setSelectedRequestIndex] = createSignal(0);
  const [resultsPanelCollapsed, setResultsPanelCollapsed] = createSignal(loadCollapsedState());
  const [requests, setRequests] = createSignal<WorkspaceRequest[]>([]);

  const saveCollapsedState = (collapsed: boolean) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed.toString());
    }
  };

  const toggleCollapse = () => {
    const newState = !resultsPanelCollapsed();
    setResultsPanelCollapsed(newState);
    saveCollapsedState(newState);
  };

  // Track path changes with explicit dependency and handle async properly
  createEffect(
    on(
      () => props.path,
      async (path) => {
        if (!path) {
          setRequests([]);
          return;
        }

        // Clear previous execution results when switching files
        observer.clearExecutions();

        if (getFileType(path) === 'http') {
          await workspace.loadRequests(path);
          // Only update if path hasn't changed during async operation
          if (props.path === path) {
            const fileRequests = workspace.requestsByPath()[path] ?? [];
            setRequests(fileRequests);
          }
        } else {
          setRequests([]);
          observer.clearScriptOutput();
        }

        setSelectedRequestIndex(0);
      }
    )
  );

  // Sync requests when requestsByPath changes (e.g., after file save/parse)
  createEffect(
    on(
      () => workspace.requestsByPath()[props.path],
      (fileRequests) => {
        if (getFileType(props.path) === 'http' && fileRequests) {
          setRequests(fileRequests);
        }
      }
    )
  );

  const isConnected = () => workspace.connectionStatus() === 'connected';
  const isExecuting = () => observer.state.executing;
  const hasRequests = () => requests().length > 0;

  const handleHttpExecute = async () => {
    const sdk = workspace.sdk();
    if (!sdk || !hasRequests()) return;

    if (workspace.hasUnsavedChanges(props.path)) {
      await workspace.saveFile(props.path);
      await workspace.loadRequests(props.path);
      const fileRequests = workspace.requestsByPath()[props.path] ?? [];
      setRequests(fileRequests);
    }

    const profile = workspace.activeProfile();
    await observer.execute(sdk, props.path, selectedRequestIndex(), profile);

    if (resultsPanelCollapsed()) {
      setResultsPanelCollapsed(false);
      saveCollapsedState(false);
    }
  };

  const handleScriptExecute = async () => {
    if (workspace.hasUnsavedChanges(props.path)) {
      await workspace.saveFile(props.path);
    }

    const type = fileType();
    if (type === 'test') {
      await testRunner.runTest(props.path);
    } else {
      await scriptRunner.runScript(props.path);
    }

    // Auto-expand results panel on execution
    if (resultsPanelCollapsed()) {
      setResultsPanelCollapsed(false);
      saveCollapsedState(false);
    }
  };

  const handleCancelScript = () => {
    const type = fileType();
    if (type === 'test') {
      testRunner.cancelTest();
    } else {
      scriptRunner.cancelScript();
    }
  };

  const isScriptRunning = () => {
    const type = fileType();
    if (type === 'test') return testRunner.isRunning();
    return scriptRunner.isRunning();
  };

  const selectedExecution = () => observer.selectedExecution();

  return (
    <div class="flex flex-col h-full">
      <Switch>
        {/* HTTP files: use HTTP editor with request selector */}
        <Match when={fileType() === 'http'}>
          <RequestSelectorBar
            requests={requests()}
            selectedIndex={selectedRequestIndex()}
            onSelectRequest={setSelectedRequestIndex}
            onExecute={handleHttpExecute}
            executing={isExecuting()}
            disabled={!isConnected()}
            collapsed={resultsPanelCollapsed()}
            onToggleCollapse={toggleCollapse}
          />

          <div class="flex-1 min-h-0">
            <ResizableSplitPane
              left={
                <HttpEditor path={props.path} onExecute={handleHttpExecute} />
              }
              right={
                <div class="h-full bg-treq-bg dark:bg-treq-dark-bg overflow-hidden">
                  <Show
                    when={selectedExecution()}
                    fallback={
                      <div class="flex flex-col items-center justify-center h-full text-treq-text-muted dark:text-treq-dark-text-muted">
                        <p class="text-sm">No execution results</p>
                        <p class="text-xs mt-1">Press Send or Ctrl+Enter to execute</p>
                      </div>
                    }
                  >
                    <ExecutionDetail execution={selectedExecution()!} />
                  </Show>
                </div>
              }
              collapsed={resultsPanelCollapsed()}
              onCollapseChange={setResultsPanelCollapsed}
            />
          </div>
        </Match>

        {/* Script and test files: use code editor with script panel */}
        <Match when={fileType() === 'script' || fileType() === 'test'}>
          <div class="flex-1 min-h-0">
            <ResizableSplitPane
              left={
                <CodeEditor path={props.path} onExecute={handleScriptExecute} />
              }
              right={
                <div class="h-full bg-treq-bg dark:bg-treq-dark-bg overflow-hidden p-4">
                  <ScriptPanel
                    scriptPath={props.path}
                    isRunning={isScriptRunning()}
                    onRun={handleScriptExecute}
                    onCancel={handleCancelScript}
                  />
                </div>
              }
              collapsed={resultsPanelCollapsed()}
              onCollapseChange={setResultsPanelCollapsed}
            />
          </div>
        </Match>
      </Switch>
    </div>
  );
};

export default EditorWithExecution;
