import type { PostExecuteResponses } from '@t-req/sdk/client';
import { type ComponentProps, Show } from 'solid-js';
import { ChevronRightIcon } from '../icons';
import { EmptyRequestWorkspace } from './EmptyRequestWorkspace';
import { RequestDetailsPanel } from './RequestDetailsPanel';
import { RequestUrlBar } from './RequestUrlBar';
import { ResponseBodyPanel } from './ResponseBodyPanel';

type RequestWorkspacePanelProps = {
  isSidebarCollapsed: boolean;
  onToggleSidebarCollapsed: () => void;
  selectedPath?: string;
  selectedRequestCount: number;
  fileLoadError?: string;
  isFileLoading: boolean;
  requestsLoadError?: string;
  isRequestsLoading: boolean;
  unsupportedProtocolLabel?: string;
  urlBarProps: ComponentProps<typeof RequestUrlBar>;
  requestDetailsProps: ComponentProps<typeof RequestDetailsPanel>;
  requestPanelsStyle: Record<string, string>;
  isResponseCollapsed: boolean;
  onExpandResponsePanel: () => void;
  onCollapseResponsePanel: () => void;
  response?: PostExecuteResponses[200]['response'];
  responseDurationMs?: number;
  isSending: boolean;
  executionError?: string;
};

export function RequestWorkspacePanel(props: RequestWorkspacePanelProps) {
  return (
    <section
      class="min-w-0 min-h-0 flex flex-col overflow-hidden border border-base-300 rounded-tr-[14px] bg-[linear-gradient(180deg,_var(--app-pane-gradient-start)_0%,_var(--app-pane-gradient-end)_100%)] [box-shadow:var(--app-pane-shadow-top),_var(--app-pane-shadow-drop)] max-[960px]:rounded-tr-none"
      aria-label="Request workspace"
    >
      <header class="flex min-h-[42px] items-center justify-between gap-2 border-b border-base-300 px-3.5">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="btn btn-ghost btn-xs btn-square h-7 min-h-7 text-base-content/70 hover:text-base-content"
            onClick={props.onToggleSidebarCollapsed}
            aria-label={
              props.isSidebarCollapsed ? 'Expand workspace files' : 'Collapse workspace files'
            }
            title={props.isSidebarCollapsed ? 'Expand workspace files' : 'Collapse workspace files'}
          >
            <ChevronRightIcon class={props.isSidebarCollapsed ? 'size-3' : 'size-3 rotate-180'} />
          </button>
          <h2 class="m-0 font-mono text-[0.9rem] font-semibold tracking-[0.015em] text-base-content">
            Request Workspace
          </h2>
        </div>
        <div class="flex items-center gap-2">
          <Show when={props.selectedPath}>
            {(path) => (
              <span
                class="max-w-[320px] truncate font-mono text-[12px] text-base-content/65"
                title={path()}
              >
                {path()}
              </span>
            )}
          </Show>
          <Show when={props.selectedPath}>
            <span class="badge badge-sm border-base-300 bg-base-300/60 px-2 font-mono text-[11px] text-base-content/80">
              {props.selectedRequestCount} req
            </span>
          </Show>
        </div>
      </header>
      <Show when={props.selectedPath} fallback={<EmptyRequestWorkspace />}>
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Show when={props.fileLoadError}>
            {(message) => (
              <div
                class="alert alert-error mx-3 mt-3 border border-error/50 bg-error/20 text-error-content"
                role="alert"
              >
                <span class="text-sm">{message()}</span>
              </div>
            )}
          </Show>

          <Show when={props.isFileLoading}>
            <div class="alert mx-3 mt-3 border border-base-300 bg-base-200/70 text-base-content">
              <span class="text-sm">Loading request content…</span>
            </div>
          </Show>

          <Show when={props.requestsLoadError}>
            {(message) => (
              <div
                class="alert alert-error mx-3 mt-3 border border-error/50 bg-error/20 text-error-content"
                role="alert"
              >
                <span class="text-sm">{message()}</span>
              </div>
            )}
          </Show>

          <Show when={props.isRequestsLoading}>
            <div class="alert mx-3 mt-3 border border-base-300 bg-base-200/70 text-base-content">
              <span class="text-sm">Loading requests in selected file…</span>
            </div>
          </Show>

          <Show when={props.unsupportedProtocolLabel}>
            {(protocol) => (
              <div class="alert mx-3 mt-3 border border-base-300 bg-base-200/70 text-base-content">
                <span class="text-sm">{protocol()} execution wiring is coming next.</span>
              </div>
            )}
          </Show>

          <RequestUrlBar {...props.urlBarProps} />

          <div
            class="grid min-h-0 min-w-0 flex-1 overflow-hidden grid-cols-[var(--request-panels-cols)] gap-0"
            style={props.requestPanelsStyle}
          >
            <RequestDetailsPanel {...props.requestDetailsProps} />
            <Show
              when={!props.isResponseCollapsed}
              fallback={
                <aside class="min-h-0 bg-base-200/10 px-1 py-2">
                  <div class="flex h-full flex-col items-center gap-3">
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs btn-square h-7 min-h-7 text-base-content/70 hover:text-base-content"
                      onClick={props.onExpandResponsePanel}
                      aria-label="Expand response panel"
                      title="Expand response panel"
                    >
                      <ChevronRightIcon class="size-3 rotate-180" />
                    </button>
                    <span class="[writing-mode:vertical-rl] text-[11px] font-mono uppercase tracking-[0.08em] text-base-content/55">
                      Response
                    </span>
                  </div>
                </aside>
              }
            >
              <ResponseBodyPanel
                onCollapse={props.onCollapseResponsePanel}
                response={props.response}
                durationMs={props.responseDurationMs}
                isExecuting={props.isSending}
                error={props.executionError}
              />
            </Show>
          </div>
        </div>
      </Show>
    </section>
  );
}
