import { Show } from 'solid-js';
import type { WorkspaceRequest } from '../../sdk';
import { PlayIcon, SpinnerIcon } from '../icons';
import { getMethodClasses } from '@t-req/ui';

interface RequestBarProps {
  request: WorkspaceRequest;
  executing: boolean;
  onExecute: () => void;
}

export function RequestBar(props: RequestBarProps) {
  const method = () => props.request.method.toUpperCase();

  return (
    <div class="flex items-center gap-3 p-3 bg-white dark:bg-treq-dark-bg border border-treq-border-light dark:border-treq-dark-border-light rounded-treq">
      <span class={getMethodClasses(method())}>
        {method()}
      </span>
      <div class="flex-1 font-mono text-sm text-treq-text-strong dark:text-treq-dark-text-strong overflow-hidden text-ellipsis whitespace-nowrap">
        {props.request.url}
      </div>
      <Show when={props.request.name}>
        <span class="text-xs text-treq-text-muted px-2 py-0.5 bg-treq-border-light rounded dark:text-treq-dark-text-muted dark:bg-treq-dark-border-light shrink-0">
          {props.request.name}
        </span>
      </Show>
      <button
        class="flex items-center justify-center gap-2 px-4 py-1.5 bg-http-get text-white text-sm font-medium rounded-treq transition-all duration-150 shrink-0 hover:enabled:bg-http-get/90 disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={props.onExecute}
        disabled={props.executing}
      >
        <Show when={props.executing} fallback={<PlayIcon />}>
          <SpinnerIcon size="sm" />
        </Show>
        <span>Send</span>
      </button>
    </div>
  );
}
