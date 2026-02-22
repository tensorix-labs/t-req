import { Show } from 'solid-js';
import type { ExplorerFlatNode } from '../types';
import { ChevronRightIcon, FileIcon, FolderClosedIcon, FolderOpenIcon } from './icons';

type ExplorerTreeItemProps = {
  item: ExplorerFlatNode;
  isSelected: boolean;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
};

export function ExplorerTreeItem(props: ExplorerTreeItemProps) {
  const node = () => props.item.node;
  const isDir = () => node().isDir;
  const isExpanded = () => props.item.isExpanded;

  const activate = () => {
    if (isDir()) {
      props.onToggleDir(node().path);
      return;
    }
    props.onSelectFile(node().path);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  };

  return (
    <div
      role="treeitem"
      tabIndex={0}
      aria-selected={props.isSelected}
      aria-expanded={isDir() ? isExpanded() : undefined}
      class="group flex min-h-[29px] cursor-pointer select-none items-center gap-1.5 pr-3.5 pl-[calc(10px+(var(--depth)*16px))] font-mono text-[13px] leading-none text-[var(--app-tree-text)] hover:bg-[var(--app-row-hover)] focus-visible:outline-2 focus-visible:outline-[var(--app-focus)] focus-visible:outline-offset-[-2px]"
      classList={{
        'bg-[var(--app-row-selected)] text-[var(--app-row-selected-text)]': props.isSelected
      }}
      style={{ '--depth': String(node().depth) }}
      onClick={activate}
      onKeyDown={onKeyDown}
    >
      <Show when={isDir()} fallback={<span class="h-3 w-3" aria-hidden="true" />}>
        <span
          class="inline-flex h-3 w-3 items-center justify-center text-[var(--app-chevron)] transition-transform duration-150"
          classList={{ 'rotate-90': isExpanded() }}
          aria-hidden="true"
        >
          <ChevronRightIcon />
        </span>
      </Show>

      <span class="inline-flex h-3.5 w-3.5 items-center justify-center" aria-hidden="true">
        <Show when={isDir()} fallback={<FileIcon class="h-3.5 w-3.5 text-[var(--app-file)]" />}>
          <Show
            when={isExpanded()}
            fallback={<FolderClosedIcon class="h-3.5 w-3.5 text-[var(--app-folder)]" />}
          >
            <FolderOpenIcon class="h-3.5 w-3.5 text-[var(--app-folder)]" />
          </Show>
        </Show>
      </span>

      <span
        class="min-w-0 flex-1 truncate"
        classList={{
          'text-[var(--app-tree-dir)] font-[540]': isDir() && !props.isSelected,
          'text-[var(--app-tree-file)] font-[460] group-hover:text-[var(--app-tree-file-hover)]':
            !isDir() && !props.isSelected,
          'text-[var(--app-tree-selected-text)]': props.isSelected
        }}
      >
        {node().name}
      </span>

      <Show when={!isDir() && (node().requestCount ?? 0) > 0}>
        <span class="rounded-full border border-[var(--app-count-border)] bg-[var(--app-count-bg)] px-1.5 py-px text-[11px] leading-[1.2] text-[var(--app-count-text)]">
          {node().requestCount}
        </span>
      </Show>
    </div>
  );
}
