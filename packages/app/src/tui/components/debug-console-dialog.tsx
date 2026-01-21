import { useKeyboard } from '@opentui/solid';
import { For, type JSX } from 'solid-js';
import { useDialog } from '../context/dialog';
import { useKeybind } from '../context/keybind';
import { useLog, type LogLevel } from '../context/log';
import { rgba, theme } from '../theme';

function getLogLevelColor(level: LogLevel): string {
  switch (level) {
    case 'error':
      return theme.error;
    case 'warn':
      return theme.warning;
    case 'info':
      return theme.info;
    case 'debug':
      return theme.textMuted;
  }
}

function formatLogData(data: unknown): string {
  if (data === undefined) return '';
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export function DebugConsoleDialog(): JSX.Element {
  const dialog = useDialog();
  const keybind = useKeybind();
  const log = useLog();

  useKeyboard((evt) => {
    if (evt.name === 'escape' || keybind.match('debug_console', evt)) {
      evt.preventDefault();
      evt.stopPropagation();
      dialog.clear();
      return;
    }
  });

  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1} paddingBottom={1}>
      <box height={1} flexDirection="row" justifyContent="space-between">
        <text fg={rgba(theme.text)}>Debug Console</text>
        <text fg={rgba(theme.textMuted)}>esc</text>
      </box>

      <box paddingTop={1} paddingBottom={1}>
        <text fg={rgba(theme.textMuted)}>
          Showing {log.entries().length} log entries
        </text>
      </box>

      <scrollbox height={12} paddingLeft={1} paddingRight={1}>
        <For each={log.entries()}>
          {(e) => (
            <box height={1} flexDirection="row" gap={2}>
              <text fg={rgba(theme.textMuted)}>
                {new Date(e.at).toLocaleTimeString()}
              </text>
              <text fg={rgba(getLogLevelColor(e.level))}>
                [{e.level.toUpperCase().padEnd(5)}]
              </text>
              <text fg={rgba(theme.text)}>
                {e.message}
                {e.data !== undefined ? ` ${formatLogData(e.data)}` : ''}
              </text>
            </box>
          )}
        </For>
      </scrollbox>
    </box>
  );
}
