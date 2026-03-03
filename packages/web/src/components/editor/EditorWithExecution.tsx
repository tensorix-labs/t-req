import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  Match,
  on,
  Show,
  Switch
} from 'solid-js';
import {
  useConnection,
  useObserver,
  useScriptRunner,
  useTestRunner,
  useWorkspace
} from '../../context';
import type { WorkspaceRequest } from '../../sdk';
import { type FileType, getFileType } from '../../utils/fileType';
import { ExecutionDetail } from '../execution/ExecutionDetail';
import {
  DEFAULT_REQUEST_WORKSPACE_TAB,
  type RequestWorkspaceTabId,
  RequestWorkspaceTabs,
  useRequestBodyDraftController,
  useRequestHeaderDraftController,
  useRequestParseDetails
} from '../request-workspace';
import { ScriptPanel } from '../script';
import { CodeEditor } from './CodeEditor';
import { HttpEditor } from './HttpEditor';
import { RequestSelectorBar } from './RequestSelectorBar';
import { ResizableSplitPane } from './ResizableSplitPane';

interface EditorWithExecutionProps {
  path: string;
}

const COLLAPSE_STORAGE_KEY = 'treq:editor:resultsPanelCollapsed';

export const EditorWithExecution: Component<EditorWithExecutionProps> = (props) => {
  const workspace = useWorkspace();
  const observer = useObserver();
  const connection = useConnection();
  const scriptRunner = useScriptRunner();
  const testRunner = useTestRunner();

  const fileType = (): FileType => getFileType(props.path);

  const loadCollapsedState = (): boolean => {
    if (typeof localStorage === 'undefined') return true;
    const stored = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    return stored === 'true';
  };

  const [selectedRequestIndex, setSelectedRequestIndex] = createSignal(0);
  const [activeRequestTab, setActiveRequestTab] = createSignal<RequestWorkspaceTabId>(
    DEFAULT_REQUEST_WORKSPACE_TAB
  );
  const [resultsPanelCollapsed, setResultsPanelCollapsed] = createSignal(loadCollapsedState());
  const requests = createMemo<WorkspaceRequest[]>(() => {
    if (fileType() !== 'http') {
      return [];
    }
    return workspace.requestsByPath()[props.path] ?? [];
  });
  const selectedRequest = createMemo<WorkspaceRequest | undefined>(() => {
    const allRequests = requests();
    if (allRequests.length === 0) {
      return undefined;
    }
    return allRequests[selectedRequestIndex()];
  });
  const requestParseDetails = useRequestParseDetails({
    client: () => connection.client,
    path: () => props.path,
    requestIndex: () => selectedRequest()?.index
  });
  const requestHeaderDraft = useRequestHeaderDraftController({
    path: () => props.path,
    selectedRequest,
    sourceHeaders: requestParseDetails.headers,
    sourceUrl: () => selectedRequest()?.url,
    getFileContent: () => workspace.fileContents()[props.path]?.content,
    setFileContent: (content) => workspace.updateFileContent(props.path, content),
    saveFile: (path) => workspace.saveFile(path),
    reloadRequests: (path) => workspace.loadRequests(path),
    refetchRequestDetails: requestParseDetails.refetch
  });
  const requestBodyDraft = useRequestBodyDraftController({
    path: () => props.path,
    selectedRequest,
    sourceBody: requestParseDetails.bodySummary,
    requestDiagnostics: requestParseDetails.diagnostics,
    getFileContent: () => workspace.fileContents()[props.path]?.content,
    setFileContent: (content) => workspace.updateFileContent(props.path, content),
    saveFile: (path) => workspace.saveFile(path),
    reloadRequests: (path) => workspace.loadRequests(path),
    refetchRequestDetails: requestParseDetails.refetch
  });

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

  // Reset execution state on path changes and trigger request loading for HTTP files.
  createEffect(
    on(
      () => props.path,
      (path) => {
        // Clear previous execution results when switching files
        observer.clearExecutions();
        setSelectedRequestIndex(0);
        setActiveRequestTab(DEFAULT_REQUEST_WORKSPACE_TAB);

        if (!path) {
          observer.clearScriptOutput();
          return;
        }

        if (getFileType(path) === 'http') {
          void workspace.loadRequests(path);
          return;
        }

        observer.clearScriptOutput();
      }
    )
  );

  // Keep selected index valid as request lists change after edits/saves.
  createEffect(
    on(
      () => requests().length,
      (totalRequests) => {
        if (totalRequests === 0) {
          if (selectedRequestIndex() !== 0) {
            setSelectedRequestIndex(0);
          }
          return;
        }

        if (selectedRequestIndex() >= totalRequests) {
          setSelectedRequestIndex(totalRequests - 1);
        }
      }
    )
  );

  const isConnected = () => workspace.connectionStatus() === 'connected';
  const isExecuting = () => observer.state.executing;
  const hasRequests = () => requests().length > 0;

  const handleHttpExecute = async () => {
    if (!connection.client || !hasRequests()) return;

    if (workspace.hasUnsavedChanges(props.path)) {
      await workspace.saveFile(props.path);
      await workspace.loadRequests(props.path);
    }

    const profile = workspace.activeProfile();
    await observer.execute(connection.client, props.path, selectedRequestIndex(), profile);

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
                <div class="flex h-full min-h-0 flex-col">
                  <RequestWorkspaceTabs
                    activeTab={activeRequestTab()}
                    onTabChange={setActiveRequestTab}
                    selectedRequest={selectedRequest()}
                    requestCount={requests().length}
                    requestHeaders={requestHeaderDraft.draftHeaders()}
                    requestBodySummary={requestParseDetails.bodySummary()}
                    requestBodyDraft={requestBodyDraft.draftBody()}
                    requestBodyFormDataDraft={requestBodyDraft.draftFormData()}
                    requestBodyFilePathDraft={requestBodyDraft.draftFilePath()}
                    requestDetailsLoading={requestParseDetails.loading()}
                    requestDetailsError={requestParseDetails.error()}
                    headerDraftDirty={requestHeaderDraft.isDirty()}
                    headerDraftSaving={requestHeaderDraft.isSaving()}
                    headerDraftSaveError={requestHeaderDraft.saveError()}
                    onHeaderChange={requestHeaderDraft.onHeaderChange}
                    onAddHeader={requestHeaderDraft.onAddHeader}
                    onRemoveHeader={requestHeaderDraft.onRemoveHeader}
                    onSaveHeaders={requestHeaderDraft.onSave}
                    onDiscardHeaders={requestHeaderDraft.onDiscard}
                    bodyDraftDirty={requestBodyDraft.isDirty()}
                    bodyDraftSaving={requestBodyDraft.isSaving()}
                    bodyDraftSaveError={requestBodyDraft.saveError()}
                    bodyDraftValidationError={requestBodyDraft.validationError()}
                    bodyDraftIsJsonEditable={requestBodyDraft.isJsonBody()}
                    bodyDraftTemplateWarnings={requestBodyDraft.templateWarnings()}
                    onBodyChange={requestBodyDraft.onBodyChange}
                    onBodyFilePathChange={requestBodyDraft.onFilePathChange}
                    onBodyFormDataNameChange={requestBodyDraft.onFormDataNameChange}
                    onBodyFormDataTypeChange={requestBodyDraft.onFormDataTypeChange}
                    onBodyFormDataValueChange={requestBodyDraft.onFormDataValueChange}
                    onBodyFormDataFilenameChange={requestBodyDraft.onFormDataFilenameChange}
                    onBodyFormDataAddField={requestBodyDraft.onAddFormDataField}
                    onBodyFormDataRemoveField={requestBodyDraft.onRemoveFormDataField}
                    onBodyPrettify={requestBodyDraft.onBodyPrettify}
                    onBodyMinify={requestBodyDraft.onBodyMinify}
                    onBodyCopy={() => void requestBodyDraft.onBodyCopy()}
                    onSaveBody={requestBodyDraft.onSave}
                    onDiscardBody={requestBodyDraft.onDiscard}
                  />
                  <div class="flex-1 min-h-0">
                    <HttpEditor path={props.path} onExecute={handleHttpExecute} />
                  </div>
                </div>
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
                    {(execution) => <ExecutionDetail execution={execution()} />}
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
              left={<CodeEditor path={props.path} onExecute={handleScriptExecute} />}
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
