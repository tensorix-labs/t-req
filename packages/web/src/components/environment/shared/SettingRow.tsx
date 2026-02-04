import { Show } from 'solid-js';
import type { JSX } from 'solid-js';

export interface SettingRowProps {
  label: string;
  description?: string;
  value: JSX.Element;
}

export function SettingRow(props: SettingRowProps) {
  return (
    <div class="flex items-start justify-between gap-8 py-4 border-b border-treq-border-light dark:border-treq-dark-border-light last:border-b-0">
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium text-treq-text-strong dark:text-treq-dark-text-strong">
          {props.label}
        </div>
        <Show when={props.description}>
          <div class="text-xs text-treq-text-muted dark:text-treq-dark-text-muted mt-0.5">
            {props.description}
          </div>
        </Show>
      </div>
      <div class="shrink-0">{props.value}</div>
    </div>
  );
}
