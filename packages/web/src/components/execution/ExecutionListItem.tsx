import { Show } from 'solid-js';
import type { ExecutionSummary } from '../../stores/observer';
import { SpinnerIcon } from '../icons';
import { getMethodClasses, getMethodClassesSelected, getExecutionStatusClasses } from '@t-req/ui';

interface ExecutionListItemProps {
  execution: ExecutionSummary;
  isSelected: boolean;
  onSelect: () => void;
}

export function ExecutionListItem(props: ExecutionListItemProps) {
  const method = () => props.execution.method?.toUpperCase() ?? '???';
  const url = () => props.execution.urlResolved ?? props.execution.urlTemplate ?? '...';
  const statusCode = () => props.execution.response?.status;

  const methodBadgeClasses = () => {
    if (props.isSelected) return getMethodClassesSelected('sm');
    return getMethodClasses(method(), 'sm');
  };

  const statusClasses = () => {
    return getExecutionStatusClasses(props.execution.status, props.isSelected);
  };

  const itemClasses = () => {
    const base = 'flex items-center gap-2 px-3 py-2 cursor-pointer transition-all duration-150';
    const hover = 'hover:bg-treq-border-light dark:hover:bg-treq-dark-border-light';
    const selected = props.isSelected ? 'bg-treq-accent text-white' : '';
    return `${base} ${hover} ${selected}`;
  };

  return (
    <li class={itemClasses()} onClick={props.onSelect}>
      <span class={methodBadgeClasses()}>{method()}</span>
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
