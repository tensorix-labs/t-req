import { For } from 'solid-js';
import type { ExplorerFlatNode } from '../types';
import { ExplorerTreeItem } from './ExplorerTreeItem';

type ExplorerTreeProps = {
  items: ExplorerFlatNode[];
  selectedPath?: string;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
};

export function ExplorerTree(props: ExplorerTreeProps) {
  return (
    <div class="explorer-tree" role="tree" aria-label="Workspace files">
      <For each={props.items}>
        {(item) => (
          <ExplorerTreeItem
            item={item}
            isSelected={props.selectedPath === item.node.path}
            onToggleDir={props.onToggleDir}
            onSelectFile={props.onSelectFile}
          />
        )}
      </For>
    </div>
  );
}
