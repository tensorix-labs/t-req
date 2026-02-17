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
      class="explorer-row"
      classList={{
        'is-selected': props.isSelected,
        'is-dir': isDir(),
        'is-file': !isDir()
      }}
      style={{ '--depth': String(node().depth) }}
      onClick={activate}
      onKeyDown={onKeyDown}
    >
      <Show
        when={isDir()}
        fallback={<span class="explorer-chevron-placeholder" aria-hidden="true" />}
      >
        <span
          class="explorer-chevron"
          classList={{ 'is-expanded': isExpanded() }}
          aria-hidden="true"
        >
          <ChevronRightIcon />
        </span>
      </Show>

      <span class="explorer-icon" aria-hidden="true">
        <Show when={isDir()} fallback={<FileIcon class="explorer-icon-file" />}>
          <Show when={isExpanded()} fallback={<FolderClosedIcon class="explorer-icon-folder" />}>
            <FolderOpenIcon class="explorer-icon-folder" />
          </Show>
        </Show>
      </span>

      <span class="explorer-name">{node().name}</span>

      <Show when={!isDir() && (node().requestCount ?? 0) > 0}>
        <span class="explorer-count">{node().requestCount}</span>
      </Show>
    </div>
  );
}
