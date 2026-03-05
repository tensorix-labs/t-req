import { createMemo, For, Match, Show, Switch } from 'solid-js';
import { useHttpRequestEditor } from '../../context';
import type { WorkspaceRequest } from '../../sdk';
import { REQUEST_WORKSPACE_TABS, type RequestWorkspaceTabId } from './model';
import {
  RequestWorkspaceBodyPanel,
  RequestWorkspaceHeadersPanel,
  RequestWorkspaceParamsPanel
} from './request-workspace-tab-panels';

interface RequestWorkspaceTabsProps {
  activeTab: RequestWorkspaceTabId;
  onTabChange: (tab: RequestWorkspaceTabId) => void;
}

const TAB_LABELS: Record<RequestWorkspaceTabId, string> = {
  params: 'Params',
  headers: 'Headers',
  body: 'Body'
};

export function RequestWorkspaceTabs(props: RequestWorkspaceTabsProps) {
  const httpWorkspace = useHttpRequestEditor();

  const selectedRequest = createMemo((): WorkspaceRequest | undefined =>
    httpWorkspace.selection.selected()
  );
  const requestCount = (): number => httpWorkspace.requests.count();

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
          {requestCount()} req
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
            when={selectedRequest()}
            fallback={<p>Select a request to view {TAB_LABELS[props.activeTab].toLowerCase()}.</p>}
          >
            {(request) => (
              <Switch>
                <Match when={props.activeTab === 'params'}>
                  <Show
                    when={!httpWorkspace.drafts.parse.loading()}
                    fallback={<p>Loading request params…</p>}
                  >
                    <Show
                      when={!httpWorkspace.drafts.parse.error()}
                      fallback={<p>{httpWorkspace.drafts.parse.error()}</p>}
                    >
                      <RequestWorkspaceParamsPanel
                        hasRequest={Boolean(selectedRequest())}
                        requestMethod={request().method}
                        requestParams={httpWorkspace.drafts.param.draftParams()}
                        paramDraftDirty={httpWorkspace.drafts.param.isDirty()}
                        paramDraftSaving={httpWorkspace.drafts.param.isSaving()}
                        paramDraftSaveError={httpWorkspace.drafts.param.saveError()}
                        onParamChange={httpWorkspace.drafts.param.onParamChange}
                        onAddParam={httpWorkspace.drafts.param.onAddParam}
                        onRemoveParam={httpWorkspace.drafts.param.onRemoveParam}
                        onSaveParams={httpWorkspace.drafts.param.onSave}
                        onDiscardParams={httpWorkspace.drafts.param.onDiscard}
                      />
                    </Show>
                  </Show>
                </Match>
                <Match when={props.activeTab === 'headers'}>
                  <Show
                    when={!httpWorkspace.drafts.parse.loading()}
                    fallback={<p>Loading request headers…</p>}
                  >
                    <Show
                      when={!httpWorkspace.drafts.parse.error()}
                      fallback={<p>{httpWorkspace.drafts.parse.error()}</p>}
                    >
                      <RequestWorkspaceHeadersPanel
                        hasRequest={Boolean(selectedRequest())}
                        requestHeaders={httpWorkspace.drafts.header.draftHeaders()}
                        headerDraftDirty={httpWorkspace.drafts.header.isDirty()}
                        headerDraftSaving={httpWorkspace.drafts.header.isSaving()}
                        headerDraftSaveError={httpWorkspace.drafts.header.saveError()}
                        onHeaderChange={httpWorkspace.drafts.header.onHeaderChange}
                        onAddHeader={httpWorkspace.drafts.header.onAddHeader}
                        onRemoveHeader={httpWorkspace.drafts.header.onRemoveHeader}
                        onSaveHeaders={httpWorkspace.drafts.header.onSave}
                        onDiscardHeaders={httpWorkspace.drafts.header.onDiscard}
                      />
                    </Show>
                  </Show>
                </Match>
                <Match when={props.activeTab === 'body'}>
                  <Show
                    when={!httpWorkspace.drafts.parse.loading()}
                    fallback={<p>Loading request body…</p>}
                  >
                    <Show
                      when={!httpWorkspace.drafts.parse.error()}
                      fallback={<p>{httpWorkspace.drafts.parse.error()}</p>}
                    >
                      <RequestWorkspaceBodyPanel
                        hasRequest={Boolean(selectedRequest())}
                        requestBodySummary={httpWorkspace.drafts.parse.bodySummary()}
                        requestBodyDraft={httpWorkspace.drafts.body.draftBody()}
                        requestBodyFormDataDraft={httpWorkspace.drafts.body.draftFormData()}
                        requestBodyFilePathDraft={httpWorkspace.drafts.body.draftFilePath()}
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
                        onBodyFormDataFilenameChange={
                          httpWorkspace.drafts.body.onFormDataFilenameChange
                        }
                        onBodyFormDataAddField={httpWorkspace.drafts.body.onAddFormDataField}
                        onBodyFormDataRemoveField={httpWorkspace.drafts.body.onRemoveFormDataField}
                        onBodyPrettify={httpWorkspace.drafts.body.onBodyPrettify}
                        onBodyMinify={httpWorkspace.drafts.body.onBodyMinify}
                        onBodyCopy={() => void httpWorkspace.drafts.body.onBodyCopy()}
                        onSaveBody={httpWorkspace.drafts.body.onSave}
                        onDiscardBody={httpWorkspace.drafts.body.onDiscard}
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
