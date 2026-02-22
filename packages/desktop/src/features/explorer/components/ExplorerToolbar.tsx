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
    <header class="flex items-center justify-between gap-3 border-b border-base-300 bg-base-200 px-3.5 py-2.5">
      <h1 class="m-0 font-mono text-[0.96rem] leading-[1.1] font-semibold tracking-[0.02em] text-base-content">
        Workspace
      </h1>
      <div class="inline-flex items-center gap-2">
        <button
          type="button"
          class="btn btn-primary btn-sm h-8 min-h-8 rounded-full border border-primary/70 px-3.5 font-mono text-[12px] normal-case tracking-[0.01em] shadow-sm hover:brightness-110"
          onClick={props.onCreate}
          disabled={props.isMutating}
          aria-label="Create new request"
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
