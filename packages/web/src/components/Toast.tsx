import { Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { useObserver } from '../context';

export function Toast() {
  const observer = useObserver();

  const error = () => observer.state.executeError;

  const handleDismiss = () => {
    observer.setState('executeError', undefined);
  };

  return (
    <Portal>
      <Show when={error()}>
        <div class="fixed bottom-4 right-4 max-w-md p-4 bg-http-delete text-white rounded-lg shadow-lg z-50">
          <div class="flex items-start gap-3">
            <div class="flex-1">
              <p class="font-medium">Request Failed</p>
              <p class="text-sm opacity-90 mt-1">{error()}</p>
            </div>
            <button
              onClick={handleDismiss}
              class="text-white/70 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      </Show>
    </Portal>
  );
}
