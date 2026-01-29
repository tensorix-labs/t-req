import { For, Show } from 'solid-js';
import { useWorkspace } from '../context';

export function ProfileSelector() {
  const store = useWorkspace();

  const handleChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    const value = target.value;
    store.setActiveProfile(value === '' ? undefined : value);
  };

  return (
    <Show when={store.availableProfiles().length > 0}>
      <div class="flex items-center gap-2">
        <label
          for="profile-select"
          class="text-xs font-medium uppercase tracking-wide text-treq-text-muted dark:text-treq-dark-text-muted"
        >
          Profile
        </label>
        <select
          id="profile-select"
          class="px-3 py-1.5 text-sm rounded-treq border border-treq-border-light dark:border-treq-dark-border-light bg-white dark:bg-treq-dark-bg-card text-treq-text-strong dark:text-treq-dark-text-strong focus:outline-none focus:ring-2 focus:ring-treq-accent focus:border-treq-accent transition-all duration-150 cursor-pointer"
          value={store.activeProfile() ?? ''}
          onChange={handleChange}
        >
          <option value="">None (default)</option>
          <For each={store.availableProfiles()}>
            {(profile) => <option value={profile}>{profile}</option>}
          </For>
        </select>
      </div>
    </Show>
  );
}
