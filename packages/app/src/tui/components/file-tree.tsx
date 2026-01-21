import { For, Show, createEffect } from 'solid-js';
import type { ScrollBoxRenderable } from '@opentui/core';
import type { FlatNode } from '../store';
import { theme, rgba } from '../theme';

export interface FileTreeProps {
  nodes: FlatNode[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onToggle: (path: string) => void;
}

export function FileTree(props: FileTreeProps) {
  let scrollRef: ScrollBoxRenderable | undefined;

  // Scroll to selection when it changes
  createEffect(() => {
    const idx = props.selectedIndex;
    if (!scrollRef || idx < 0) return;

    const children = scrollRef.getChildren();
    const target = children.find((c) => c.id === `file-${idx}`);
    if (target) {
      // Calculate if target is visible in scroll viewport
      const targetY = target.y - scrollRef.y;
      const viewportHeight = scrollRef.height;
      if (targetY < 0 || targetY >= viewportHeight) {
        // scrollTo takes a single position object or number (for y)
        scrollRef.scrollTo({ x: 0, y: target.y - scrollRef.y });
      }
    }
  });

  return (
    <box flexGrow={1} flexDirection="column" backgroundColor={rgba(theme.backgroundPanel)}>
      <box paddingLeft={2} paddingTop={1} paddingBottom={1}>
        <text fg={rgba(theme.primary)} attributes={1}>
          Files
        </text>
      </box>
      <scrollbox ref={(r) => (scrollRef = r)} flexGrow={1} paddingLeft={1} paddingRight={1}>
        <Show
          when={props.nodes.length > 0}
          fallback={
            <box id="empty-state" paddingLeft={2}>
              <text fg={rgba(theme.textMuted)}>No .http files found</text>
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

  // Icon for directories (expanded/collapsed)
  const icon = () => {
    if (node.isDir) {
      return isExpanded ? '\u25BC ' : '> ';
    }
    return '  '; // File has no icon, just spacing
  };

  // Display name with trailing / for directories
  const displayName = () => {
    if (node.isDir) {
      return node.name + '/';
    }
    return node.name;
  };

  // Request count badge for files
  const badge = () => {
    if (!node.isDir && node.requestCount !== undefined && node.requestCount > 0) {
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
