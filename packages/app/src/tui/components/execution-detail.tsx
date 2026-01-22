import { createMemo, For, Show } from 'solid-js';
import type { ExecutionDetail } from '../sdk';
import { theme, rgba, getMethodColor } from '../theme';

export interface ExecutionDetailProps {
  execution: ExecutionDetail | undefined;
  isLoading: boolean;
}

/**
 * Format a duration in milliseconds to a human-readable string.
 */
function formatDuration(ms?: number): string {
  if (ms === undefined) return 'N/A';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Get status color
 */
function getStatusColor(status: string): string {
  switch (status) {
    case 'success':
      return theme.success;
    case 'failed':
      return theme.error;
    case 'running':
      return theme.warning;
    default:
      return theme.textMuted;
  }
}

/**
 * Get HTTP status color based on code range
 */
function getHttpStatusColor(status?: number): string {
  if (!status) return theme.textMuted;
  if (status >= 200 && status < 300) return theme.success;
  if (status >= 300 && status < 400) return theme.info;
  if (status >= 400 && status < 500) return theme.warning;
  if (status >= 500) return theme.error;
  return theme.textMuted;
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
  // Check if content type suggests JSON
  const isJson = contentType?.toLowerCase().includes('application/json');

  if (isJson || !contentType) {
    try {
      const parsed = JSON.parse(body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // Not valid JSON, return as-is
      return body;
    }
  }
  return body;
}

export function ExecutionDetailView(props: ExecutionDetailProps) {
  const response = createMemo(() => props.execution?.response);
  const headers = createMemo(() => response()?.headers ?? []);
  const cookies = createMemo(() =>
    headers().filter(h => h.name.toLowerCase() === 'set-cookie')
  );
  const nonCookieHeaders = createMemo(() =>
    headers().filter(h => h.name.toLowerCase() !== 'set-cookie')
  );
  const contentType = createMemo(() =>
    headers().find(h => h.name.toLowerCase() === 'content-type')?.value
  );
  const body = createMemo(() => {
    const decoded = decodeBody(response()?.body, response()?.encoding);
    return formatBody(decoded, contentType());
  });

  return (
    <box flexGrow={1} flexDirection="column" overflow="hidden" backgroundColor={rgba(theme.backgroundPanel)}>
      <box paddingLeft={2} paddingTop={1} paddingBottom={1}>
        <text fg={rgba(theme.primary)} attributes={1}>
          Details
        </text>
      </box>
      <scrollbox flexGrow={1} paddingLeft={2} paddingRight={1}>
        <Show
          when={props.execution}
          keyed
          fallback={
            <box id="loading-state">
              <text fg={rgba(theme.textMuted)}>
                {props.isLoading ? 'Loading...' : 'Select an execution to view details'}
              </text>
            </box>
          }
        >
          {(execution: ExecutionDetail) => (
            <>
              {/* Request Summary */}
              <box id="request-summary" flexDirection="column" marginBottom={1}>
                {/* Line 1: METHOD URL */}
                <box flexDirection="row">
                  <text fg={rgba(getMethodColor(execution.method ?? 'GET'))} attributes={1}>
                    {execution.method ?? 'GET'}
                  </text>
                  <text fg={rgba(theme.text)}> {execution.urlResolved ?? execution.urlTemplate ?? ''}</text>
                </box>
                {/* Line 2: Label */}
                <Show when={execution.reqLabel}>
                  <text fg={rgba(theme.textMuted)}>{execution.reqLabel}</text>
                </Show>
                {/* Line 3: Duration */}
                <Show when={execution.timing.durationMs !== undefined}>
                  <text fg={rgba(theme.textMuted)}>{formatDuration(execution.timing.durationMs)}</text>
                </Show>
              </box>

              {/* Error (if failed) */}
              <Show when={execution.error}>
                <box id="error" flexDirection="column" marginBottom={1}>
                  <text fg={rgba(theme.error)} attributes={1}>
                    Error
                  </text>
                  <box flexDirection="row">
                    <text fg={rgba(theme.textMuted)}>Stage: </text>
                    <text fg={rgba(theme.error)}>{execution.error!.stage}</text>
                  </box>
                  <text fg={rgba(theme.error)}>{execution.error!.message}</text>
                </box>
              </Show>

              {/* Response */}
              <Show when={response()}>
                <box id="response" flexDirection="column" marginBottom={1}>
                  <text fg={rgba(theme.primary)} attributes={1}>
                    Response
                  </text>
                  <box flexDirection="row">
                    <text fg={rgba(theme.textMuted)}>Status: </text>
                    <text fg={rgba(getHttpStatusColor(response()!.status))}>
                      {response()!.status} {response()!.statusText}
                    </text>
                  </box>
                  <box flexDirection="row">
                    <text fg={rgba(theme.textMuted)}>Size: </text>
                    <text fg={rgba(theme.text)}>
                      {response()!.bodyBytes} bytes{response()!.truncated ? ' (truncated)' : ''}
                    </text>
                  </box>
                </box>

                {/* Response Cookies */}
                <Show when={cookies().length > 0}>
                  <box id="cookies" flexDirection="column" marginBottom={1}>
                    <text fg={rgba(theme.primary)} attributes={1}>
                      Cookies
                    </text>
                    <For each={cookies()}>
                      {(cookie) => (
                        <box flexDirection="row">
                          <text fg={rgba(theme.text)}>{cookie.value}</text>
                        </box>
                      )}
                    </For>
                  </box>
                </Show>

                {/* Response Headers */}
                <Show when={nonCookieHeaders().length > 0}>
                  <box id="headers" flexDirection="column" marginBottom={1}>
                    <text fg={rgba(theme.primary)} attributes={1}>
                      Headers
                    </text>
                    <For each={nonCookieHeaders()}>
                      {(header) => (
                        <box flexDirection="row">
                          <text fg={rgba(theme.textMuted)}>{header.name}: </text>
                          <text fg={rgba(theme.text)}>{header.value}</text>
                        </box>
                      )}
                    </For>
                  </box>
                </Show>

                {/* Response Body */}
                <Show when={body()}>
                  <box id="body" flexDirection="column">
                    <text fg={rgba(theme.primary)} attributes={1}>
                      Body
                    </text>
                    <text fg={rgba(theme.text)}>{body()}</text>
                  </box>
                </Show>
              </Show>
            </>
          )}
        </Show>
      </scrollbox>
    </box>
  );
}
