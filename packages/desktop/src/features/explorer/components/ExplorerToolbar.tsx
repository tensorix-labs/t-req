import { ChevronRightIcon, PlusIcon, RefreshIcon } from './icons';

type ExplorerToolbarProps = {
  onCreate: () => void;
  onRefresh: () => void;
  onToggleCollapsed: () => void;
  isRefreshing: boolean;
  isMutating: boolean;
  isCollapsed: boolean;
  workspaceRoot: string;
};

export function ExplorerToolbar(props: ExplorerToolbarProps) {
  if (props.isCollapsed) {
    return (
      <header class="flex items-center justify-center border-b border-base-300 bg-base-200 px-1 py-2.5">
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-square h-7 min-h-7 text-base-content/70 hover:text-base-content"
          onClick={props.onToggleCollapsed}
          aria-label="Expand workspace files"
          title="Expand workspace files"
        >
          <ChevronRightIcon class="size-3" />
        </button>
      </header>
    );
  }

  return (
    <header class="flex items-center justify-between gap-3 border-b border-base-300 bg-base-200 px-3.5 py-2.5">
      <h1 class="m-0 font-mono text-[0.88rem] leading-[1.1] font-semibold tracking-[0.02em] text-base-content">
        Workspace
      </h1>
      <div class="inline-flex items-center gap-2">
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-square h-7 min-h-7 text-base-content/70 hover:text-base-content"
          onClick={props.onToggleCollapsed}
          aria-label="Collapse workspace files"
          title="Collapse workspace files"
        >
          <ChevronRightIcon class="size-3 rotate-180" />
        </button>
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
