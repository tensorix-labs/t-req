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
          class="text-sm text-treq-text-muted dark:text-treq-dark-text-muted"
        >
          Profile:
        </label>
        <select
          id="profile-select"
          class="px-2 py-1 text-sm rounded border border-treq-border-light dark:border-treq-dark-border-light bg-treq-surface dark:bg-treq-dark-surface text-treq-text dark:text-treq-dark-text focus:outline-none focus:ring-1 focus:ring-treq-primary"
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
