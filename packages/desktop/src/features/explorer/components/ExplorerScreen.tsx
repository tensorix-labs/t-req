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
    <main class="flex-1 min-h-0 grid grid-cols-[minmax(320px,_34%)_minmax(0,_1fr)] gap-0 px-2 pt-2 max-[860px]:grid-cols-1 max-[860px]:grid-rows-[minmax(220px,_42%)_minmax(0,_1fr)]">
      <section
        class="min-h-0 flex flex-col overflow-hidden border border-base-300 border-r-0 rounded-tl-[14px] bg-[linear-gradient(180deg,_var(--app-pane-gradient-start)_0%,_var(--app-bg)_100%)] max-[860px]:border-r max-[860px]:rounded-tr-[14px]"
        aria-label="Workspace files"
      >
        <ExplorerToolbar
          onCreate={openCreateForm}
          onRefresh={() => void explorer.refresh()}
          isRefreshing={explorer.isLoading()}
          isMutating={isBusy()}
          workspaceRoot={explorer.workspaceRoot()}
        />

        <Show when={createForm.isOpen}>
          <form
            class="space-y-2 border-b border-base-300 bg-base-200/70 px-3.5 py-2.5"
            onSubmit={(event) => void submitCreateForm(event)}
          >
            <label class="flex flex-col gap-1">
              <span class="font-mono text-[11px] text-base-content/65">Filename</span>
              <input
                type="text"
                class="input input-sm w-full rounded-md border-base-300 bg-base-100/70 font-mono text-xs"
                value={createForm.name}
                onInput={(event) => setCreateForm('name', event.currentTarget.value)}
                placeholder="new-request"
                aria-label="New request file name"
                disabled={isBusy()}
              />
            </label>
            <span class="block font-mono text-[11px] text-base-content/70">
              Create in: {createTargetLabel()}
            </span>
            <div class="flex items-center justify-end gap-2">
              <button
                type="button"
                class="btn btn-ghost btn-xs h-7 min-h-7 px-2 font-mono text-[11px] normal-case"
                onClick={closeCreateForm}
                disabled={isBusy()}
              >
                Cancel
              </button>
              <button
                type="submit"
                class="btn btn-primary btn-xs h-7 min-h-7 px-2 font-mono text-[11px] normal-case"
                disabled={isBusy()}
              >
                Create
              </button>
            </div>
            <Show when={createForm.error}>
              {(message) => <span class="text-xs text-error">{message()}</span>}
            </Show>
          </form>
        </Show>

        <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-transparent py-2">
          <Show when={explorer.error()}>
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

          <Show when={mutationError()}>
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
            <Match when={explorer.isLoading() && explorer.flattenedVisible().length === 0}>
              <div class="mx-3 mt-3 rounded-box border border-base-300 bg-base-200/60 px-4 py-4 text-sm text-base-content/80">
                <strong class="block font-semibold text-base-content">Loading workspace…</strong>
                <span class="mt-1 block text-xs">
                  Fetching files from the local sidecar server.
                </span>
              </div>
            </Match>

            <Match when={!explorer.isLoading() && explorer.flattenedVisible().length === 0}>
              <div class="mx-3 mt-3 rounded-box border border-base-300 bg-base-200/60 px-4 py-4 text-sm text-base-content/80">
                <strong class="block font-semibold text-base-content">
                  No HTTP request files discovered.
                </strong>
                <span class="mt-1 block text-xs">
                  Try refreshing after adding `.http` files to this workspace.
                </span>
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

      <section
        class="min-w-0 min-h-0 flex flex-col overflow-hidden border border-base-300 rounded-tr-[14px] bg-[linear-gradient(180deg,_var(--app-pane-gradient-start)_0%,_var(--app-pane-gradient-end)_100%)] [box-shadow:var(--app-pane-shadow-top),_var(--app-pane-shadow-drop)] max-[860px]:rounded-tr-none"
        aria-label="Workspace detail"
      >
        <header class="flex min-h-[42px] items-center justify-between gap-2 border-b border-base-300 px-3.5">
          <h2 class="m-0 font-mono text-[0.8rem] font-semibold tracking-[0.015em] text-base-content">
            Request Workspace
          </h2>
          <Show when={selectedPath()}>
            <span class="badge badge-sm border-base-300 bg-base-300/60 px-2 font-mono text-[10px] text-base-content/80">
              {selectedRequestCount()} req
            </span>
          </Show>
        </header>
        <div class="flex-1 overflow-auto p-3.5">
          <Show
            when={selectedPath()}
            fallback={
              <div class="mx-auto max-w-xl rounded-box border border-base-300 bg-base-200/60 px-6 py-8 text-center text-base-content/80">
                <strong class="block text-[clamp(1.55rem,2vw,2rem)] leading-[1.2] tracking-[-0.012em] text-base-content">
                  Select a request file from the tree.
                </strong>
                <span class="mt-2 block text-base">
                  The details pane is ready for request and response tooling.
                </span>
              </div>
            }
          >
            {(path) => (
              <div class="rounded-box border border-base-300 bg-base-200/70 p-3">
                <div class="text-[11px] font-semibold uppercase tracking-[0.05em] text-base-content/60">
                  Selected file
                </div>
                <div class="mt-2 truncate font-mono text-xs text-base-content" title={path()}>
                  {path()}
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="btn btn-outline btn-error btn-xs h-7 min-h-7 px-2 font-mono text-[11px] normal-case"
                    onClick={() => void deleteSelectedFile()}
                    disabled={isBusy() || isFileLoading()}
                  >
                    Delete file
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs h-7 min-h-7 px-2 font-mono text-[11px] normal-case"
                    onClick={openRenameForm}
                    disabled={isBusy() || isFileLoading()}
                  >
                    Rename/Move
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary btn-xs h-7 min-h-7 px-2 font-mono text-[11px] normal-case"
                    onClick={() => void saveSelectedFile()}
                    disabled={!hasUnsavedFileChanges() || isBusy() || isFileLoading()}
                  >
                    {isSavingFile() ? 'Saving…' : 'Save'}
                  </button>
                </div>
                <Show when={renameForm.isOpen}>
                  <form
                    class="mt-3 space-y-2 rounded-box border border-base-300 bg-base-100/70 p-2.5"
                    onSubmit={(event) => void submitRenameForm(event)}
                  >
                    <label class="flex flex-col gap-1">
                      <span class="font-mono text-[11px] text-base-content/65">Filename</span>
                      <input
                        type="text"
                        class="input input-sm w-full rounded-md border-base-300 bg-base-100/70 font-mono text-xs"
                        value={renameForm.name}
                        onInput={(event) => setRenameForm('name', event.currentTarget.value)}
                        placeholder="renamed-request"
                        disabled={isBusy()}
                      />
                    </label>
                    <label class="flex flex-col gap-1">
                      <span class="font-mono text-[11px] text-base-content/65">
                        Directory (optional)
                      </span>
                      <input
                        type="text"
                        class="input input-sm w-full rounded-md border-base-300 bg-base-100/70 font-mono text-xs"
                        value={renameForm.directory}
                        onInput={(event) => setRenameForm('directory', event.currentTarget.value)}
                        placeholder="folder/subfolder"
                        disabled={isBusy()}
                      />
                    </label>
                    <div class="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs h-7 min-h-7 px-2 font-mono text-[11px] normal-case"
                        onClick={closeRenameForm}
                        disabled={isBusy()}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        class="btn btn-primary btn-xs h-7 min-h-7 px-2 font-mono text-[11px] normal-case"
                        disabled={isBusy()}
                      >
                        Rename
                      </button>
                    </div>
                    <Show when={renameForm.error}>
                      {(message) => <div class="text-xs text-error">{message()}</div>}
                    </Show>
                  </form>
                </Show>
                <Show when={isFileLoading()}>
                  <div class="mt-3 text-xs text-base-content/70">Loading file content…</div>
                </Show>
                <Show when={fileLoadError()}>
                  {(message) => <div class="mt-2 text-xs text-error">{message()}</div>}
                </Show>
                <Show when={fileSaveError()}>
                  {(message) => <div class="mt-2 text-xs text-error">{message()}</div>}
                </Show>
                <Show when={!isFileLoading() && !fileLoadError()}>
                  <label class="mt-3 flex flex-col gap-1.5">
                    <span class="text-[11px] font-semibold uppercase tracking-[0.05em] text-base-content/60">
                      Content
                    </span>
                    <textarea
                      class="textarea textarea-sm min-h-[220px] w-full resize-y rounded-md border-base-300 bg-base-100/70 font-mono text-xs leading-[1.45]"
                      value={fileDraftContent() ?? ''}
                      onInput={(event) => explorer.setFileDraftContent(event.currentTarget.value)}
                      disabled={isBusy()}
                      aria-label="Selected request file content"
                    />
                  </label>
                </Show>
                <p class="mt-2 text-xs text-base-content/65">
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
