import { Match, Show, Switch } from 'solid-js';
import type { ExplorerFlatNode } from '../types';
import { ExplorerToolbar } from './ExplorerToolbar';
import { ExplorerTree } from './ExplorerTree';

type ExplorerSidebarPanelProps = {
  onCreate: () => void;
  onImport: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  isMutating: boolean;
  workspaceRoot: string;
  loadError?: string;
  mutationError?: string;
  isLoading: boolean;
  items: ExplorerFlatNode[];
  selectedPath?: string;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
};

export function ExplorerSidebarPanel(props: ExplorerSidebarPanelProps) {
  return (
    <section
      class="min-h-0 flex flex-col overflow-hidden border border-base-300 border-r-0 rounded-tl-[14px] bg-[linear-gradient(180deg,_var(--app-pane-gradient-start)_0%,_var(--app-bg)_100%)] max-[960px]:border-r max-[960px]:rounded-tr-[14px]"
      aria-label="Workspace files"
    >
      <ExplorerToolbar
        onCreate={props.onCreate}
        onImport={props.onImport}
        onRefresh={props.onRefresh}
        isRefreshing={props.isRefreshing}
        isMutating={props.isMutating}
        workspaceRoot={props.workspaceRoot}
      />

      <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-transparent py-2">
        <Show when={props.loadError}>
          {(message) => (
            <div
              class="mx-3 mt-3 rounded-box border border-error/40 bg-error/15 px-4 py-3 text-sm text-base-content"
              role="alert"
            >
              <strong class="block font-semibold">Unable to load workspace request files.</strong>
              <span class="mt-1 block text-xs">{message()}</span>
            </div>
          )}
        </Show>

        <Show when={props.mutationError}>
          {(message) => (
            <div
              class="mx-3 mt-3 rounded-box border border-error/40 bg-error/15 px-4 py-3 text-sm text-base-content"
              role="alert"
            >
              <strong class="block font-semibold">Workspace update failed.</strong>
              <span class="mt-1 block text-xs">{message()}</span>
            </div>
          )}
        </Show>

        <Switch>
          <Match when={props.isLoading && props.items.length === 0}>
            <div class="mx-3 mt-3 rounded-box border border-base-300 bg-base-200/60 px-4 py-4 text-sm text-base-content/80">
              <strong class="block font-semibold text-base-content">Loading workspace…</strong>
              <span class="mt-1 block text-xs">Fetching files from the local sidecar server.</span>
            </div>
          </Match>

          <Match when={!props.isLoading && props.items.length === 0}>
            <div class="mx-3 mt-3 rounded-box border border-base-300 bg-base-200/60 px-4 py-4 text-sm text-base-content/80">
              <strong class="block font-semibold text-base-content">
                No HTTP request files discovered.
              </strong>
              <span class="mt-1 block text-xs">
                Try refreshing after adding `.http` files to this workspace.
              </span>
            </div>
          </Match>

          <Match when={props.items.length > 0}>
            <ExplorerTree
              items={props.items}
              selectedPath={props.selectedPath}
              onToggleDir={props.onToggleDir}
              onSelectFile={props.onSelectFile}
            />
          </Match>
        </Switch>
      </div>
    </section>
  );
}
