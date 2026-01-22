import { createEffect, createMemo, For, Show } from 'solid-js';
import type { ScrollBoxRenderable } from '@opentui/core';
import { theme, rgba } from '../theme';

export interface ScriptOutputProps {
  stdoutLines: string[];
  stderrLines: string[];
  exitCode: number | null | undefined;
  isRunning: boolean;
  scriptPath?: string;
}

interface OutputLine {
  text: string;
  isError: boolean;
}

export function ScriptOutput(props: ScriptOutputProps) {
  let scrollRef: ScrollBoxRenderable | undefined;

  // Merge stdout and stderr into a single list (alternating as they arrive)
  // For simplicity, we'll show stdout first, then stderr
  const combinedLines = createMemo(() => {
    const lines: OutputLine[] = [];

    for (const line of props.stdoutLines) {
      if (line.trim()) {
        lines.push({ text: line, isError: false });
      }
    }

    for (const line of props.stderrLines) {
      if (line.trim()) {
        lines.push({ text: line, isError: true });
      }
    }

    return lines;
  });

  // Auto-scroll to bottom when new output arrives
  createEffect(() => {
    const len = combinedLines().length;
    if (scrollRef && len > 0) {
      scrollRef.scrollTo(len - 1);
    }
  });

  // Exit status display
  const exitStatus = createMemo(() => {
    const code = props.exitCode;
    if (code === undefined) return null;
    if (code === null) return { text: 'Killed', color: theme.warning };
    if (code === 0) return { text: 'Exited (0)', color: theme.success };
    return { text: `Exited (${code})`, color: theme.error };
  });

  // Script name for header
  const scriptName = createMemo(() => {
    if (!props.scriptPath) return 'Script';
    const parts = props.scriptPath.split('/');
    return parts[parts.length - 1] ?? 'Script';
  });

  return (
    <box flexGrow={1} flexDirection="column" overflow="hidden" backgroundColor={rgba(theme.backgroundPanel)}>
      <box paddingLeft={2} paddingTop={1} paddingBottom={1} flexDirection="row" justifyContent="space-between">
        <box flexDirection="row">
          <text fg={rgba(theme.primary)} attributes={1}>
            Output
          </text>
          <Show when={props.scriptPath}>
            <text fg={rgba(theme.textMuted)}> - {scriptName()}</text>
          </Show>
        </box>
        <box flexDirection="row" gap={1}>
          <Show when={props.isRunning}>
            <text fg={rgba(theme.warning)}> Running</text>
          </Show>
          <Show when={exitStatus()}>
            <text fg={rgba(exitStatus()!.color)}> {exitStatus()!.text}</text>
          </Show>
        </box>
      </box>
      <scrollbox ref={(r) => (scrollRef = r)} flexGrow={1} paddingLeft={1} paddingRight={1}>
        <Show
          when={combinedLines().length > 0 || props.isRunning}
          fallback={
            <box id="empty-state" paddingLeft={2}>
              <text fg={rgba(theme.textMuted)}>No output yet</text>
            </box>
          }
        >
          <Show when={combinedLines().length === 0 && props.isRunning}>
            <box id="waiting-state" paddingLeft={2}>
              <text fg={rgba(theme.textMuted)}>Waiting for output...</text>
            </box>
          </Show>
          <For each={combinedLines()}>
            {(line, index) => (
              <box id={`output-${index()}`} height={1} flexShrink={0} paddingLeft={1}>
                <text fg={rgba(line.isError ? theme.error : theme.text)}>{line.text}</text>
              </box>
            )}
          </For>
        </Show>
      </scrollbox>
    </box>
  );
}
