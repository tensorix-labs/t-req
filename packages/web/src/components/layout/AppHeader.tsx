import { useWorkspace } from '../../context';
import { ProfileSelector } from '../ProfileSelector';

export function AppHeader() {
  const store = useWorkspace();

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
    <header class="flex justify-between items-center px-6 py-4 border-b border-treq-border-light dark:border-treq-dark-border-light">
      <div class="flex items-center gap-6">
        <div class="flex items-baseline font-mono font-semibold">
          <span class="text-xl text-treq-text-strong dark:text-treq-dark-text-strong">t-req</span>
        </div>
        <ProfileSelector />
      </div>
      <div class="flex items-center gap-2 text-sm text-treq-text-muted dark:text-treq-dark-text-muted">
        <span class={statusDotClasses()} />
        <span>{store.connectionStatus()}</span>
      </div>
    </header>
  );
}
