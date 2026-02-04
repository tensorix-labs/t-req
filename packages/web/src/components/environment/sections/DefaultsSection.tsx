import { Show, For } from 'solid-js';
import type { DefaultsSectionProps } from '../types';
import { SettingRow, ValueBadge, SectionTitle, EmptyState } from '../shared';

export function DefaultsSection(props: DefaultsSectionProps) {
  const headers = () => props.defaults?.headers ?? {};
  const hasHeaders = () => Object.keys(headers()).length > 0;

  return (
    <div class="p-6">
      <Show when={!props.defaults}>
        <EmptyState message="No defaults configured" />
      </Show>
      <Show when={props.defaults}>
        <SectionTitle>Request Defaults</SectionTitle>
        <div class="mt-4">
          <SettingRow
            label="Request timeout"
            description="How long to wait for a response before timing out"
            value={
              <div class="flex items-center gap-2">
                <span class="px-3 py-1.5 text-sm rounded-lg font-mono bg-treq-border-light dark:bg-treq-dark-border-light text-treq-text-strong dark:text-treq-dark-text-strong min-w-[60px] text-right">
                  {props.defaults!.timeoutMs ?? 0}
                </span>
                <span class="text-xs text-treq-text-muted dark:text-treq-dark-text-muted">ms</span>
              </div>
            }
          />
          <SettingRow
            label="Follow redirects"
            description="Automatically follow HTTP redirects"
            value={<ValueBadge value={props.defaults!.followRedirects} />}
          />
          <SettingRow
            label="SSL certificate verification"
            description="Validate SSL certificates for HTTPS requests"
            value={<ValueBadge value={props.defaults!.validateSSL} />}
          />
          <SettingRow
            label="Proxy"
            description="HTTP proxy server for requests"
            value={<ValueBadge value={props.defaults!.proxy || '—'} />}
          />
        </div>

        <Show when={hasHeaders()}>
          <div class="mt-8">
            <SectionTitle>Default Headers</SectionTitle>
            <div class="mt-4">
              <For each={Object.entries(headers())}>
                {([name, value]) => (
                  <SettingRow
                    label={name}
                    value={<ValueBadge value={value} />}
                  />
                )}
              </For>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  );
}
