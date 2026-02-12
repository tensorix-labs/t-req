import { useKeyboard } from '@opentui/solid';
import type { ExecutionDetail, GetPluginsResponses, PluginHookInfo } from '@t-req/sdk/client';
import { createEffect, createMemo, createSignal, For, Match, on, Show, Switch } from 'solid-js';
import { useDialog } from '../context';
import { detectFiletype } from '../syntax';
import { getHttpStatusColor, getMethodColor, rgba, theme } from '../theme';
import { formatDuration, prettyPrintJson } from '../util/format';
import { normalizeKey } from '../util/normalize-key';
import { HighlightedContent } from './highlighted-content';

type DetailTab = 'body' | 'headers' | 'plugins';
type PluginReport = NonNullable<ExecutionDetail['pluginReports']>[number];
type LoadedPlugin = GetPluginsResponses[200]['plugins'][number];

const TABS = [
  { id: 'body', label: 'body', shortcut: '1' },
  { id: 'headers', label: 'headers', shortcut: '2' },
  { id: 'plugins', label: 'plugins', shortcut: '3' }
] as const;

export interface ExecutionDetailProps {
  execution: ExecutionDetail | undefined;
  isLoading: boolean;
  loadedPlugins?: LoadedPlugin[];
}

/**
 * Decode base64 body if needed
 */
function decodeBody(body?: string, encoding?: string): string {
  if (!body) return '';
  if (encoding === 'base64') {
    try {
      return atob(body);
    } catch {
      return '[Binary data - cannot decode]';
    }
  }
  return body;
}

/**
 * Format body content, pretty printing JSON when detected
 */
function formatBody(body: string, contentType?: string): string {
  const isJson = contentType?.toLowerCase().includes('application/json');

  if (isJson || !contentType) {
    return prettyPrintJson(body);
  }
  return body;
}

function useExecutionData(execution: () => ExecutionDetail | undefined) {
  const response = createMemo(() => execution()?.response);
  const headers = createMemo(() => response()?.headers ?? []);

  const cookies = createMemo(() => headers().filter((h) => h.name.toLowerCase() === 'set-cookie'));

  const nonCookieHeaders = createMemo(() =>
    headers().filter((h) => h.name.toLowerCase() !== 'set-cookie')
  );

  const contentType = createMemo(
    () => headers().find((h) => h.name.toLowerCase() === 'content-type')?.value
  );

  const body = createMemo(() => {
    const res = response();
    if (!res) return '';
    const decoded = decodeBody(res.body, res.encoding);
    return formatBody(decoded, contentType());
  });

  const filetype = createMemo(() => {
    const res = response();
    if (!res) return undefined;
    const decoded = decodeBody(res.body, res.encoding);
    return detectFiletype(contentType(), decoded);
  });

  return { response, cookies, nonCookieHeaders, body, filetype };
}

function TabBar(props: { activeTab: DetailTab; onTabChange: (tab: DetailTab) => void }) {
  return (
    <box flexDirection="row" paddingLeft={2} marginBottom={1} flexShrink={0}>
      <For each={TABS}>
        {(tab, index) => (
          <>
            <Show when={index() > 0}>
              <text fg={rgba(theme.textMuted)}> </text>
            </Show>
            <text
              fg={rgba(props.activeTab === tab.id ? theme.primary : theme.textMuted)}
              attributes={props.activeTab === tab.id ? 1 : 0}
            >
              {tab.label} ({tab.shortcut})
            </text>
          </>
        )}
      </For>
    </box>
  );
}

function BodyTab(props: { body: string; filetype?: string }) {
  return (
    <box id="body" flexDirection="column">
      <Show when={props.body} fallback={<text fg={rgba(theme.textMuted)}>No body content</text>}>
        <HighlightedContent content={props.body} filetype={props.filetype} />
      </Show>
    </box>
  );
}

