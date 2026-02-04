import { Show, For } from 'solid-js';
import type { VariablesSectionProps } from '../types';
import { SettingRow, ValueBadge, SectionTitle, EmptyState } from '../shared';

export function VariablesSection(props: VariablesSectionProps) {
  const entries = () => Object.entries(props.variables);

  return (
    <div class="p-6">
      <Show when={entries().length === 0}>
        <EmptyState message="No variables configured" />
      </Show>
      <Show when={entries().length > 0}>
        <SectionTitle>Environment Variables</SectionTitle>
        <div class="mt-4">
          <For each={entries()}>
            {([key, value]) => (
              <SettingRow
                label={key}
                value={<ValueBadge value={String(value)} />}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
