import { For, Show } from 'solid-js';
import { rgba, theme } from '../../theme';

export interface HeadersTabProps {
  cookies: Array<{ name: string; value: string }>;
  headers: Array<{ name: string; value: string }>;
}

export function HeadersTab(props: HeadersTabProps) {
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
