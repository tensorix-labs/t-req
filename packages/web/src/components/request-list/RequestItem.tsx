import { createSignal, Show } from 'solid-js';
import type { WorkspaceRequest } from '../../sdk';
import { PlayIcon, SpinnerIcon } from '../icons';
import { getMethodClasses } from '@t-req/ui';

interface RequestItemProps {
  request: WorkspaceRequest;
  executing: boolean;
  onExecute: (request: WorkspaceRequest) => void;
}

export function RequestItem(props: RequestItemProps) {
  const [isExecuting, setIsExecuting] = createSignal(false);
  const method = () => props.request.method.toUpperCase();

  const handleExecute = async (e: MouseEvent) => {
    e.stopPropagation();
    if (isExecuting()) return;

    setIsExecuting(true);
    props.onExecute(props.request);
    setTimeout(() => setIsExecuting(false), 500);
  };

  return (
    <li class="flex items-center gap-3 px-4 py-3 bg-white dark:bg-treq-dark-bg-card border border-treq-border-light rounded-treq cursor-pointer transition-all duration-150 hover:border-treq-accent hover:shadow-sm dark:border-treq-dark-border-light dark:hover:border-treq-accent">
      <span class={getMethodClasses(method())}>
        {method()}
      </span>
      <span class="flex-1 font-mono text-sm text-treq-text-strong overflow-hidden text-ellipsis whitespace-nowrap dark:text-treq-dark-text-strong">
        {props.request.url}
      </span>
      <Show when={props.request.name}>
        <span class="text-xs text-treq-text-muted px-2 py-0.5 bg-treq-border-light rounded-treq dark:text-treq-dark-text-muted dark:bg-treq-dark-border-light">
          {props.request.name}
        </span>
      </Show>
      <button
        class="flex items-center justify-center w-7 h-7 p-0 bg-transparent border border-transparent rounded-treq text-treq-text-muted cursor-pointer transition-all duration-150 shrink-0 hover:enabled:bg-http-get hover:enabled:text-white hover:enabled:border-http-get disabled:opacity-50 disabled:cursor-not-allowed dark:text-treq-dark-text-muted"
        onClick={handleExecute}
        disabled={isExecuting() || props.executing}
        title="Execute request"
      >
        <Show when={isExecuting()} fallback={<PlayIcon />}>
          <SpinnerIcon size="sm" />
        </Show>
      </button>
    </li>
  );
}
