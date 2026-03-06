import type { ScrollBoxRenderable } from '@opentui/core';
import { createSignal, For, Show } from 'solid-js';
import { useScrollToIndex } from '../hooks';
import type { FlatNode } from '../store';
import { rgba, theme } from '../theme';

export interface FileTreeProps {
  nodes: FlatNode[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onToggle: (path: string) => void;
}

export function FileTree(props: FileTreeProps) {
  const [scrollRef, setScrollRef] = createSignal<ScrollBoxRenderable | undefined>(undefined);

  useScrollToIndex({
    scrollRef,
    selectedIndex: () => props.selectedIndex,
    itemCount: () => props.nodes.length
  });

  return (
    <box
      flexGrow={1}
      flexShrink={0}
      flexDirection="column"
      backgroundColor={rgba(theme.backgroundPanel)}
    >
      <scrollbox
        ref={(r) => {
          setScrollRef(r);
        }}
        flexGrow={1}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
      >
        <Show
          when={props.nodes.length > 0}
          fallback={
            <box id="empty-state" paddingLeft={2}>
              <text fg={rgba(theme.textMuted)}>No files found</text>
            </box>
          }
        >
          <For each={props.nodes}>
            {(flatNode, index) => (
              <FileTreeRow
                id={`file-${index()}`}
                flatNode={flatNode}
                isSelected={index() === props.selectedIndex}
                onSelect={() => props.onSelect(index())}
                onToggle={() => props.onToggle(flatNode.node.path)}
              />
            )}
          </For>
        </Show>
      </scrollbox>
    </box>
  );
}

interface FileTreeRowProps {
  id: string;
  flatNode: FlatNode;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}

function FileTreeRow(props: FileTreeRowProps) {
  const { node, isExpanded } = props.flatNode;
  const indent = '  '.repeat(node.depth);

  // Icon for directories (expanded/collapsed) and file types
  const icon = () => {
    if (node.isDir) {
      return isExpanded ? '\u25BC ' : '> ';
    }
    // Show different icons for file types
    if (node.fileType === 'test') {
      return '\u2713 '; // ✓ for test files
    }
    if (node.fileType === 'script') {
      return '\u25B7 '; // ▷ for runnable scripts
    }
    return '  '; // HTTP and other files have no icon, just spacing
  };

  // Display name with trailing / for directories
  const displayName = () => {
    if (node.isDir) {
      return `${node.name}/`;
    }
    return node.name;
  };

  // Badge for files - request count for HTTP files, nothing for scripts
  const badge = () => {
    if (
      !node.isDir &&
      node.fileType === 'http' &&
      node.requestCount !== undefined &&
      node.requestCount > 0
    ) {
      return ` (${node.requestCount})`;
    }
    return '';
  };

  // Colors based on selection state
  const bgColor = () => (props.isSelected ? rgba(theme.secondary) : undefined);
  const textColor = () => (props.isSelected ? rgba(theme.background) : rgba(theme.text));
  const iconColor = () => (props.isSelected ? rgba(theme.background) : rgba(theme.primary));
  const badgeColor = () => (props.isSelected ? rgba(theme.background) : rgba(theme.textMuted));

  return (
    <box
      id={props.id}
      height={1}
      flexShrink={0}
      flexDirection="row"
      backgroundColor={bgColor()}
      paddingLeft={1}
      paddingRight={1}
    >
      <text fg={textColor()}>{indent}</text>
      <text fg={iconColor()}>{icon()}</text>
      <text fg={textColor()}>{displayName()}</text>
      <Show when={badge()}>
        <text fg={badgeColor()}>{badge()}</text>
      </Show>
    </box>
  );
}
