import { createEffect, createMemo, createSignal, Match, Show, Switch } from 'solid-js';
import { createStore } from 'solid-js/store';
import {
  type CreateWorkspaceItemKind,
  DEFAULT_CREATE_WORKSPACE_ITEM_KIND,
  getRequestTemplate,
  isCreateRequestKind
} from '../create-request';
import {
  deriveRequestLineFromContent,
  FALLBACK_REQUEST_METHOD,
  FALLBACK_REQUEST_URL
} from '../request-line';
import { useExplorerStore } from '../use-explorer-store';
import { buildCreateFilePath, toCreateHttpPath } from '../utils/mutations';
import { parentDirectory } from '../utils/path';
import { CreateRequestDialog } from './CreateRequestDialog';
import { ExplorerToolbar } from './ExplorerToolbar';
import { ExplorerTree } from './ExplorerTree';
import { ChevronRightIcon } from './icons';
import {
  EmptyRequestWorkspace,
  REQUEST_METHODS,
  RequestDetailsPanel,
  type RequestMethod,
  RequestUrlBar,
  ResponseBodyPanel
} from './workspace';

const REQUEST_METHOD_SET = new Set<string>(REQUEST_METHODS);

function normalizeRequestMethod(method: string): RequestMethod {
  const nextMethod = method.toUpperCase();
  if (REQUEST_METHOD_SET.has(nextMethod)) {
    return nextMethod as RequestMethod;
  }
  return FALLBACK_REQUEST_METHOD;
}

