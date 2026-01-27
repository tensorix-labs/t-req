import { Show } from 'solid-js';
import type { FlatNode } from '../../stores/workspace';
import { ChevronIcon, FolderIcon, FileIcon, PlayIcon } from '../icons';

// File extensions that are considered scripts
const SCRIPT_EXTENSIONS = ['.js', '.ts', '.mjs', '.mts', '.py'];

function isScriptFile(path: string): boolean {
  return SCRIPT_EXTENSIONS.some((ext) => path.endsWith(ext));
}

interface FileTreeItemProps {
  flatNode: FlatNode;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onRunScript?: (path: string) => void;
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
    const base = 'flex items-center gap-1 py-1.5 pr-3 cursor-pointer rounded transition-colors outline-none';
    const hover = 'hover:bg-treq-border-light dark:hover:bg-treq-dark-border-light';
    const focus = 'focus-visible:outline-2 focus-visible:outline-treq-accent focus-visible:-outline-offset-2';
    const selected = props.isSelected
      ? 'bg-treq-accent text-white hover:bg-treq-accent-light'
      : '';
    return `${base} ${hover} ${focus} ${selected}`;
  };

  const chevronClasses = () => {
    const base = 'flex items-center justify-center w-3 h-3 transition-transform';
    const color = props.isSelected ? 'text-white' : 'text-treq-text-muted dark:text-treq-dark-text-muted';
    const rotation = isExpanded ? 'rotate-90' : '';
    return `${base} ${color} ${rotation}`;
  };

  const iconClasses = () => {
    if (props.isSelected) return 'flex items-center justify-center w-4 h-4 mr-1 text-white';
    if (node.isDir) return 'flex items-center justify-center w-4 h-4 mr-1 text-treq-accent';
    return 'flex items-center justify-center w-4 h-4 mr-1 text-treq-text-muted dark:text-treq-dark-text-muted';
  };

  const badgeClasses = () => {
    const base = 'text-xs px-1.5 py-0.5 rounded-full';
    if (props.isSelected) return `${base} bg-white/20 text-white`;
    return `${base} bg-treq-border-light text-treq-text-muted dark:bg-treq-dark-border-light dark:text-treq-dark-text-muted`;
  };

  const handleRunClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (props.onRunScript && !node.isDir && isScriptFile(node.path)) {
      props.onRunScript(node.path);
    }
  };

  const showRunButton = !node.isDir && isScriptFile(node.path) && props.onRunScript;

  return (
    <div
      class={`${itemClasses()} group`}
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
        <Show when={node.isDir} fallback={<FileIcon />}>
          <FolderIcon open={isExpanded} />
        </Show>
      </span>

      <span class="flex-1 text-sm whitespace-nowrap overflow-hidden text-ellipsis">{node.name}</span>

      <Show when={!node.isDir && node.requestCount !== undefined}>
        <span class={badgeClasses()}>{node.requestCount}</span>
      </Show>

      <Show when={showRunButton}>
        <button
          type="button"
          onClick={handleRunClick}
          class={`opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded transition-opacity ${
            props.isSelected
              ? 'text-white hover:bg-white/20'
              : 'text-treq-accent hover:bg-treq-accent/10'
          }`}
          title="Run script"
        >
          <PlayIcon />
        </button>
      </Show>
    </div>
  );
}
