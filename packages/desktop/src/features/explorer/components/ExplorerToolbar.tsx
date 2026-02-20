import { PlusIcon, RefreshIcon } from './icons';

type ExplorerToolbarProps = {
  onCreate: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  isMutating: boolean;
  workspaceRoot: string;
};

export function ExplorerToolbar(props: ExplorerToolbarProps) {
  return (
    <header class="explorer-toolbar">
      <h1 class="explorer-toolbar-title">Workspace</h1>
      <div class="explorer-toolbar-actions">
        <button
          type="button"
          class="explorer-create"
          onClick={props.onCreate}
          disabled={props.isMutating}
          aria-label="Create new request file"
        >
          <PlusIcon />
          <span>New</span>
        </button>
        <button
          type="button"
          class="explorer-refresh"
          classList={{ 'is-loading': props.isRefreshing }}
          onClick={props.onRefresh}
          disabled={props.isMutating}
          aria-label="Refresh workspace files"
          title={`Refresh files in ${props.workspaceRoot || 'workspace'}`}
        >
          <RefreshIcon />
        </button>
      </div>
    </header>
  );
}
