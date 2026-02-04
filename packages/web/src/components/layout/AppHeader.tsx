import { createSignal, Show } from 'solid-js';
import { useWorkspace } from '../../context';
import { ProfileSelector } from '../ProfileSelector';
import { SettingsIcon } from '../icons';
import { EnvironmentManager } from '../environment';

export function AppHeader() {
  const store = useWorkspace();
  const [showEnvironment, setShowEnvironment] = createSignal(false);

  const statusDotClasses = () => {
    const base = 'w-2 h-2 rounded-full';
    switch (store.connectionStatus()) {
      case 'connected':
        return `${base} bg-http-get`;
      case 'connecting':
        return `${base} bg-http-put animate-pulse`;
      case 'error':
      case 'disconnected':
        return `${base} bg-http-delete`;
      default:
        return `${base} bg-treq-text-muted`;
    }
  };

  return (
    <header class="sticky top-0 z-50 flex justify-between items-center px-6 py-4 bg-white/90 dark:bg-treq-dark-bg/90 backdrop-blur-sm border-b border-treq-border-light dark:border-treq-dark-border-light shadow-sm">
      <div class="flex items-center gap-6">
        <div class="flex items-center gap-2">
          <img src="/logo.jpg" alt="t-req" class="h-7" />
          <span class="text-[0.625rem] font-semibold px-1.5 py-0.5 rounded-full bg-treq-accent/15 text-treq-accent uppercase tracking-wide">beta</span>
        </div>
        <ProfileSelector />
      </div>
      <div class="flex items-center gap-4 text-sm text-treq-text-muted dark:text-treq-dark-text-muted">
        <Show when={store.connectionStatus() === 'connected'}>
          <button
            type="button"
            class="p-2 rounded-treq text-treq-text-muted dark:text-treq-dark-text-muted hover:bg-treq-border-light dark:hover:bg-treq-dark-border-light hover:text-treq-text-strong dark:hover:text-treq-dark-text-strong transition-colors"
            onClick={() => setShowEnvironment(true)}
            aria-label="Environment settings"
            title="Environment settings"
          >
            <SettingsIcon />
          </button>
        </Show>
        <div class="flex items-center gap-2">
          <span class={statusDotClasses()} />
          <span>{store.connectionStatus()}</span>
        </div>
      </div>

      <Show when={showEnvironment()}>
        <EnvironmentManager onClose={() => setShowEnvironment(false)} />
      </Show>
    </header>
  );
}
