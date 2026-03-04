import { type Component, createEffect, createSignal, on, onCleanup, Show } from 'solid-js';
import { useConnection, useObserver, useWorkspace } from '../../context';
import { useEditorPanelState } from '../../hooks/useEditorPanelState';
import { useHttpRequestWorkspace } from '../../hooks/useHttpRequestWorkspace';
import { ExecutionDetail } from '../execution/ExecutionDetail';
import {
  DEFAULT_REQUEST_WORKSPACE_TAB,
  type RequestWorkspaceTabId,
  RequestWorkspaceTabs
} from '../request-workspace';
import { RequestSelectorBar } from './RequestSelectorBar';
import { ResizableSplitPane } from './ResizableSplitPane';

interface HttpEditorWithExecutionProps {
  path: string;
}

export const HttpEditorWithExecution: Component<HttpEditorWithExecutionProps> = (props) => {
  const workspace = useWorkspace();
  const observer = useObserver();
  const connection = useConnection();
  const panelState = useEditorPanelState();
  const httpWorkspace = useHttpRequestWorkspace({
    path: () => props.path,
    client: () => connection.client,
    workspace
  });

  const [activeRequestTab, setActiveRequestTab] = createSignal<RequestWorkspaceTabId>(
    DEFAULT_REQUEST_WORKSPACE_TAB
  );

  // Reset execution state on path changes and trigger request loading
  createEffect(
    on(
      () => props.path,
      (path) => {
        observer.clearExecutions();
        httpWorkspace.actions.reset();
        setActiveRequestTab(DEFAULT_REQUEST_WORKSPACE_TAB);

        if (path) {
          void workspace.loadRequests(path);
        }
      }
    )
  );

  const isConnected = () => workspace.connectionStatus() === 'connected';
  const isExecuting = () => observer.state.executing;
  const hasRequests = () => httpWorkspace.requests.hasRequests();
  const selectedExecution = () => observer.selectedExecution();

  const handleHttpExecute = async () => {
    if (!connection.client || !hasRequests()) return;

    if (workspace.hasUnsavedChanges(props.path)) {
      await workspace.saveFile(props.path);
      await workspace.loadRequests(props.path);
    }

    const profile = workspace.activeProfile();
    await observer.execute(connection.client, props.path, httpWorkspace.selection.index(), profile);

    if (panelState.collapsed()) {
      panelState.setCollapsed(false);
    }
  };

  const handleHttpSave = async () => {
    if (activeRequestTab() === 'headers' && httpWorkspace.drafts.header.isDirty()) {
      await httpWorkspace.drafts.header.onSave();
      return;
    }

    if (activeRequestTab() === 'body' && httpWorkspace.drafts.body.isDirty()) {
      await httpWorkspace.drafts.body.onSave();
      return;
    }

    if (workspace.hasUnsavedChanges(props.path)) {
      await workspace.saveFile(props.path);
      await workspace.loadRequests(props.path);
    }
  };

  createEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        !(event.ctrlKey || event.metaKey) ||
        event.shiftKey
      ) {
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        void handleHttpExecute();
        return;
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        void handleHttpSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    onCleanup(() => {
      window.removeEventListener('keydown', handleKeyDown);
    });
  });

  return (
    <>
      <RequestSelectorBar
        requests={httpWorkspace.requests.all()}
        selectedIndex={httpWorkspace.selection.index()}
        onSelectRequest={httpWorkspace.selection.setIndex}
        onExecute={handleHttpExecute}
        executing={isExecuting()}
        disabled={!isConnected()}
        collapsed={panelState.collapsed()}
        onToggleCollapse={panelState.toggle}
      />

      <div class="flex-1 min-h-0">
        <ResizableSplitPane
          left={
            <div class="h-full min-h-0 overflow-auto">
              <RequestWorkspaceTabs
                activeTab={activeRequestTab()}
                onTabChange={setActiveRequestTab}
                selectedRequest={httpWorkspace.selection.selected()}
                requestCount={httpWorkspace.requests.count()}
                requestHeaders={httpWorkspace.drafts.header.draftHeaders()}
                requestBodySummary={httpWorkspace.drafts.parse.bodySummary()}
                requestBodyDraft={httpWorkspace.drafts.body.draftBody()}
                requestBodyFormDataDraft={httpWorkspace.drafts.body.draftFormData()}
                requestBodyFilePathDraft={httpWorkspace.drafts.body.draftFilePath()}
                requestDetailsLoading={httpWorkspace.drafts.parse.loading()}
                requestDetailsError={httpWorkspace.drafts.parse.error()}
                headerDraftDirty={httpWorkspace.drafts.header.isDirty()}
                headerDraftSaving={httpWorkspace.drafts.header.isSaving()}
                headerDraftSaveError={httpWorkspace.drafts.header.saveError()}
                onHeaderChange={httpWorkspace.drafts.header.onHeaderChange}
                onAddHeader={httpWorkspace.drafts.header.onAddHeader}
                onRemoveHeader={httpWorkspace.drafts.header.onRemoveHeader}
                onSaveHeaders={httpWorkspace.drafts.header.onSave}
                onDiscardHeaders={httpWorkspace.drafts.header.onDiscard}
                bodyDraftDirty={httpWorkspace.drafts.body.isDirty()}
                bodyDraftSaving={httpWorkspace.drafts.body.isSaving()}
                bodyDraftSaveError={httpWorkspace.drafts.body.saveError()}
                bodyDraftValidationError={httpWorkspace.drafts.body.validationError()}
                bodyDraftIsJsonEditable={httpWorkspace.drafts.body.isJsonBody()}
                bodyDraftTemplateWarnings={httpWorkspace.drafts.body.templateWarnings()}
                onBodyChange={httpWorkspace.drafts.body.onBodyChange}
                onBodyFilePathChange={httpWorkspace.drafts.body.onFilePathChange}
                onBodyFormDataNameChange={httpWorkspace.drafts.body.onFormDataNameChange}
                onBodyFormDataTypeChange={httpWorkspace.drafts.body.onFormDataTypeChange}
                onBodyFormDataValueChange={httpWorkspace.drafts.body.onFormDataValueChange}
                onBodyFormDataFilenameChange={httpWorkspace.drafts.body.onFormDataFilenameChange}
                onBodyFormDataAddField={httpWorkspace.drafts.body.onAddFormDataField}
                onBodyFormDataRemoveField={httpWorkspace.drafts.body.onRemoveFormDataField}
                onBodyPrettify={httpWorkspace.drafts.body.onBodyPrettify}
                onBodyMinify={httpWorkspace.drafts.body.onBodyMinify}
                onBodyCopy={() => void httpWorkspace.drafts.body.onBodyCopy()}
                onSaveBody={httpWorkspace.drafts.body.onSave}
                onDiscardBody={httpWorkspace.drafts.body.onDiscard}
              />
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
          collapsed={panelState.collapsed()}
          onCollapseChange={panelState.setCollapsed}
        />
      </div>
    </>
  );
};

export default HttpEditorWithExecution;
