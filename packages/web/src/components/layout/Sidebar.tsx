import { useWorkspace } from '../../context';
import { FileTree } from '../file-tree';
import { RefreshIcon } from '../icons';

export function Sidebar() {
  const store = useWorkspace();

  return (
    <aside class="w-[280px] min-w-[200px] max-w-[400px] flex flex-col border-r border-treq-border-light bg-treq-bg dark:border-treq-dark-border-light dark:bg-treq-dark-bg">
      <div class="flex items-center justify-between px-4 py-3 border-b border-treq-border-light dark:border-treq-dark-border-light">
        <h2 class="text-sm font-semibold text-treq-text-strong m-0 dark:text-treq-dark-text-strong">
          Files
        </h2>
        <button
          class="flex items-center justify-center w-7 h-7 p-0 bg-transparent border border-transparent rounded text-treq-text-muted cursor-pointer transition-all hover:bg-treq-border-light hover:text-treq-text-strong dark:text-treq-dark-text-muted dark:hover:bg-treq-dark-border-light dark:hover:text-treq-dark-text-strong"
          onClick={() => store.refresh()}
          title="Refresh files"
        >
          <RefreshIcon />
        </button>
      </div>
      <div class="flex-1 overflow-y-auto">
        <FileTree />
      </div>
      <div class="px-4 py-2 border-t border-treq-border-light dark:border-treq-dark-border-light">
        <span
          class="font-mono text-xs text-treq-text-muted max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap block dark:text-treq-dark-text-muted"
          title={store.workspaceRoot()}
        >
          {store.workspaceRoot()}
        </span>
      </div>
    </aside>
  );
}
