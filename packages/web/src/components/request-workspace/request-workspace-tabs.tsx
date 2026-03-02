import { createMemo, For, Match, Show, Switch } from 'solid-js';
import type { WorkspaceRequest } from '../../sdk';
import type { RequestBodySummary, RequestDetailsRow } from '../../utils/request-details';
import { toRequestParams } from '../../utils/request-details';
import { REQUEST_WORKSPACE_TABS, type RequestWorkspaceTabId } from './model';

interface RequestWorkspaceTabsProps {
  activeTab: RequestWorkspaceTabId;
  onTabChange: (tab: RequestWorkspaceTabId) => void;
  selectedRequest?: WorkspaceRequest;
  requestCount: number;
  requestHeaders: RequestDetailsRow[];
  requestBodySummary: RequestBodySummary;
  requestDetailsLoading: boolean;
  requestDetailsError?: string;
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
                  <Show
                    when={requestParams().length > 0}
                    fallback={
                      <p>No query params in URL for {request().method.toUpperCase()} requests.</p>
                    }
                  >
                    <div class="overflow-auto rounded-box border border-base-300 bg-base-100/80">
                      <table class="table table-xs">
                        <thead>
                          <tr>
                            <th class="font-mono uppercase tracking-[0.06em] text-[11px]">Name</th>
                            <th class="font-mono uppercase tracking-[0.06em] text-[11px]">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          <For each={requestParams()}>
                            {(param) => (
                              <tr>
                                <td class="font-mono text-xs text-base-content">{param.key}</td>
                                <td class="font-mono text-xs text-base-content/80">
                                  {param.value}
                                </td>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                    </div>
                  </Show>
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
                      <Show
                        when={props.requestHeaders.length > 0}
                        fallback={<p>No headers were parsed for this request.</p>}
                      >
                        <div class="overflow-auto rounded-box border border-base-300 bg-base-100/80">
                          <table class="table table-xs">
                            <thead>
                              <tr>
                                <th class="font-mono uppercase tracking-[0.06em] text-[11px]">
                                  Name
                                </th>
                                <th class="font-mono uppercase tracking-[0.06em] text-[11px]">
                                  Value
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              <For each={props.requestHeaders}>
                                {(header) => (
                                  <tr>
                                    <td class="font-mono text-xs text-base-content">
                                      {header.key}
                                    </td>
                                    <td class="font-mono text-xs text-base-content/80">
                                      {header.value}
                                    </td>
                                  </tr>
                                )}
                              </For>
                            </tbody>
                          </table>
                        </div>
                      </Show>
                    </Show>
                  </Show>
                </Match>
                <Match when={props.activeTab === 'body'}>
                  <Show when={!props.requestDetailsLoading} fallback={<p>Loading request body…</p>}>
                    <Show
                      when={!props.requestDetailsError}
                      fallback={<p>{props.requestDetailsError}</p>}
                    >
                      <div class="space-y-2">
                        <p>{props.requestBodySummary.description}</p>

                        <Switch>
                          <Match
                            when={
                              props.requestBodySummary.kind === 'inline' &&
                              props.requestBodySummary.text !== undefined
                            }
                          >
                            <pre class="max-h-52 overflow-auto rounded-box border border-base-300 bg-base-100/80 p-2 font-mono text-xs text-base-content">
                              {props.requestBodySummary.text}
                            </pre>
                          </Match>

                          <Match when={props.requestBodySummary.kind === 'form-data'}>
                            <Show
                              when={(props.requestBodySummary.fields?.length ?? 0) > 0}
                              fallback={<p>No form-data fields were parsed.</p>}
                            >
                              <div class="overflow-auto rounded-box border border-base-300 bg-base-100/80">
                                <table class="table table-xs">
                                  <thead>
                                    <tr>
                                      <th class="font-mono uppercase tracking-[0.06em] text-[11px]">
                                        Name
                                      </th>
                                      <th class="font-mono uppercase tracking-[0.06em] text-[11px]">
                                        Type
                                      </th>
                                      <th class="font-mono uppercase tracking-[0.06em] text-[11px]">
                                        Value
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <For each={props.requestBodySummary.fields}>
                                      {(field) => (
                                        <tr>
                                          <td class="font-mono text-xs text-base-content">
                                            {field.name}
                                          </td>
                                          <td class="font-mono text-xs text-base-content/80">
                                            {field.isFile ? 'file' : 'text'}
                                          </td>
                                          <td class="font-mono text-xs text-base-content/80">
                                            {field.isFile
                                              ? (field.path ?? field.filename ?? field.value)
                                              : field.value}
                                          </td>
                                        </tr>
                                      )}
                                    </For>
                                  </tbody>
                                </table>
                              </div>
                            </Show>
                          </Match>

                          <Match when={props.requestBodySummary.kind === 'file'}>
                            <Show
                              when={props.requestBodySummary.filePath}
                              fallback={<p>No request body file path was parsed.</p>}
                            >
                              {(filePath) => (
                                <div class="rounded-box border border-base-300 bg-base-100/80 p-2">
                                  <p class="font-mono text-xs text-base-content/80">{filePath()}</p>
                                </div>
                              )}
                            </Show>
                          </Match>
                        </Switch>
                      </div>
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
