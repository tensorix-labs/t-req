import type { ScrollBoxRenderable } from '@opentui/core';
import { createEffect, createSignal, For, Show } from 'solid-js';
import { useScrollToIndex } from '../hooks';
import type { ExecutionStatus, ExecutionSummary } from '../observer-store';
import { getMethodColor, rgba, theme } from '../theme';
import { formatDuration } from '../util/format';

export interface ExecutionListProps {
  executions: ExecutionSummary[];
  selectedId?: string;
  onSelect: (id: string) => void;
  isRunning: boolean;
}

/**
 * Get status icon and color for an execution status.
 */
function getStatusDisplay(status: ExecutionStatus): { icon: string; color: string } {
  switch (status) {
    case 'pending':
      return { icon: '\u25CB', color: theme.textMuted }; // ○
    case 'running':
      return { icon: '\u25D4', color: theme.warning }; // ◔
    case 'success':
      return { icon: '\u2713', color: theme.success }; // ✓
    case 'failed':
      return { icon: '\u2717', color: theme.error }; // ✗
  }
}

export function ExecutionList(props: ExecutionListProps) {
  const [scrollRef, setScrollRef] = createSignal<ScrollBoxRenderable | undefined>(undefined);

  useScrollToIndex({
    scrollRef,
    selectedIndex: () => {
      const id = props.selectedId;
      if (!id) return -1;
      return props.executions.findIndex((e) => e.reqExecId === id);
    },
    itemCount: () => props.executions.length
  });

  // Auto-scroll to bottom when new executions arrive (if running)
  createEffect(() => {
    const ref = scrollRef();
    if (!ref || !props.isRunning) return;
    const len = props.executions.length;
    if (len > 0) {
      ref.scrollTo(len - 1);
    }
  });

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      overflow="hidden"
      backgroundColor={rgba(theme.backgroundPanel)}
    >
      <box
        paddingLeft={2}
        paddingTop={1}
        paddingBottom={1}
        flexDirection="row"
        justifyContent="space-between"
      >
        <text fg={rgba(theme.primary)} attributes={1}>
          Executions
        </text>
        <Show when={props.isRunning}>
          <text fg={rgba(theme.warning)}> Running...</text>
        </Show>
      </box>
      <scrollbox
        ref={(r) => {
          setScrollRef(r);
        }}
        flexGrow={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Show
          when={props.executions.length > 0}
          keyed
          fallback={
            <box id="empty-state" paddingLeft={2}>
              <text fg={rgba(theme.textMuted)}>
                {props.isRunning ? 'Waiting for requests...' : 'No executions yet'}
              </text>
            </box>
          }
        >
          {() => (
            <For each={props.executions}>
              {(execution, index) => (
                <ExecutionRow
                  id={`exec-${index()}`}
                  execution={execution}
                  isSelected={execution.reqExecId === props.selectedId}
                  onSelect={() => props.onSelect(execution.reqExecId)}
                />
              )}
            </For>
          )}
        </Show>
      </scrollbox>
    </box>
  );
}

interface ExecutionRowProps {
  id: string;
  execution: ExecutionSummary;
  isSelected: boolean;
  onSelect: () => void;
}

function ExecutionRow(props: ExecutionRowProps) {
  const statusDisplay = () => getStatusDisplay(props.execution.status);
  const duration = () => formatDuration(props.execution.timing.durationMs);

  // Display label: prefer reqLabel, fallback to urlResolved or urlTemplate
  const label = () => {
    if (props.execution.reqLabel) return props.execution.reqLabel;
    if (props.execution.urlResolved) return props.execution.urlResolved;
    if (props.execution.urlTemplate) return props.execution.urlTemplate;
    return 'Unknown';
  };

  // Colors based on selection
  const bgColor = () => (props.isSelected ? rgba(theme.secondary) : undefined);
  const textColor = () => (props.isSelected ? rgba(theme.background) : rgba(theme.text));
  const mutedColor = () => (props.isSelected ? rgba(theme.background) : rgba(theme.textMuted));
  const statusColor = () =>
    props.isSelected ? rgba(theme.background) : rgba(statusDisplay().color);
  const methodColor = () =>
    props.isSelected
      ? rgba(theme.background)
      : rgba(getMethodColor(props.execution.method ?? 'GET'));

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
      <text fg={statusColor()}>{statusDisplay().icon} </text>
      <text fg={methodColor()} attributes={1}>
        {(props.execution.method ?? '???').toUpperCase().padEnd(6)}
      </text>
      <text fg={textColor()}>{label()}</text>
      <Show when={duration()}>
        <text fg={mutedColor()}> ({duration()})</text>
      </Show>
    </box>
  );
}
