import { For } from 'solid-js';
import type { AppTab } from '../types';

type TabBarProps = {
  activeTab: AppTab;
  onTabSelect: (tab: AppTab) => void;
};

const TABS: Array<{ id: AppTab; label: string }> = [
  { id: 'body', label: 'Body' },
  { id: 'headers', label: 'Headers' },
  { id: 'plugins', label: 'Plugins' }
];

export function TabBar(props: TabBarProps) {
  return (
    <div class="tabs">
      <For each={TABS}>
        {(tab) => (
          <button
            class="tab-btn"
            classList={{ active: props.activeTab === tab.id }}
            data-tab={tab.id}
            type="button"
            onClick={() => props.onTabSelect(tab.id)}
          >
            {tab.label}
          </button>
        )}
      </For>
    </div>
  );
}