function HeadersTab(props: {
  cookies: Array<{ name: string; value: string }>;
  headers: Array<{ name: string; value: string }>;
}) {
  return (
    <box flexDirection="column">
      <Show when={props.cookies.length > 0}>
        <box id="cookies" flexDirection="column" marginBottom={1}>
          <text fg={rgba(theme.primary)} attributes={1}>
            Cookies
          </text>
          <For each={props.cookies}>
            {(cookie) => (
              <box flexDirection="row">
                <text fg={rgba(theme.text)}>
                  {cookie.name}: {cookie.value}
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>

      <Show
        when={props.headers.length > 0}
        fallback={
          <Show when={props.cookies.length === 0}>
            <text fg={rgba(theme.textMuted)}>No headers</text>
          </Show>
        }
      >
        <box id="headers" flexDirection="column">
          <text fg={rgba(theme.primary)} attributes={1}>
            Headers
          </text>
          <For each={props.headers}>
            {(header) => (
              <box flexDirection="row">
                <text fg={rgba(theme.textMuted)}>{header.name}: </text>
                <text fg={rgba(theme.text)}>{header.value}</text>
              </box>
            )}
          </For>
        </box>
      </Show>
    </box>
  );
}

function PluginsTab(props: {
  pluginHooks: PluginHookInfo[] | undefined;
  pluginReports: ExecutionDetail['pluginReports'] | undefined;
  loadedPlugins: LoadedPlugin[] | undefined;
}) {
  const rows = createMemo(() => {
    const byName = new Map<
      string,
      { plugin: LoadedPlugin | undefined; hooks: PluginHookInfo[]; reports: PluginReport[] }
    >();
    const orderedNames: string[] = [];

    const ensureRow = (name: string, plugin?: LoadedPlugin) => {
      const existing = byName.get(name);
      if (existing) {
        if (plugin) existing.plugin = plugin;
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
      if (!entry)
        return {
          name,
          hooks: [] as PluginHookInfo[],
          reports: [] as PluginReport[],
          plugin: undefined
        };
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
                  {(hookInfo: PluginHookInfo) => (
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
                  {(report: PluginReport) => (
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

export function ExecutionDetailView(props: ExecutionDetailProps) {
  const dialog = useDialog();
  const [activeTab, setActiveTab] = createSignal<DetailTab>('body');
  const { response, cookies, nonCookieHeaders, body, filetype } = useExecutionData(
    () => props.execution
  );

  // Reset tab when execution changes
  createEffect(
    on(
      () => props.execution?.reqExecId,
      () => setActiveTab('body'),
      { defer: true }
    )
  );

  const cycleTab = (direction: number) => {
    const tabIds = TABS.map((t) => t.id);
    const currentIndex = tabIds.indexOf(activeTab());
    const newIndex = (currentIndex + direction + tabIds.length) % tabIds.length;
    setActiveTab(tabIds[newIndex] as DetailTab);
  };

  // Keyboard handler for tab switching
  useKeyboard((evt) => {
    if (dialog.stack.length > 0 || !props.execution) return;
    const key = normalizeKey(evt);

    const actions: Record<string, () => void> = {
      '1': () => setActiveTab('body'),
      '2': () => setActiveTab('headers'),
      '3': () => setActiveTab('plugins'),
      h: () => cycleTab(-1),
      l: () => cycleTab(1)
    };

    const action = actions[key.name];
    if (action) {
      action();
      evt.preventDefault();
    }
  });

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      overflow="hidden"
      backgroundColor={rgba(theme.backgroundPanel)}
    >
      <box paddingLeft={2} paddingTop={1} paddingBottom={1}>
        <text fg={rgba(theme.primary)} attributes={1}>
          Details
        </text>
      </box>

      <Show
        when={props.execution}
        keyed
        fallback={
          <box id="loading-state" paddingLeft={2}>
            <text fg={rgba(theme.textMuted)}>
              {props.isLoading ? 'Loading...' : 'Select an execution to view details'}
            </text>
          </box>
        }
      >
        {(execution: ExecutionDetail) => (
          <box flexDirection="column" flexGrow={1}>
            <box flexDirection="column" paddingLeft={2} paddingRight={1} flexShrink={0}>
              <box id="request-summary" flexDirection="column" marginBottom={1}>
                <box flexDirection="row">
                  <text fg={rgba(getMethodColor(execution.method ?? 'GET'))} attributes={1}>
                    {execution.method ?? 'GET'}
                  </text>
                  <text fg={rgba(theme.text)}>
                    {' '}
                    {execution.urlResolved ?? execution.urlTemplate ?? ''}
                  </text>
                </box>
                {/* Line 2: Label */}
                <Show when={execution.reqLabel}>
                  <text fg={rgba(theme.textMuted)}>{execution.reqLabel}</text>
                </Show>
              </box>

              <Show
                when={
                  execution.timing.ttfb !== undefined || execution.timing.durationMs !== undefined
                }
              >
                <box flexDirection="column" marginBottom={1}>
                  <text fg={rgba(theme.primary)} attributes={1}>
                    Timing
                  </text>
                  <Show when={execution.timing.ttfb !== undefined}>
                    <box flexDirection="row">
                      <text fg={rgba(theme.textMuted)}>TTFB: </text>
                      <text fg={rgba(theme.text)}>
                        {formatDuration(execution.timing.ttfb, { precision: 2, emptyValue: 'N/A' })}
                      </text>
                    </box>
                  </Show>
                  <Show when={execution.timing.durationMs !== undefined}>
                    <box flexDirection="row">
                      <text fg={rgba(theme.textMuted)}>Total: </text>
                      <text fg={rgba(theme.text)}>
                        {formatDuration(execution.timing.durationMs, {
                          precision: 2,
                          emptyValue: 'N/A'
                        })}
                      </text>
                    </box>
                  </Show>
                </box>
              </Show>

              <Show when={response()}>
                <box id="response" flexDirection="column" marginBottom={1}>
                  <text fg={rgba(theme.primary)} attributes={1}>
                    Response
                  </text>
                  <box flexDirection="row">
                    <text fg={rgba(theme.textMuted)}>Status: </text>
                    <text fg={rgba(getHttpStatusColor(response()?.status))}>
                      {response()?.status} {response()?.statusText}
                    </text>
                  </box>
                  <box flexDirection="row">
                    <text fg={rgba(theme.textMuted)}>Size: </text>
                    <text fg={rgba(theme.text)}>
                      {response()?.bodyBytes} bytes{response()?.truncated ? ' (truncated)' : ''}
                    </text>
                  </box>
                </box>
              </Show>

              <Show when={execution.error}>
                <box id="error" flexDirection="column" marginBottom={1}>
                  <text fg={rgba(theme.error)} attributes={1}>
                    Error
                  </text>
                  <box flexDirection="row">
                    <text fg={rgba(theme.textMuted)}>Stage: </text>
                    <text fg={rgba(theme.error)}>{execution.error?.stage}</text>
                  </box>
                  <text fg={rgba(theme.error)}>{execution.error?.message}</text>
                </box>
              </Show>
            </box>

            <TabBar activeTab={activeTab()} onTabChange={setActiveTab} />

            <scrollbox flexGrow={1} paddingLeft={2} paddingRight={1}>
              <Switch>
                <Match when={activeTab() === 'body'}>
                  <BodyTab body={body()} filetype={filetype()} />
                </Match>
                <Match when={activeTab() === 'headers'}>
                  <HeadersTab cookies={cookies()} headers={nonCookieHeaders()} />
                </Match>
                <Match when={activeTab() === 'plugins'}>
                  <PluginsTab
                    pluginHooks={execution.pluginHooks}
                    pluginReports={execution.pluginReports}
                    loadedPlugins={props.loadedPlugins}
                  />
                </Match>
              </Switch>
            </scrollbox>
          </box>
        )}
      </Show>
    </box>
  );
}
