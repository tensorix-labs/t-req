import { createMemo, Match, Show, Switch } from 'solid-js';
import { useExplorerStore } from '../use-explorer-store';
import { ExplorerToolbar } from './ExplorerToolbar';
import { ExplorerTree } from './ExplorerTree';

export default function ExplorerScreen() {
  const explorer = useExplorerStore();
  const selectedPath = createMemo(() => explorer.selectedPath());
  const selectedRequestCount = createMemo(() => {
    const path = selectedPath();
    if (!path) {
      return 0;
    }

    const item = explorer
      .flattenedVisible()
      .find((entry) => !entry.node.isDir && entry.node.path === path);
    return item?.node.requestCount ?? 0;
  });

  return (
    <main class="explorer-screen">
      <section class="explorer-pane explorer-tree-panel" aria-label="Workspace files">
        <ExplorerToolbar
          onRefresh={() => void explorer.refresh()}
          isRefreshing={explorer.isLoading()}
          workspaceRoot={explorer.workspaceRoot()}
        />

        <div class="explorer-tree-wrap">
          <Show when={explorer.error()}>
            {(message) => (
              <div class="explorer-state explorer-error" role="alert">
                <strong>Unable to load workspace request files.</strong>
                <span>{message()}</span>
              </div>
            )}
          </Show>

          <Switch>
            <Match when={explorer.isLoading() && explorer.flattenedVisible().length === 0}>
              <div class="explorer-state">
                <strong>Loading workspace…</strong>
                <span>Fetching files from the local sidecar server.</span>
              </div>
            </Match>

            <Match when={!explorer.isLoading() && explorer.flattenedVisible().length === 0}>
              <div class="explorer-state">
                <strong>No HTTP request files discovered.</strong>
                <span>Try refreshing after adding `.http` files to this workspace.</span>
              </div>
            </Match>

            <Match when={explorer.flattenedVisible().length > 0}>
              <ExplorerTree
                items={explorer.flattenedVisible()}
                selectedPath={selectedPath()}
                onToggleDir={explorer.toggleDir}
                onSelectFile={explorer.selectPath}
              />
            </Match>
          </Switch>
        </div>
      </section>

      <section class="explorer-pane explorer-details" aria-label="Workspace detail">
        <header class="explorer-details-header">
          <h2 class="explorer-details-title">Request Workspace</h2>
          <Show when={selectedPath()}>
            <span class="explorer-details-count">{selectedRequestCount()} req</span>
          </Show>
        </header>
        <div class="explorer-details-body">
          <Show
            when={selectedPath()}
            fallback={
              <div class="explorer-state">
                <strong>Select a request file from the tree.</strong>
                <span>The details pane is ready for request and response tooling.</span>
              </div>
            }
          >
            {(path) => (
              <div class="explorer-details-card">
                <div class="explorer-details-label">Selected file</div>
                <div class="explorer-details-path" title={path()}>
                  {path()}
                </div>
                <p class="explorer-details-note">
                  Request editing and execution surfaces plug into this pane.
                </p>
              </div>
            )}
          </Show>
        </div>
      </section>
    </main>
  );
}
