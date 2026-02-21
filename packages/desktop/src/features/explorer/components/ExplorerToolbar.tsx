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
          class="btn btn-primary btn-xs h-7 min-h-7 px-2 font-mono text-[11px] normal-case"
          onClick={props.onCreate}
          disabled={props.isMutating}
          aria-label="Create new request file"
        >
          <PlusIcon class="size-3" />
          <span>New</span>
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-square h-7 min-h-7 text-base-content/70 hover:text-base-content"
          onClick={props.onRefresh}
          disabled={props.isMutating}
          aria-label="Refresh workspace files"
          title={`Refresh files in ${props.workspaceRoot || 'workspace'}`}
        >
          <RefreshIcon class={props.isRefreshing ? 'size-3 animate-spin' : 'size-3'} />
        </button>
      </div>
    </header>
  );
}
