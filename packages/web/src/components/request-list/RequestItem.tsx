import { createSignal, Show } from 'solid-js';
import type { WorkspaceRequest } from '../../sdk';
import { PlayIcon, SpinnerIcon } from '../icons';

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

  const methodClasses = () => {
    const base = 'font-mono text-xs font-semibold px-2 py-1 rounded uppercase min-w-16 text-center';
    switch (method()) {
      case 'GET':
        return `${base} bg-http-get/15 text-http-get`;
      case 'POST':
        return `${base} bg-http-post/15 text-http-post`;
      case 'PUT':
        return `${base} bg-http-put/15 text-http-put`;
      case 'PATCH':
        return `${base} bg-http-patch/15 text-http-patch`;
      case 'DELETE':
        return `${base} bg-http-delete/15 text-http-delete`;
      default:
        return `${base} bg-treq-border-light text-treq-text-muted`;
    }
  };

  return (
    <li class="flex items-center gap-3 px-4 py-3 bg-treq-bg-card border border-treq-border-light rounded-treq cursor-pointer transition-all hover:border-treq-accent hover:shadow-sm dark:bg-treq-dark-bg-card dark:border-treq-dark-border-light dark:hover:shadow-md">
      <span class={methodClasses()}>
        {method()}
      </span>
      <span class="flex-1 font-mono text-sm text-treq-text-strong overflow-hidden text-ellipsis whitespace-nowrap dark:text-treq-dark-text-strong">
        {props.request.url}
      </span>
      <Show when={props.request.name}>
        <span class="text-xs text-treq-text-muted px-2 py-0.5 bg-treq-border-light rounded dark:text-treq-dark-text-muted dark:bg-treq-dark-border-light">
          {props.request.name}
        </span>
      </Show>
      <button
        class="flex items-center justify-center w-7 h-7 p-0 bg-transparent border border-transparent rounded text-treq-text-muted cursor-pointer transition-all shrink-0 hover:enabled:bg-http-get hover:enabled:text-white hover:enabled:border-http-get disabled:opacity-50 disabled:cursor-not-allowed dark:text-treq-dark-text-muted"
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
