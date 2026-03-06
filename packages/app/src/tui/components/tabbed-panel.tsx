import type { JSX } from 'solid-js';
import { createMemo, Match, Switch } from 'solid-js';
import { TabBar, type TabBarTab } from '../layouts';
import { rgba, theme } from '../theme';

export type LeftPanelTab = 'files' | 'executions';

export interface TabbedPanelProps {
  activeTab: LeftPanelTab;
  executionsCount?: number;
  filesContent: JSX.Element;
  executionsContent: JSX.Element;
}

export function TabbedPanel(props: TabbedPanelProps) {
  const tabs = createMemo<TabBarTab[]>(() => {
    const executionCount = props.executionsCount ?? 0;

    return [
      { id: 'files', label: 'Files' },
      {
        id: 'executions',
        label: executionCount > 0 ? `Executions (${executionCount})` : 'Executions'
      }
    ];
  });

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      overflow="hidden"
      backgroundColor={rgba(theme.backgroundPanel)}
    >
      <TabBar tabs={tabs()} activeTab={props.activeTab} />
      <box flexGrow={1} overflow="hidden">
        <Switch>
          <Match when={props.activeTab === 'files'}>{props.filesContent}</Match>
          <Match when={props.activeTab === 'executions'}>{props.executionsContent}</Match>
        </Switch>
      </box>
    </box>
  );
}
