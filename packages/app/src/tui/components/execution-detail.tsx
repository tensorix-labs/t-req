import { useKeyboard } from '@opentui/solid';
import type { ExecutionDetail } from '@t-req/sdk/client';
import { createMemo, createSignal, Match, Show, Switch } from 'solid-js';
import { useDialog } from '../context';
import { detectFiletype } from '../syntax';
import { getHttpStatusColor, getMethodColor, rgba, theme } from '../theme';
import { formatDuration, prettyPrintJson } from '../util/format';
import { normalizeKey } from '../util/normalize-key';
import { BodyTab } from './execution-detail/body-tab';
import { HeadersTab } from './execution-detail/headers-tab';
import { PluginsTab } from './execution-detail/plugins-tab';
import { DetailTabBar } from './execution-detail/tab-bar';
import { DETAIL_TABS, type DetailTab, type LoadedPlugin } from './execution-detail/types';
import { ScriptOutput } from './script-output';

export interface ExecutionDetailProps {
  execution: ExecutionDetail | undefined;
  isLoading: boolean;
  loadedPlugins?: LoadedPlugin[];
  stdoutLines: string[];
  stderrLines: string[];
  exitCode: number | null | undefined;
  isRunning: boolean;
  scriptPath?: string;
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

export function ExecutionDetailView(props: ExecutionDetailProps) {
  const dialog = useDialog();
  const [activeTab, setActiveTab] = createSignal<DetailTab>('body');
  const { response, cookies, nonCookieHeaders, body, filetype } = useExecutionData(
    () => props.execution
  );

  const cycleTab = (direction: number) => {
    const tabIds = DETAIL_TABS.map((t) => t.id);
    const currentIndex = tabIds.indexOf(activeTab());
    const newIndex = (currentIndex + direction + tabIds.length) % tabIds.length;
    setActiveTab(tabIds[newIndex] as DetailTab);
  };

  // Keyboard handler for tab switching
  useKeyboard((evt) => {
    if (dialog.stack.length > 0) return;
    const key = normalizeKey(evt);

    const actions: Record<string, () => void> = {
      '1': () => setActiveTab('body'),
      '2': () => setActiveTab('headers'),
      '3': () => setActiveTab('plugins'),
      '4': () => setActiveTab('output'),
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

      <Show when={props.execution} keyed>
        {(execution: ExecutionDetail) => (
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
        )}
      </Show>

      <DetailTabBar activeTab={activeTab()} onTabChange={setActiveTab} />

      <box flexGrow={1} overflow="hidden">
        <Switch>
          <Match when={activeTab() === 'output'}>
            <ScriptOutput
              stdoutLines={props.stdoutLines}
              stderrLines={props.stderrLines}
              exitCode={props.exitCode}
              isRunning={props.isRunning}
              scriptPath={props.scriptPath}
              showHeader={false}
            />
          </Match>
          <Match when={!props.execution}>
            <box id="loading-state" paddingLeft={2} paddingRight={1} height={1}>
              <text fg={rgba(theme.textMuted)}>
                {props.isLoading ? 'Loading...' : 'Select an execution to view details'}
              </text>
            </box>
          </Match>
          <Match when={activeTab() === 'body'}>
            <scrollbox flexGrow={1} paddingLeft={2} paddingRight={1}>
              <BodyTab body={body()} filetype={filetype()} />
            </scrollbox>
          </Match>
          <Match when={activeTab() === 'headers'}>
            <scrollbox flexGrow={1} paddingLeft={2} paddingRight={1}>
              <HeadersTab cookies={cookies()} headers={nonCookieHeaders()} />
            </scrollbox>
          </Match>
          <Match when={activeTab() === 'plugins'}>
            <scrollbox flexGrow={1} paddingLeft={2} paddingRight={1}>
              <PluginsTab
                pluginHooks={props.execution?.pluginHooks}
                pluginReports={props.execution?.pluginReports}
                loadedPlugins={props.loadedPlugins}
              />
            </scrollbox>
          </Match>
        </Switch>
      </box>
    </box>
  );
}
