import { createMemo, createSignal, Match, Show, Switch } from 'solid-js';
import { buildCreateFilePath, runConfirmedDelete, toCreateHttpPath } from '../mutations';
import { useExplorerStore } from '../use-explorer-store';
import { ExplorerToolbar } from './ExplorerToolbar';
import { ExplorerTree } from './ExplorerTree';

function parentDirectory(path: string): string {
  const slashIndex = path.lastIndexOf('/');
  if (slashIndex <= 0) {
    return '';
  }
  return path.slice(0, slashIndex);
}

export default function ExplorerScreen() {
  const explorer = useExplorerStore();
  const [createName, setCreateName] = createSignal('');
  const [createTargetDir, setCreateTargetDir] = createSignal<string | undefined>();
  const [createError, setCreateError] = createSignal<string | undefined>();
  const [showCreateForm, setShowCreateForm] = createSignal(false);
  const selectedPath = createMemo(() => explorer.selectedPath());
  const selectedIsDirectory = createMemo(() => {
    const path = selectedPath();
    if (!path) {
      return false;
    }

    const item = explorer.flattenedVisible().find((entry) => entry.node.path === path);
    return Boolean(item?.node.isDir);
  });
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
  const hasMutationError = createMemo(() => explorer.mutationError());

  const openCreateForm = () => {
    setCreateName('');
    const path = selectedPath();
    if (path && !selectedIsDirectory()) {
      const nextTarget = parentDirectory(path);
      setCreateTargetDir(nextTarget ? nextTarget : undefined);
    }
    setCreateError(undefined);
    setShowCreateForm(true);
  };

  const closeCreateForm = () => {
    setCreateName('');
    setCreateError(undefined);
    setShowCreateForm(false);
  };

  const submitCreateForm = async (event: Event) => {
    event.preventDefault();
    setCreateError(undefined);

    const parsedPath = toCreateHttpPath(createName());
    if (!parsedPath.ok) {
      setCreateError(parsedPath.error);
      return;
    }

    try {
      await explorer.createFile(buildCreateFilePath(parsedPath.path, createTargetDir()));
      closeCreateForm();
    } catch {
      // Store mutation error is displayed in the explorer panel.
    }
  };

  const deleteSelectedFile = async () => {
    const path = selectedPath();
    if (!path || explorer.isMutating()) {
      return;
    }

    const filename = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
    try {
      await runConfirmedDelete(
        path,
        () => window.confirm(`Delete "${filename}" from this workspace?`),
        explorer.deleteFile
      );
    } catch {
      // Store mutation error is displayed in the explorer panel.
    }
  };

  const handleToggleDirectory = (path: string) => {
    setCreateTargetDir(path);
    explorer.toggleDir(path);
  };

  const handleSelectFile = (path: string) => {
    const nextTarget = parentDirectory(path);
    setCreateTargetDir(nextTarget ? nextTarget : undefined);
    explorer.selectPath(path);
  };

  const createTargetLabel = createMemo(() => createTargetDir() ?? 'workspace root');

  return (
    <main class="explorer-screen">
      <section class="explorer-pane explorer-tree-panel" aria-label="Workspace files">
        <ExplorerToolbar
          onCreate={openCreateForm}
          onRefresh={() => void explorer.refresh()}
          isRefreshing={explorer.isLoading()}
          isMutating={explorer.isMutating()}
          workspaceRoot={explorer.workspaceRoot()}
        />

        <Show when={showCreateForm()}>
          <form class="explorer-create-form" onSubmit={(event) => void submitCreateForm(event)}>
            <label class="explorer-create-field">
              <span class="explorer-create-label">Filename</span>
              <input
                type="text"
                class="explorer-create-input"
                value={createName()}
                onInput={(event) => setCreateName(event.currentTarget.value)}
                placeholder="new-request"
                aria-label="New request file name"
                disabled={explorer.isMutating()}
              />
            </label>
            <span class="explorer-create-target">Create in: {createTargetLabel()}</span>
            <div class="explorer-create-actions">
              <button
                type="button"
                class="explorer-create-cancel"
                onClick={closeCreateForm}
                disabled={explorer.isMutating()}
              >
                Cancel
              </button>
              <button type="submit" class="explorer-create-submit" disabled={explorer.isMutating()}>
                Create
              </button>
            </div>
            <Show when={createError()}>
              {(message) => <span class="explorer-create-error">{message()}</span>}
            </Show>
          </form>
        </Show>

        <div class="explorer-tree-wrap">
          <Show when={explorer.error()}>
            {(message) => (
              <div class="explorer-state explorer-error" role="alert">
                <strong>Unable to load workspace request files.</strong>
                <span>{message()}</span>
              </div>
            )}
          </Show>

          <Show when={hasMutationError()}>
            {(message) => (
              <div class="explorer-state explorer-error" role="alert">
                <strong>Workspace update failed.</strong>
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
                onToggleDir={handleToggleDirectory}
                onSelectFile={handleSelectFile}
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
                <div class="explorer-details-actions">
                  <button
                    type="button"
                    class="explorer-delete"
                    onClick={() => void deleteSelectedFile()}
                    disabled={explorer.isMutating()}
                  >
                    Delete file
                  </button>
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
