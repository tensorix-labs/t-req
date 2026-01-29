import { Show } from 'solid-js';
import type { FlatNode } from '../../stores/workspace';
import { ChevronIcon, FolderIcon, FileIcon, HttpFileIcon, ScriptFileIcon } from '../icons';

function getFileIcon(filename: string) {
  if (filename.endsWith('.http')) {
    return <HttpFileIcon />;
  }
  if (filename.endsWith('.ts') || filename.endsWith('.js') || filename.endsWith('.mjs') || filename.endsWith('.cjs')) {
    return <ScriptFileIcon />;
  }
  return <FileIcon />;
}

interface FileTreeItemProps {
  flatNode: FlatNode;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}

export function FileTreeItem(props: FileTreeItemProps) {
  const { node, isExpanded } = props.flatNode;

  const handleClick = () => {
    if (node.isDir) {
      props.onToggle();
    } else {
      props.onSelect();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const itemClasses = () => {
    const base = 'flex items-center gap-1 py-1.5 pr-3 cursor-pointer rounded-treq transition-all duration-150 outline-none';
    const hover = 'hover:text-treq-accent dark:hover:text-treq-accent';
    const focus = 'focus-visible:outline-2 focus-visible:outline-treq-accent focus-visible:-outline-offset-2';
    const selected = props.isSelected
      ? 'text-treq-accent font-medium'
      : 'text-treq-text dark:text-treq-dark-text';
    return `${base} ${hover} ${focus} ${selected}`;
  };

  const chevronClasses = () => {
    const base = 'flex items-center justify-center w-3 h-3 transition-transform duration-150';
    const color = props.isSelected ? 'text-treq-accent' : 'text-treq-text-muted dark:text-treq-dark-text-muted';
    const rotation = isExpanded ? 'rotate-90' : '';
    return `${base} ${color} ${rotation}`;
  };

  const iconClasses = () => {
    if (props.isSelected) return 'flex items-center justify-center w-4 h-4 mr-1 text-treq-accent';
    if (node.isDir && isExpanded) return 'flex items-center justify-center w-4 h-4 mr-1 text-treq-accent';
    if (node.isDir) return 'flex items-center justify-center w-4 h-4 mr-1 text-treq-text-muted dark:text-treq-dark-text-muted';
    return 'flex items-center justify-center w-4 h-4 mr-1 text-treq-text-muted dark:text-treq-dark-text-muted';
  };

  return (
    <div
      class={itemClasses()}
      style={{ 'padding-left': `calc(0.75rem + ${node.depth}rem)` }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="treeitem"
      aria-selected={props.isSelected}
      aria-expanded={node.isDir ? isExpanded : undefined}
    >
      <Show when={node.isDir}>
        <span class={chevronClasses()}>
          <ChevronIcon />
        </span>
      </Show>

      <span class={iconClasses()}>
        <Show when={node.isDir} fallback={getFileIcon(node.name)}>
          <FolderIcon open={isExpanded} />
        </Show>
      </span>

      <span class="flex-1 text-sm whitespace-nowrap overflow-hidden text-ellipsis min-w-0">{node.name}</span>
    </div>
  );
}
