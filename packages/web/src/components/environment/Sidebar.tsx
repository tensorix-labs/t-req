import { Show, For } from 'solid-js';
import type { SectionType, NavItem } from './types';
import { NAV_ITEMS } from './constants';

export interface SidebarProps {
  activeSection: SectionType;
  onSectionChange: (section: SectionType) => void;
  previewProfile: string | undefined;
  onProfileChange: (profile: string | undefined) => void;
  availableProfiles: string[];
  pluginCount?: number;
}

function ProfileSelector(props: {
  value: string | undefined;
  options: string[];
  onChange: (value: string | undefined) => void;
}) {
  const handleChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    props.onChange(target.value === '' ? undefined : target.value);
  };

  return (
    <div class="p-4 border-b border-treq-border-light dark:border-treq-dark-border-light">
      <Show
        when={props.options.length > 0}
        fallback={
          <span class="text-sm text-treq-text-muted dark:text-treq-dark-text-muted">
            No profiles
          </span>
        }
      >
        <select
          class="w-full px-3 py-2 text-sm rounded-lg border border-treq-border-light dark:border-treq-dark-border-light bg-white dark:bg-treq-dark-bg text-treq-text-strong dark:text-treq-dark-text-strong focus:outline-none focus:ring-2 focus:ring-treq-accent"
          value={props.value ?? ''}
          onChange={handleChange}
        >
          <option value="">None (default)</option>
          <For each={props.options}>
            {(profile) => <option value={profile}>{profile}</option>}
          </For>
        </select>
      </Show>
    </div>
  );
}

function NavButton(props: {
  item: NavItem;
  isActive: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      classList={{
        'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors': true,
        'bg-treq-accent/10 text-treq-accent': props.isActive,
        'text-treq-text-muted dark:text-treq-dark-text-muted hover:bg-treq-border-light dark:hover:bg-treq-dark-border-light hover:text-treq-text-strong dark:hover:text-treq-dark-text-strong': !props.isActive,
      }}
      onClick={props.onClick}
    >
      <props.item.icon />
      <span>{props.item.label}</span>
      <Show when={props.badge !== undefined && props.badge > 0}>
        <span class="ml-auto text-xs px-1.5 py-0.5 rounded-full bg-treq-border-light dark:bg-treq-dark-border-light">
          {props.badge}
        </span>
      </Show>
    </button>
  );
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside class="w-56 border-r border-treq-border-light dark:border-treq-dark-border-light bg-slate-50/50 dark:bg-treq-dark-bg-card/50 flex flex-col">
      <ProfileSelector
        value={props.previewProfile}
        options={props.availableProfiles}
        onChange={props.onProfileChange}
      />

      <nav class="flex-1 p-3 flex flex-col gap-1">
        <For each={NAV_ITEMS}>
          {(item) => (
            <NavButton
              item={item}
              isActive={props.activeSection === item.id}
              badge={item.id === 'plugins' ? props.pluginCount : undefined}
              onClick={() => props.onSectionChange(item.id)}
            />
          )}
        </For>
      </nav>
    </aside>
  );
}
