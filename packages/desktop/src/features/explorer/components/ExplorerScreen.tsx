import { Match, Show, Switch } from 'solid-js';
import { useExplorerStore } from '../use-explorer-store';
import { ExplorerToolbar } from './ExplorerToolbar';
import { ExplorerTree } from './ExplorerTree';

export default function ExplorerScreen() {
  const explorer = useExplorerStore();

  return (
    <main class="explorer-screen" data-theme="treq-desktop">
      <section class="explorer-frame">
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
                selectedPath={explorer.selectedPath()}
                onToggleDir={explorer.toggleDir}
                onSelectFile={explorer.selectPath}
              />
            </Match>
          </Switch>
        </div>

        <footer class="explorer-footer">
          <span class="explorer-workspace" title={explorer.workspaceRoot()}>
            {explorer.workspaceRoot() || 'No workspace selected'}
          </span>
        </footer>
      </section>
    </main>
  );
}
