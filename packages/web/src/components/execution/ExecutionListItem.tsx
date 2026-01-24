import { Show } from 'solid-js';
import type { ExecutionSummary } from '../../stores/observer';
import { SpinnerIcon } from '../icons';

interface ExecutionListItemProps {
  execution: ExecutionSummary;
  isSelected: boolean;
  onSelect: () => void;
}

export function ExecutionListItem(props: ExecutionListItemProps) {
  const method = () => props.execution.method?.toUpperCase() ?? '???';
  const url = () => props.execution.urlResolved ?? props.execution.urlTemplate ?? '...';
  const statusCode = () => props.execution.response?.status;

  const methodClasses = () => {
    const base = 'font-mono text-[0.625rem] font-semibold px-1.5 py-0.5 rounded uppercase min-w-12 text-center';
    if (props.isSelected) return `${base} bg-white/20 text-white`;
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

  const statusClasses = () => {
    const base = 'font-mono text-xs font-semibold px-1.5 py-0.5 rounded';
    if (props.isSelected) return `${base} bg-white/20 text-white`;
    switch (props.execution.status) {
      case 'success':
        return `${base} bg-http-get/15 text-http-get`;
      case 'failed':
        return `${base} bg-http-delete/15 text-http-delete`;
      default:
        return base;
    }
  };

  const itemClasses = () => {
    const base = 'flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors';
    const hover = 'hover:bg-treq-border-light dark:hover:bg-treq-dark-border-light';
    const selected = props.isSelected ? 'bg-treq-accent text-white' : '';
    return `${base} ${hover} ${selected}`;
  };

  return (
    <li class={itemClasses()} onClick={props.onSelect}>
      <span class={methodClasses()}>{method()}</span>
      <span class="flex-1 font-mono text-xs overflow-hidden text-ellipsis whitespace-nowrap">
        {url()}
      </span>
      <Show when={statusCode()}>
        <span class={statusClasses()}>{statusCode()}</span>
      </Show>
      <Show when={props.execution.status === 'running'}>
        <span class={props.isSelected ? 'text-white' : ''}>
          <SpinnerIcon size="sm" />
        </span>
      </Show>
      <Show when={props.execution.status === 'failed' && !statusCode()}>
        <span class={`text-[0.625rem] font-semibold px-1.5 py-0.5 rounded uppercase ${props.isSelected ? 'bg-white/20 text-white' : 'bg-http-delete/15 text-http-delete'}`}>
          Error
        </span>
      </Show>
    </li>
  );
}
