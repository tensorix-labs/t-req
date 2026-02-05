import { Show } from 'solid-js';
import { useWorkspace } from '../../context';
import { FileTree } from '../file-tree';
import { RefreshIcon, CollapseIcon } from '../icons';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar(props: SidebarProps) {
  const store = useWorkspace();

  return (
    <aside
      class="flex flex-col border-r border-treq-border-light bg-white dark:border-treq-dark-border-light dark:bg-treq-dark-bg transition-all duration-200"
      classList={{
        'w-[280px] min-w-[200px] max-w-[400px]': !props.collapsed,
        'w-12': props.collapsed,
      }}
    >
      <Show
        when={!props.collapsed}
        fallback={
          <>
            {/* Collapsed state */}
            <div class="flex flex-col items-center py-3 border-b border-treq-border-light dark:border-treq-dark-border-light">
              <button
                class="flex items-center justify-center w-8 h-8 p-0 bg-transparent border border-transparent rounded-treq text-treq-text-muted cursor-pointer transition-all duration-150 hover:text-treq-accent hover:bg-treq-bg-hover dark:text-treq-dark-text-muted dark:hover:text-treq-accent dark:hover:bg-treq-dark-bg-hover"
                onClick={props.onToggle}
                title="Expand sidebar"
              >
                <CollapseIcon collapsed />
              </button>
            </div>
            <div class="flex-1 flex flex-col items-center py-3 gap-2">
              <button
                class="flex items-center justify-center w-8 h-8 p-0 bg-transparent border border-transparent rounded-treq text-treq-text-muted cursor-pointer transition-all duration-150 hover:text-treq-accent hover:bg-treq-bg-hover dark:text-treq-dark-text-muted dark:hover:text-treq-accent dark:hover:bg-treq-dark-bg-hover"
                onClick={() => store.refresh()}
                title="Refresh files"
              >
                <RefreshIcon />
              </button>
            </div>
          </>
        }
      >
        {/* Expanded state */}
        <div class="flex items-center justify-between px-4 py-3 border-b border-treq-border-light dark:border-treq-dark-border-light">
          <h2 class="text-xs font-medium uppercase tracking-wide text-treq-text-muted m-0 dark:text-treq-dark-text-muted">
            Workspace
          </h2>
          <div class="flex items-center gap-1">
            <button
              class="flex items-center justify-center w-7 h-7 p-0 bg-transparent border border-transparent rounded-treq text-treq-text-muted cursor-pointer transition-all duration-150 hover:text-treq-accent dark:text-treq-dark-text-muted dark:hover:text-treq-accent"
              onClick={() => store.refresh()}
              title="Refresh files"
            >
              <RefreshIcon />
            </button>
            <button
              class="flex items-center justify-center w-7 h-7 p-0 bg-transparent border border-transparent rounded-treq text-treq-text-muted cursor-pointer transition-all duration-150 hover:text-treq-accent dark:text-treq-dark-text-muted dark:hover:text-treq-accent"
              onClick={props.onToggle}
              title="Collapse sidebar"
            >
              <CollapseIcon />
            </button>
          </div>
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
      </Show>
    </aside>
  );
}
