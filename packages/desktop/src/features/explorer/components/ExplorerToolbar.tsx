import { RefreshIcon } from './icons';

type ExplorerToolbarProps = {
  onRefresh: () => void;
  isRefreshing: boolean;
  workspaceRoot: string;
};

export function ExplorerToolbar(props: ExplorerToolbarProps) {
  return (
    <header class="explorer-toolbar">
      <h1 class="explorer-toolbar-title">Workspace</h1>
      <button
        type="button"
        class="explorer-refresh"
        classList={{ 'is-loading': props.isRefreshing }}
        onClick={props.onRefresh}
        aria-label="Refresh workspace files"
        title={`Refresh files in ${props.workspaceRoot || 'workspace'}`}
      >
        <RefreshIcon />
      </button>
    </header>
  );
}
