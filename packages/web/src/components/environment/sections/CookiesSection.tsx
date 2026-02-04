import { Show } from 'solid-js';
import type { CookiesSectionProps } from '../types';
import { SettingRow, ValueBadge, SectionTitle, EmptyState } from '../shared';

export function CookiesSection(props: CookiesSectionProps) {
  return (
    <div class="p-6">
      <Show when={!props.cookies}>
        <EmptyState message="No cookie settings configured" />
      </Show>
      <Show when={props.cookies}>
        <SectionTitle>Cookie Settings</SectionTitle>
        <div class="mt-4">
          <SettingRow
            label="Cookies enabled"
            description="Enable cookie handling for requests"
            value={<ValueBadge value={props.cookies!.enabled} />}
          />
          <SettingRow
            label="Cookie mode"
            description="How cookies are stored and managed"
            value={<ValueBadge value={props.cookies!.mode} />}
          />
          <SettingRow
            label="Cookie jar path"
            description="File path for persistent cookie storage"
            value={<ValueBadge value={props.cookies!.jarPath || '—'} />}
          />
        </div>
      </Show>
    </div>
  );
}
