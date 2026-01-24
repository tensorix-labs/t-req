import { Show } from 'solid-js';
import { useWorkspace } from '../../context';
import { SpinnerIcon } from '../icons';
import { getDefaultServerUrl } from '../../sdk';

export function ConnectionScreen() {
  const store = useWorkspace();

  return (
    <main class="flex-1 flex items-center justify-center p-8">
      <div class="text-center max-w-[480px]">
        <Show when={store.connectionStatus() === 'connecting'}>
          <div class="flex items-center justify-center gap-3 text-treq-text-muted dark:text-treq-dark-text-muted">
            <SpinnerIcon />
            <span>Connecting to server...</span>
          </div>
        </Show>

        <Show when={store.connectionStatus() === 'error'}>
          <p class="text-sm text-http-delete m-0 mb-4 px-4 py-3 bg-http-delete/10 rounded-treq">
            {store.error()}
          </p>
          <button
            class="text-sm font-medium px-4 py-2.5 bg-treq-accent border-none rounded-treq text-white cursor-pointer transition-colors hover:bg-treq-accent-light"
            onClick={() => store.connect(getDefaultServerUrl())}
          >
            Retry Connection
          </button>
        </Show>

        <Show when={store.connectionStatus() === 'disconnected'}>
          <p class="text-sm text-treq-text-muted m-0 mb-3 dark:text-treq-dark-text-muted">
            Start the t-req server:
          </p>
          <code class="inline-block font-mono text-sm px-4 py-3 bg-treq-bg-card border border-treq-border-light rounded-treq text-treq-text-strong dark:bg-treq-dark-bg-card dark:border-treq-dark-border-light dark:text-treq-dark-text-strong">
            treq serve
          </code>
        </Show>
      </div>
    </main>
  );
}
