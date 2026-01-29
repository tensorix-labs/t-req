import { Show, createSignal, createEffect } from 'solid-js';
import { Portal } from 'solid-js/web';
import { useObserver } from '../context';

export function Toast() {
  const observer = useObserver();
  const [isVisible, setIsVisible] = createSignal(false);

  const error = () => observer.state.executeError;

  createEffect(() => {
    if (error()) {
      // Trigger slide-in animation
      setTimeout(() => setIsVisible(true), 10);
    } else {
      setIsVisible(false);
    }
  });

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => observer.setState('executeError', undefined), 150);
  };

  return (
    <Portal>
      <Show when={error()}>
        <div
          class="fixed bottom-4 right-4 max-w-md p-4 bg-http-delete text-white rounded-treq shadow-xl z-50 transition-all duration-150"
          classList={{
            'translate-x-0 opacity-100': isVisible(),
            'translate-x-4 opacity-0': !isVisible()
          }}
        >
          <div class="flex items-start gap-3">
            <div class="flex-1">
              <p class="font-semibold m-0">Request Failed</p>
              <p class="text-sm opacity-90 mt-1 m-0">{error()}</p>
            </div>
            <button
              onClick={handleDismiss}
              class="text-white/70 hover:text-white transition-colors duration-150 p-1 -m-1"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      </Show>
    </Portal>
  );
}
