import { Show } from 'solid-js';

interface ErrorBannerProps {
  message: () => string | undefined;
}

export function ErrorBanner(props: ErrorBannerProps) {
  return (
    <Show when={props.message()}>
      {(message) => (
        <div class="rounded-box border border-error/35 bg-error/10 px-2 py-1.5 text-xs text-base-content">
          {message()}
        </div>
      )}
    </Show>
  );
}
