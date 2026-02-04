import { Show, For } from 'solid-js';
import type { PluginsSectionProps } from '../types';
import type { PluginInfo } from '../../../sdk';
import { SectionTitle, EmptyState } from '../shared';

function getSourceClasses(source: PluginInfo['source']): string {
  const base = 'text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide';
  switch (source) {
    case 'npm':
      return `${base} bg-http-get/15 text-http-get`;
    case 'file':
      return `${base} bg-http-put/15 text-http-put`;
    case 'inline':
      return `${base} bg-http-post/15 text-http-post`;
    case 'subprocess':
      return `${base} bg-treq-accent/15 text-treq-accent`;
    default:
      return `${base} bg-treq-border-light text-treq-text-muted dark:bg-treq-dark-border-light dark:text-treq-dark-text-muted`;
  }
}

function CapabilityBadge(props: { label: string }) {
  return (
    <span class="text-[10px] font-medium px-2 py-0.5 rounded bg-treq-border-light dark:bg-treq-dark-border-light text-treq-text-muted dark:text-treq-dark-text-muted">
      {props.label}
    </span>
  );
}

function PluginCard(props: { plugin: PluginInfo }) {
  const capabilities = () => {
    const caps: string[] = [];
    if (props.plugin.capabilities.hasHooks) caps.push('Hooks');
    if (props.plugin.capabilities.hasResolvers) caps.push('Resolvers');
    if (props.plugin.capabilities.hasCommands) caps.push('Commands');
    if (props.plugin.capabilities.hasMiddleware) caps.push('Middleware');
    if (props.plugin.capabilities.hasTools) caps.push('Tools');
    return caps;
  };

  return (
    <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-treq-border-light dark:border-treq-dark-border-light">
      <div class="flex items-center gap-3 mb-3">
        <span class="font-medium text-treq-text-strong dark:text-treq-dark-text-strong">
          {props.plugin.name}
        </span>
        <Show when={props.plugin.version}>
          <span class="text-xs text-treq-text-muted dark:text-treq-dark-text-muted">
            v{props.plugin.version}
          </span>
        </Show>
        <span class={getSourceClasses(props.plugin.source)}>{props.plugin.source}</span>
      </div>

      <Show when={capabilities().length > 0}>
        <div class="flex flex-wrap gap-1.5 mb-3">
          <For each={capabilities()}>
            {(cap) => <CapabilityBadge label={cap} />}
          </For>
        </div>
      </Show>

      <Show when={props.plugin.permissions.length > 0}>
        <div class="text-xs text-treq-text-muted dark:text-treq-dark-text-muted">
          <span class="font-medium">Permissions:</span>{' '}
          <span class="text-treq-text-strong dark:text-treq-dark-text-strong">
            {props.plugin.permissions.join(', ')}
          </span>
        </div>
      </Show>
    </div>
  );
}

export function PluginsSection(props: PluginsSectionProps) {
  return (
    <div class="p-6">
      <Show when={props.plugins.length === 0}>
        <EmptyState message="No plugins loaded" />
      </Show>
      <Show when={props.plugins.length > 0}>
        <SectionTitle>Loaded Plugins</SectionTitle>
        <div class="mt-4 flex flex-col gap-3">
          <For each={props.plugins}>
            {(plugin) => <PluginCard plugin={plugin} />}
          </For>
        </div>
      </Show>
    </div>
  );
}
