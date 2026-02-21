import { createMemo, Match, Show, Switch } from 'solid-js';
import { createStore } from 'solid-js/store';
import { runConfirmedDelete } from '../mutations';
import { useExplorerStore } from '../use-explorer-store';
import {
  buildCreateFilePath,
  isCrossDirectoryMove,
  toCreateDirectory,
  toCreateHttpPath
} from '../utils/mutations';
import { parentDirectory, pathFilename, trimHttpExtension } from '../utils/path';
import { ExplorerToolbar } from './ExplorerToolbar';
import { ExplorerTree } from './ExplorerTree';

export default function ExplorerScreen() {
  const explorer = useExplorerStore();
  const [createForm, setCreateForm] = createStore({
    name: '',
    targetDir: undefined as string | undefined,
    error: undefined as string | undefined,
    isOpen: false
  });
  const [renameForm, setRenameForm] = createStore({
    name: '',
    directory: '',
    error: undefined as string | undefined,
    isOpen: false
  });
  const selectedPath = explorer.selectedPath;
  const visibleItems = explorer.flattenedVisible;
  const selectedItem = createMemo(() => {
    const path = selectedPath();
    if (!path) {
      return undefined;
    }
    return visibleItems().find((entry) => entry.node.path === path);
  });
  const selectedIsDirectory = createMemo(() => Boolean(selectedItem()?.node.isDir));
  const selectedRequestCount = createMemo(() => {
    const item = selectedItem();
    if (!item || item.node.isDir) {
      return 0;
    }
    return item?.node.requestCount ?? 0;
  });
  const mutationError = explorer.mutationError;
  const selectedFileContent = explorer.selectedFileContent;
  const fileDraftContent = explorer.fileDraftContent;
  const isFileLoading = explorer.isFileLoading;
  const fileLoadError = explorer.fileLoadError;
  const isSavingFile = explorer.isSavingFile;
  const fileSaveError = explorer.fileSaveError;
  const isBusy = createMemo(() => explorer.isMutating() || isSavingFile());
  const hasUnsavedFileChanges = createMemo(() => {
    const original = selectedFileContent();
    const draft = fileDraftContent();
    if (original === undefined || draft === undefined) {
      return false;
    }
    return draft !== original;
  });

  const openCreateForm = () => {
    let targetDir = createForm.targetDir;
    const path = selectedPath();
    if (path && selectedIsDirectory()) {
      targetDir = path;
    } else if (path) {
      const nextTarget = parentDirectory(path);
      targetDir = nextTarget || undefined;
    }

    setCreateForm({
      name: '',
      targetDir,
      error: undefined,
      isOpen: true
    });
  };

  const closeCreateForm = () => {
    setCreateForm({
      name: '',
      error: undefined,
      isOpen: false
    });
  };

  const openRenameForm = () => {
    const path = selectedPath();
    if (!path || selectedIsDirectory()) {
      return;
    }

    const currentFilename = pathFilename(path);
    setRenameForm({
      name: trimHttpExtension(currentFilename),
      directory: parentDirectory(path),
      error: undefined,
      isOpen: true
    });
  };

  const closeRenameForm = () => {
    setRenameForm({
      error: undefined,
      isOpen: false
    });
  };

  const submitCreateForm = async (event: Event) => {
    event.preventDefault();
    setCreateForm('error', undefined);

    const parsedPath = toCreateHttpPath(createForm.name);
    if (!parsedPath.ok) {
      setCreateForm('error', parsedPath.error);
      return;
    }

    try {
      await explorer.createFile(buildCreateFilePath(parsedPath.path, createForm.targetDir));
      closeCreateForm();
    } catch {
      // Store mutation error is displayed in the explorer panel.
    }
  };

  const submitRenameForm = async (event: Event) => {
    event.preventDefault();
    const fromPath = selectedPath();
    if (!fromPath) {
      return;
    }

    setRenameForm('error', undefined);

    const parsedName = toCreateHttpPath(renameForm.name);
    if (!parsedName.ok) {
      setRenameForm('error', parsedName.error);
      return;
    }

    const parsedDirectory = toCreateDirectory(renameForm.directory);
    if (!parsedDirectory.ok) {
      setRenameForm('error', parsedDirectory.error);
      return;
    }

    const toPath = buildCreateFilePath(parsedName.path, parsedDirectory.directory);
    if (toPath === fromPath) {
      setRenameForm('error', 'Destination is unchanged.');
      return;
    }

    if (
      isCrossDirectoryMove(fromPath, toPath) &&
      !window.confirm(`Move "${pathFilename(fromPath)}" to "${toPath}"?`)
    ) {
      return;
    }

    try {
      await explorer.renameFile(fromPath, toPath);
      closeRenameForm();
    } catch {
      // Store mutation error is displayed in the explorer panel.
    }
  };

  const deleteSelectedFile = async () => {
    const path = selectedPath();
    if (!path || isBusy()) {
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

  const saveSelectedFile = async () => {
    if (isBusy()) {
      return;
    }

    try {
      await explorer.saveSelectedFile();
    } catch {
      // Save errors are surfaced from store state.
    }
  };

  const handleToggleDirectory = (path: string) => {
    setCreateForm('targetDir', path);
    explorer.toggleDir(path);
  };

  const handleSelectFile = (path: string) => {
    const nextTarget = parentDirectory(path);
    setCreateForm('targetDir', nextTarget || undefined);
    explorer.selectPath(path);
  };

  const createTargetLabel = createMemo(() => createForm.targetDir ?? 'workspace root');

  return (
    <main class="explorer-screen">
      <section class="explorer-pane explorer-tree-panel" aria-label="Workspace files">
        <ExplorerToolbar
          onCreate={openCreateForm}
          onRefresh={() => void explorer.refresh()}
          isRefreshing={explorer.isLoading()}
          isMutating={isBusy()}
          workspaceRoot={explorer.workspaceRoot()}
        />

        <Show when={createForm.isOpen}>
          <form class="explorer-create-form" onSubmit={(event) => void submitCreateForm(event)}>
            <label class="explorer-create-field">
              <span class="explorer-create-label">Filename</span>
              <input
                type="text"
                class="explorer-create-input"
                value={createForm.name}
                onInput={(event) => setCreateForm('name', event.currentTarget.value)}
                placeholder="new-request"
                aria-label="New request file name"
                disabled={isBusy()}
              />
            </label>
            <span class="explorer-create-target">Create in: {createTargetLabel()}</span>
            <div class="explorer-create-actions">
              <button
                type="button"
                class="explorer-create-cancel"
                onClick={closeCreateForm}
                disabled={isBusy()}
              >
                Cancel
              </button>
              <button type="submit" class="explorer-create-submit" disabled={isBusy()}>
                Create
              </button>
            </div>
            <Show when={createForm.error}>
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

          <Show when={mutationError()}>
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
                items={visibleItems()}
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
                    disabled={isBusy() || isFileLoading()}
                  >
                    Delete file
                  </button>
                  <button
                    type="button"
                    class="explorer-rename"
                    onClick={openRenameForm}
                    disabled={isBusy() || isFileLoading()}
                  >
                    Rename/Move
                  </button>
                  <button
                    type="button"
                    class="explorer-save"
                    onClick={() => void saveSelectedFile()}
                    disabled={!hasUnsavedFileChanges() || isBusy() || isFileLoading()}
                  >
                    {isSavingFile() ? 'Saving…' : 'Save'}
                  </button>
                </div>
                <Show when={renameForm.isOpen}>
                  <form
                    class="explorer-rename-form"
                    onSubmit={(event) => void submitRenameForm(event)}
                  >
                    <label class="explorer-create-field">
                      <span class="explorer-create-label">Filename</span>
                      <input
                        type="text"
                        class="explorer-create-input"
                        value={renameForm.name}
                        onInput={(event) => setRenameForm('name', event.currentTarget.value)}
                        placeholder="renamed-request"
                        disabled={isBusy()}
                      />
                    </label>
                    <label class="explorer-create-field">
                      <span class="explorer-create-label">Directory (optional)</span>
                      <input
                        type="text"
                        class="explorer-create-input"
                        value={renameForm.directory}
                        onInput={(event) => setRenameForm('directory', event.currentTarget.value)}
                        placeholder="folder/subfolder"
                        disabled={isBusy()}
                      />
                    </label>
                    <div class="explorer-create-actions">
                      <button
                        type="button"
                        class="explorer-create-cancel"
                        onClick={closeRenameForm}
                        disabled={isBusy()}
                      >
                        Cancel
                      </button>
                      <button type="submit" class="explorer-create-submit" disabled={isBusy()}>
                        Rename
                      </button>
                    </div>
                    <Show when={renameForm.error}>
                      {(message) => <div class="explorer-create-error">{message()}</div>}
                    </Show>
                  </form>
                </Show>
                <Show when={isFileLoading()}>
                  <div class="explorer-details-loading">Loading file content…</div>
                </Show>
                <Show when={fileLoadError()}>
                  {(message) => <div class="explorer-create-error">{message()}</div>}
                </Show>
                <Show when={fileSaveError()}>
                  {(message) => <div class="explorer-create-error">{message()}</div>}
                </Show>
                <Show when={!isFileLoading() && !fileLoadError()}>
                  <label class="explorer-editor">
                    <span class="explorer-details-label">Content</span>
                    <textarea
                      class="explorer-editor-input"
                      value={fileDraftContent() ?? ''}
                      onInput={(event) => explorer.setFileDraftContent(event.currentTarget.value)}
                      disabled={isBusy()}
                      aria-label="Selected request file content"
                    />
                  </label>
                </Show>
                <p class="explorer-details-note">
                  Edit and save the selected `.http` file from this pane.
                </p>
              </div>
            )}
          </Show>
        </div>
      </section>
    </main>
  );
}
