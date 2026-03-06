import type { ExecutionDetail, PluginHookInfo } from '@t-req/sdk/client';
import { createMemo, For, Show } from 'solid-js';
import { rgba, theme } from '../../theme';
import { prettyPrintJson } from '../../util/format';
import type { LoadedPlugin, PluginReport } from './types';

export interface PluginsTabProps {
  pluginHooks: PluginHookInfo[] | undefined;
  pluginReports: ExecutionDetail['pluginReports'] | undefined;
  loadedPlugins: LoadedPlugin[] | undefined;
}

export function PluginsTab(props: PluginsTabProps) {
  const rows = createMemo(() => {
    const byName = new Map<
      string,
      { plugin: LoadedPlugin | undefined; hooks: PluginHookInfo[]; reports: PluginReport[] }
    >();
    const orderedNames: string[] = [];

    const ensureRow = (name: string, plugin?: LoadedPlugin) => {
      const existing = byName.get(name);
      if (existing) {
        if (plugin) {
          existing.plugin = plugin;
        }
        return existing;
      }

      orderedNames.push(name);
      const created = { plugin, hooks: [], reports: [] };
      byName.set(name, created);
      return created;
    };

    for (const plugin of props.loadedPlugins ?? []) {
      ensureRow(plugin.name, plugin);
    }

    for (const hook of props.pluginHooks ?? []) {
      ensureRow(hook.pluginName).hooks.push(hook);
    }

    for (const report of props.pluginReports ?? []) {
      ensureRow(report.pluginName).reports.push(report);
    }

    return orderedNames.map((name) => {
      const entry = byName.get(name);
      if (!entry) {
        return {
          name,
          hooks: [] as PluginHookInfo[],
          reports: [] as PluginReport[],
          plugin: undefined
        };
      }
      return { name, ...entry };
    });
  });

  return (
    <box id="plugins" flexDirection="column">
      <Show
        when={rows().length > 0}
        fallback={<text fg={rgba(theme.textMuted)}>No plugins loaded</text>}
      >
        <For each={rows()}>
          {(row) => (
            <box flexDirection="column" marginBottom={1}>
              <box flexDirection="row">
                <text fg={rgba(theme.info)}>
                  {row.name}
                  <Show when={row.plugin?.version}> v{row.plugin?.version}</Show>
                </text>
                <text fg={rgba(theme.textMuted)}>
                  {' '}
                  {row.hooks.length > 0 || row.reports.length > 0
                    ? `(executed, hooks: ${row.hooks.length}, reports: ${row.reports.length})`
                    : '(loaded, no activity)'}
                </text>
              </box>

              <Show when={row.hooks.length > 0}>
                <For each={row.hooks}>
                  {(hookInfo) => (
                    <box flexDirection="row">
                      <text fg={rgba(theme.textMuted)}> {hookInfo.hook} </text>
                      <text fg={rgba(theme.textMuted)}>+{hookInfo.durationMs}ms</text>
                      <Show when={hookInfo.modified}>
                        <text fg={rgba(theme.success)}> (mod)</text>
                      </Show>
                    </box>
                  )}
                </For>
              </Show>

              <Show when={row.reports.length > 0}>
                <For each={row.reports}>
                  {(report) => (
                    <box flexDirection="column">
                      <text fg={rgba(theme.textMuted)}>
                        {' '}
                        report seq:{report.seq}
                        <Show when={report.requestName}> req:{report.requestName}</Show>
                      </text>
                      <text fg={rgba(theme.textMuted)}>
                        {prettyPrintJson(JSON.stringify(report.data))}
                      </text>
                    </box>
                  )}
                </For>
              </Show>
            </box>
          )}
        </For>
      </Show>
    </box>
  );
}
