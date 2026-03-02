import { For, Match, Show, Switch } from 'solid-js';
import type { WorkspaceRequest } from '../../sdk';
import { REQUEST_WORKSPACE_TABS, type RequestWorkspaceTabId } from './model';

interface RequestWorkspaceTabsProps {
  activeTab: RequestWorkspaceTabId;
  onTabChange: (tab: RequestWorkspaceTabId) => void;
  selectedRequest?: WorkspaceRequest;
  requestCount: number;
}

const TAB_LABELS: Record<RequestWorkspaceTabId, string> = {
  params: 'Params',
  headers: 'Headers',
  body: 'Body'
};

export function RequestWorkspaceTabs(props: RequestWorkspaceTabsProps) {
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
                  <p>Params editor wiring is next for {request().method.toUpperCase()} requests.</p>
                </Match>
                <Match when={props.activeTab === 'headers'}>
                  <p>
                    Headers editor wiring is next for {request().method.toUpperCase()} requests.
                  </p>
                </Match>
                <Match when={props.activeTab === 'body'}>
                  <p>Body editor wiring is next for {request().method.toUpperCase()} requests.</p>
                </Match>
              </Switch>
            )}
          </Show>
        </div>
      </div>
    </section>
  );
}
