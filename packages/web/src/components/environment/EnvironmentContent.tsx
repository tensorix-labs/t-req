import { Show, type JSX } from 'solid-js';

export interface EnvironmentContentProps {
  /** Whether content is loading */
  loading: boolean;
  /** Error if loading failed */
  error: Error | undefined;
  /** Callback to retry loading */
  onRetry: () => void;
  /** Content to render when not loading and no error */
  children: JSX.Element;
}


export function EnvironmentContent(props: EnvironmentContentProps): JSX.Element {
  return (
    <Show
      when={!props.loading && !props.error}
      fallback={
        <Show
          when={props.error}
          fallback={
            <div class="flex items-center justify-center py-12 text-treq-text-muted">
              Loading...
            </div>
          }
        >
          <div class="flex flex-col items-center justify-center py-12 gap-4">
            <div class="px-4 py-3 bg-http-delete/10 text-http-delete text-sm rounded-treq">
              Failed to load configuration
            </div>
            <button
              type="button"
              class="text-sm px-4 py-2 bg-treq-accent text-white rounded-lg hover:opacity-90 transition-opacity"
              onClick={props.onRetry}
            >
              Retry
            </button>
          </div>
        </Show>
      }
    >
      {props.children}
    </Show>
  );
}
