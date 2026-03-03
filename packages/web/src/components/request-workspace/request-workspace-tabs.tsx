import { createMemo, For, Match, Show, Switch } from 'solid-js';
import type { WorkspaceRequest } from '../../sdk';
import type {
  RequestBodyField,
  RequestBodySummary,
  RequestDetailsRow
} from '../../utils/request-details';
import { toRequestParams } from '../../utils/request-details';
import { REQUEST_WORKSPACE_TABS, type RequestWorkspaceTabId } from './model';
import {
  RequestWorkspaceBodyPanel,
  RequestWorkspaceHeadersPanel,
  RequestWorkspaceParamsPanel
} from './request-workspace-tab-panels';

interface RequestWorkspaceTabsProps {
  activeTab: RequestWorkspaceTabId;
  onTabChange: (tab: RequestWorkspaceTabId) => void;
  selectedRequest?: WorkspaceRequest;
  requestCount: number;
  requestHeaders: RequestDetailsRow[];
  requestBodySummary: RequestBodySummary;
  requestBodyDraft: string;
  requestBodyFormDataDraft: RequestBodyField[];
  requestBodyFilePathDraft: string;
  requestDetailsLoading: boolean;
  requestDetailsError?: string;
  headerDraftDirty: boolean;
  headerDraftSaving: boolean;
  headerDraftSaveError?: string;
  onHeaderChange: (index: number, field: 'key' | 'value', value: string) => void;
  onAddHeader: () => void;
  onRemoveHeader: (index: number) => void;
  onSaveHeaders: () => void;
  onDiscardHeaders: () => void;
  bodyDraftDirty: boolean;
  bodyDraftSaving: boolean;
  bodyDraftSaveError?: string;
  bodyDraftValidationError?: string;
  bodyDraftIsJsonEditable: boolean;
  bodyDraftTemplateWarnings: string[];
  onBodyChange: (value: string) => void;
  onBodyFilePathChange: (value: string) => void;
  onBodyFormDataNameChange: (index: number, value: string) => void;
  onBodyFormDataTypeChange: (index: number, isFile: boolean) => void;
  onBodyFormDataValueChange: (index: number, value: string) => void;
  onBodyFormDataFilenameChange: (index: number, value: string) => void;
  onBodyFormDataAddField: () => void;
  onBodyFormDataRemoveField: (index: number) => void;
  onBodyPrettify: () => void;
  onBodyMinify: () => void;
  onBodyCopy: () => void;
  onSaveBody: () => void;
  onDiscardBody: () => void;
}

const TAB_LABELS: Record<RequestWorkspaceTabId, string> = {
  params: 'Params',
  headers: 'Headers',
  body: 'Body'
};

export function RequestWorkspaceTabs(props: RequestWorkspaceTabsProps) {
  const requestParams = createMemo(() => {
    const request = props.selectedRequest;
    if (!request) {
      return [];
    }
    return toRequestParams(request.url);
  });

  return (
    <section
      class="border-b border-treq-border-light dark:border-treq-dark-border-light bg-base-100/80"
      aria-label="Request workspace details"
    >
      <div class="flex items-center justify-between gap-3 px-3 pt-2">
        <p class="text-xs font-mono uppercase tracking-[0.08em] text-base-content/60">
          Request Workspace
        </p>
        <span class="badge badge-sm border-base-300 bg-base-200/70 font-mono text-[11px]">
          {props.requestCount} req
        </span>
      </div>

      <div role="tablist" class="tabs tabs-border px-3 pt-1">
        <For each={REQUEST_WORKSPACE_TABS}>
          {(tab) => (
            <button
              type="button"
              role="tab"
              class="tab tab-sm"
              aria-selected={props.activeTab === tab}
              classList={{ 'tab-active': props.activeTab === tab }}
              onClick={() => props.onTabChange(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          )}
        </For>
      </div>

      <div class="px-3 pb-3 pt-2">
        <div class="rounded-box border border-base-300 bg-base-100/70 px-3 py-2 text-sm text-base-content/75">
          <Show
            when={props.selectedRequest}
            fallback={<p>Select a request to view {TAB_LABELS[props.activeTab].toLowerCase()}.</p>}
          >
            {(request) => (
              <Switch>
                <Match when={props.activeTab === 'params'}>
                  <RequestWorkspaceParamsPanel
                    requestMethod={request().method}
                    requestParams={requestParams()}
                  />
                </Match>
                <Match when={props.activeTab === 'headers'}>
                  <Show
                    when={!props.requestDetailsLoading}
                    fallback={<p>Loading request headers…</p>}
                  >
                    <Show
                      when={!props.requestDetailsError}
                      fallback={<p>{props.requestDetailsError}</p>}
                    >
                      <RequestWorkspaceHeadersPanel
                        hasRequest={Boolean(props.selectedRequest)}
                        requestHeaders={props.requestHeaders}
                        headerDraftDirty={props.headerDraftDirty}
                        headerDraftSaving={props.headerDraftSaving}
                        headerDraftSaveError={props.headerDraftSaveError}
                        onHeaderChange={props.onHeaderChange}
                        onAddHeader={props.onAddHeader}
                        onRemoveHeader={props.onRemoveHeader}
                        onSaveHeaders={props.onSaveHeaders}
                        onDiscardHeaders={props.onDiscardHeaders}
                      />
                    </Show>
                  </Show>
                </Match>
                <Match when={props.activeTab === 'body'}>
                  <Show when={!props.requestDetailsLoading} fallback={<p>Loading request body…</p>}>
                    <Show
                      when={!props.requestDetailsError}
                      fallback={<p>{props.requestDetailsError}</p>}
                    >
                      <RequestWorkspaceBodyPanel
                        hasRequest={Boolean(props.selectedRequest)}
                        requestBodySummary={props.requestBodySummary}
                        requestBodyDraft={props.requestBodyDraft}
                        requestBodyFormDataDraft={props.requestBodyFormDataDraft}
                        requestBodyFilePathDraft={props.requestBodyFilePathDraft}
                        bodyDraftDirty={props.bodyDraftDirty}
                        bodyDraftSaving={props.bodyDraftSaving}
                        bodyDraftSaveError={props.bodyDraftSaveError}
                        bodyDraftValidationError={props.bodyDraftValidationError}
                        bodyDraftIsJsonEditable={props.bodyDraftIsJsonEditable}
                        bodyDraftTemplateWarnings={props.bodyDraftTemplateWarnings}
                        onBodyChange={props.onBodyChange}
                        onBodyFilePathChange={props.onBodyFilePathChange}
                        onBodyFormDataNameChange={props.onBodyFormDataNameChange}
                        onBodyFormDataTypeChange={props.onBodyFormDataTypeChange}
                        onBodyFormDataValueChange={props.onBodyFormDataValueChange}
                        onBodyFormDataFilenameChange={props.onBodyFormDataFilenameChange}
                        onBodyFormDataAddField={props.onBodyFormDataAddField}
                        onBodyFormDataRemoveField={props.onBodyFormDataRemoveField}
                        onBodyPrettify={props.onBodyPrettify}
                        onBodyMinify={props.onBodyMinify}
                        onBodyCopy={props.onBodyCopy}
                        onSaveBody={props.onSaveBody}
                        onDiscardBody={props.onDiscardBody}
                      />
                    </Show>
                  </Show>
                </Match>
              </Switch>
            )}
          </Show>
        </div>
      </div>
    </section>
  );
}
