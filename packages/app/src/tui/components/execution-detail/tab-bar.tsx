import { For } from 'solid-js';
import { rgba, theme } from '../../theme';
import { DETAIL_TABS, type DetailTab } from './types';

export interface DetailTabBarProps {
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
}

export function DetailTabBar(props: DetailTabBarProps) {
  return (
    <box flexDirection="row" paddingLeft={2} marginBottom={1} flexShrink={0} height={1}>
      <For each={DETAIL_TABS}>
        {(tab, index) => (
          <text
            fg={rgba(props.activeTab === tab.id ? theme.primary : theme.textMuted)}
            attributes={props.activeTab === tab.id ? 1 : 0}
          >
            {index() > 0 ? ' ' : ''}
            {tab.label} ({tab.shortcut})
          </text>
        )}
      </For>
    </box>
  );
}
