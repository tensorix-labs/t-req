import { type Component, createEffect, createSignal, on, onCleanup, Show } from 'solid-js';
import { HttpRequestEditorProvider, useConnection, useObserver, useWorkspace } from '../../context';
import { useEditorPanelState } from '../../hooks/use-editor-panel-state';
import { useHttpRequestWorkspace } from '../../hooks/use-http-request-workspace';
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
    <HttpRequestEditorProvider store={httpWorkspace}>
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
    </HttpRequestEditorProvider>
  );
};

export default HttpEditorWithExecution;