export default function ExplorerScreen() {
  const explorer = useExplorerStore();
  const [createDialog, setCreateDialog] = createStore<{
    name: string;
    kind: CreateWorkspaceItemKind;
    targetDir: string | undefined;
    error: string | undefined;
    isOpen: boolean;
  }>({
    name: '',
    kind: DEFAULT_CREATE_WORKSPACE_ITEM_KIND,
    targetDir: undefined,
    error: undefined,
    isOpen: false
  });
  const [requestMethod, setRequestMethod] = createSignal<RequestMethod>(
    normalizeRequestMethod(FALLBACK_REQUEST_METHOD)
  );
  const [requestUrl, setRequestUrl] = createSignal(FALLBACK_REQUEST_URL);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = createSignal(false);
  const [isResponseCollapsed, setIsResponseCollapsed] = createSignal(false);
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
  const isFileLoading = explorer.isFileLoading;
  const fileLoadError = explorer.fileLoadError;
  const isBusy = createMemo(() => explorer.isMutating());
  const requestLineDefaults = createMemo(() => deriveRequestLineFromContent(selectedFileContent()));
  const explorerGridStyle = createMemo<Record<string, string>>(() => ({
    '--explorer-grid-cols': isSidebarCollapsed()
      ? 'minmax(0, 1fr)'
      : 'minmax(260px, 300px) minmax(0, 1fr)',
    '--explorer-grid-rows-mobile': isSidebarCollapsed()
      ? 'minmax(0, 1fr)'
      : 'minmax(220px, 42%) minmax(0, 1fr)'
  }));
  const requestPanelsStyle = createMemo<Record<string, string>>(() => ({
    '--request-panels-cols': isResponseCollapsed()
      ? 'minmax(0, 1fr) 34px'
      : 'minmax(320px, 48%) minmax(0, 1fr)'
  }));

  const openCreateDialog = () => {
    let targetDir = createDialog.targetDir;
    const path = selectedPath();
    if (path && selectedIsDirectory()) {
      targetDir = path;
    } else if (path) {
      const nextTarget = parentDirectory(path);
      targetDir = nextTarget || undefined;
    }

    setCreateDialog({
      name: '',
      kind: DEFAULT_CREATE_WORKSPACE_ITEM_KIND,
      targetDir,
      error: undefined,
      isOpen: true
    });
  };

  const closeCreateDialog = () => {
    setCreateDialog({
      name: '',
      kind: DEFAULT_CREATE_WORKSPACE_ITEM_KIND,
      error: undefined,
      isOpen: false
    });
  };

  const submitCreateDialog = async () => {
    setCreateDialog('error', undefined);

    if (!isCreateRequestKind(createDialog.kind)) {
      setCreateDialog('error', 'Selected type is not available yet.');
      return;
    }

    const parsedPath = toCreateHttpPath(createDialog.name);
    if (!parsedPath.ok) {
      setCreateDialog('error', parsedPath.error);
      return;
    }

    try {
      await explorer.createFile({
        path: buildCreateFilePath(parsedPath.path, createDialog.targetDir),
        content: getRequestTemplate(createDialog.kind)
      });
      closeCreateDialog();
    } catch {
      // Store mutation error is displayed in the explorer panel.
    }
  };

  const handleToggleDirectory = (path: string) => {
    setCreateDialog('targetDir', path);
    explorer.toggleDir(path);
  };

  const handleSelectFile = (path: string) => {
    const nextTarget = parentDirectory(path);
    setCreateDialog('targetDir', nextTarget || undefined);
    explorer.selectPath(path);
  };

  const createTargetLabel = createMemo(() => createDialog.targetDir ?? 'workspace root');
  const toggleSidebarCollapsed = () => {
    setIsSidebarCollapsed((previous) => {
      const next = !previous;
      if (next) {
        closeCreateDialog();
      }
      return next;
    });
  };
  const collapseResponsePanel = () => setIsResponseCollapsed(true);
  const expandResponsePanel = () => setIsResponseCollapsed(false);

  createEffect(() => {
    const path = selectedPath();
    if (!path) {
      setRequestMethod(normalizeRequestMethod(FALLBACK_REQUEST_METHOD));
      setRequestUrl(FALLBACK_REQUEST_URL);
      return;
    }

    const nextRequestLine = requestLineDefaults();
    setRequestMethod(normalizeRequestMethod(nextRequestLine.method));
    setRequestUrl(nextRequestLine.url);
  });

  return (
    <main
      class="flex-1 min-h-0 grid grid-cols-[var(--explorer-grid-cols)] gap-0 px-2 pt-2 max-[960px]:grid-cols-1 max-[960px]:grid-rows-[var(--explorer-grid-rows-mobile)]"
      style={explorerGridStyle()}
    >
      <Show when={!isSidebarCollapsed()}>
        <section
          class="min-h-0 flex flex-col overflow-hidden border border-base-300 border-r-0 rounded-tl-[14px] bg-[linear-gradient(180deg,_var(--app-pane-gradient-start)_0%,_var(--app-bg)_100%)] max-[960px]:border-r max-[960px]:rounded-tr-[14px]"
          aria-label="Workspace files"
        >
          <ExplorerToolbar
            onCreate={openCreateDialog}
            onRefresh={() => void explorer.refresh()}
            isRefreshing={explorer.isLoading()}
            isMutating={isBusy()}
            workspaceRoot={explorer.workspaceRoot()}
          />

          <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-transparent py-2">
            <Show when={explorer.error()}>
              {(message) => (
                <div
                  class="mx-3 mt-3 rounded-box border border-error/40 bg-error/15 px-4 py-3 text-sm text-base-content"
                  role="alert"
                >
                  <strong class="block font-semibold">
                    Unable to load workspace request files.
                  </strong>
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
      </Show>

      <CreateRequestDialog
        open={createDialog.isOpen}
        isBusy={isBusy()}
        name={createDialog.name}
        kind={createDialog.kind}
        targetLabel={createTargetLabel()}
        error={createDialog.error}
        onClose={closeCreateDialog}
        onNameChange={(value) => setCreateDialog('name', value)}
        onKindChange={(kind) => setCreateDialog('kind', kind)}
        onSubmit={() => void submitCreateDialog()}
      />

      <section
        class="min-w-0 min-h-0 flex flex-col overflow-hidden border border-base-300 rounded-tr-[14px] bg-[linear-gradient(180deg,_var(--app-pane-gradient-start)_0%,_var(--app-pane-gradient-end)_100%)] [box-shadow:var(--app-pane-shadow-top),_var(--app-pane-shadow-drop)] max-[960px]:rounded-tr-none"
        aria-label="Request workspace"
      >
        <header class="flex min-h-[42px] items-center justify-between gap-2 border-b border-base-300 px-3.5">
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="btn btn-ghost btn-xs btn-square h-7 min-h-7 text-base-content/70 hover:text-base-content"
              onClick={toggleSidebarCollapsed}
              aria-label={
                isSidebarCollapsed() ? 'Expand workspace files' : 'Collapse workspace files'
              }
              title={isSidebarCollapsed() ? 'Expand workspace files' : 'Collapse workspace files'}
            >
              <ChevronRightIcon class={isSidebarCollapsed() ? 'size-3' : 'size-3 rotate-180'} />
            </button>
            <h2 class="m-0 font-mono text-[0.9rem] font-semibold tracking-[0.015em] text-base-content">
              Request Workspace
            </h2>
          </div>
          <div class="flex items-center gap-2">
            <Show when={selectedPath()}>
              {(path) => (
                <span
                  class="max-w-[320px] truncate font-mono text-[12px] text-base-content/65"
                  title={path()}
                >
                  {path()}
                </span>
              )}
            </Show>
            <Show when={selectedPath()}>
              <span class="badge badge-sm border-base-300 bg-base-300/60 px-2 font-mono text-[11px] text-base-content/80">
                {selectedRequestCount()} req
              </span>
            </Show>
          </div>
        </header>
        <Show when={selectedPath()} fallback={<EmptyRequestWorkspace />}>
          <div class="flex min-h-0 flex-1 flex-col">
            <Show when={fileLoadError()}>
              {(message) => (
                <div
                  class="alert alert-error mx-3 mt-3 border border-error/50 bg-error/20 text-error-content"
                  role="alert"
                >
                  <span class="text-sm">{message()}</span>
                </div>
              )}
            </Show>

            <Show when={isFileLoading()}>
              <div class="alert mx-3 mt-3 border border-base-300 bg-base-200/70 text-base-content">
                <span class="text-sm">Loading request content…</span>
              </div>
            </Show>

            <RequestUrlBar
              method={requestMethod()}
              url={requestUrl()}
              onMethodChange={(method) => setRequestMethod(normalizeRequestMethod(method))}
              onUrlChange={setRequestUrl}
              disabled={isBusy() || isFileLoading()}
            />

            <div
              class="grid min-h-0 flex-1 grid-cols-[var(--request-panels-cols)] gap-0"
              style={requestPanelsStyle()}
            >
              <RequestDetailsPanel />
              <Show
                when={!isResponseCollapsed()}
                fallback={
                  <aside class="min-h-0 bg-base-200/10 px-1 py-2">
                    <div class="flex h-full flex-col items-center gap-3">
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs btn-square h-7 min-h-7 text-base-content/70 hover:text-base-content"
                        onClick={expandResponsePanel}
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
                <ResponseBodyPanel onCollapse={collapseResponsePanel} />
              </Show>
            </div>
          </div>
        </Show>
      </section>
    </main>
  );
}
