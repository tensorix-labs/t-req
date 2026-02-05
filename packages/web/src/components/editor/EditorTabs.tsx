import { For, Show } from 'solid-js';
import { useWorkspace } from '../../context/workspace';
import { CloseIcon } from '../icons';

export function EditorTabs() {
  const store = useWorkspace();

  const handleTabClick = (path: string) => {
    store.setActiveFile(path);
  };

  const handleClose = (e: MouseEvent, path: string) => {
    e.stopPropagation();
    if (store.hasUnsavedChanges(path)) {
      const confirmed = window.confirm(
        `"${path.split('/').pop()}" has unsaved changes. Close anyway?`
      );
      if (!confirmed) return;
    }
    store.closeFile(path);
  };

  return (
    <div class="flex items-center border-b border-treq-border dark:border-treq-dark-border bg-treq-surface dark:bg-treq-dark-surface overflow-x-auto">
      <For each={store.openFiles()}>
        {(path) => (
          <div
            class={`flex items-center gap-2 px-3 py-2 cursor-pointer border-r border-treq-border dark:border-treq-dark-border min-w-0 max-w-[200px] ${
              store.activeFile() === path
                ? 'bg-treq-bg dark:bg-treq-dark-bg text-treq-accent'
                : 'text-treq-text dark:text-treq-dark-text hover:bg-treq-bg/50'
            }`}
            onClick={() => handleTabClick(path)}
          >
            <span class="text-sm truncate flex-1">{path.split('/').pop()}</span>
            <Show when={store.hasUnsavedChanges(path)}>
              <span class="w-2 h-2 rounded-full bg-treq-accent flex-shrink-0" />
            </Show>
            <button
              class="p-0.5 hover:bg-treq-border dark:hover:bg-treq-dark-border rounded flex-shrink-0"
              onClick={(e) => handleClose(e, path)}
              title="Close tab"
            >
              <span class="w-3 h-3 block">
                <CloseIcon />
              </span>
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
