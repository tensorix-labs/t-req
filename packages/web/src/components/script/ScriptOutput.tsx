import { createEffect, createMemo, For, Show } from 'solid-js';

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
  let scrollRef: HTMLDivElement | undefined;

  // Merge stdout and stderr into a single list
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
      scrollRef.scrollTop = scrollRef.scrollHeight;
    }
  });

  // Exit status display
  const exitStatus = createMemo(() => {
    const code = props.exitCode;
    if (code === undefined) return null;
    if (code === null) return { text: 'Killed', colorClass: 'text-http-put' };
    if (code === 0) return { text: 'Exited (0)', colorClass: 'text-http-get' };
    return { text: `Exited (${code})`, colorClass: 'text-http-delete' };
  });

  // Script name for header
  const scriptName = createMemo(() => {
    if (!props.scriptPath) return 'Script';
    const parts = props.scriptPath.split('/');
    return parts[parts.length - 1] ?? 'Script';
  });

  return (
    <div class="flex flex-col h-full overflow-hidden bg-white dark:bg-treq-dark-bg-card rounded-treq border border-treq-border-light dark:border-treq-dark-border-light">
      <div class="flex items-center justify-between px-4 py-2 border-b border-treq-border-light dark:border-treq-dark-border-light">
        <div class="flex items-center gap-2">
          <span class="text-label text-treq-accent">Output</span>
          <Show when={props.scriptPath}>
            <span class="text-sm text-treq-text-muted dark:text-treq-dark-text-muted">
              - {scriptName()}
            </span>
          </Show>
        </div>
        <div class="flex items-center gap-2">
          <Show when={props.isRunning}>
            <span class="text-sm text-http-put flex items-center gap-1">
              <span class="inline-block w-2 h-2 bg-http-put rounded-full animate-pulse" />
              Running
            </span>
          </Show>
          <Show when={exitStatus()}>
            <span class={`text-sm font-medium ${exitStatus()!.colorClass}`}>
              {exitStatus()!.text}
            </span>
          </Show>
        </div>
      </div>
      <div
        ref={scrollRef}
        class="flex-1 overflow-y-auto p-3 font-mono text-[13px] leading-relaxed bg-slate-50 dark:bg-slate-800"
      >
        <Show
          when={combinedLines().length > 0 || props.isRunning}
          fallback={
            <div class="text-treq-text-muted dark:text-treq-dark-text-muted">
              No output yet
            </div>
          }
        >
          <Show when={combinedLines().length === 0 && props.isRunning}>
            <div class="text-treq-text-muted dark:text-treq-dark-text-muted">
              Waiting for output...
            </div>
          </Show>
          <For each={combinedLines()}>
            {(line) => (
              <div
                class={`py-0.5 whitespace-pre-wrap break-all ${
                  line.isError
                    ? 'text-http-delete'
                    : 'text-treq-text-strong dark:text-treq-dark-text-strong'
                }`}
              >
                {line.text}
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
