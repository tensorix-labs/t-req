import { Show } from 'solid-js';
import { useObserver } from '../../context';
import { ScriptOutput } from './ScriptOutput';

export interface ScriptPanelProps {
  scriptPath: string;
  isRunning: boolean;
  onRun: () => void;
  onCancel: () => void;
}

export function ScriptPanel(props: ScriptPanelProps) {
  const observer = useObserver();

  const hasOutput = () =>
    observer.state.stdoutLines.length > 0 ||
    observer.state.stderrLines.length > 0 ||
    observer.state.exitCode !== undefined;

  const scriptName = () => {
    const parts = props.scriptPath.split('/');
    return parts[parts.length - 1] ?? 'Script';
  };

  return (
    <div class="flex flex-col h-full">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold text-treq-text-strong dark:text-treq-dark-text-strong m-0">
          {scriptName()}
        </h3>
        <div class="flex items-center gap-2">
          <Show
            when={!props.isRunning}
            fallback={
              <button
                type="button"
                onClick={props.onCancel}
                class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-500 rounded-treq hover:bg-red-600 transition-colors"
              >
                <StopIcon />
                Cancel
              </button>
            }
          >
            <button
              type="button"
              onClick={props.onRun}
              class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-treq-accent rounded-treq hover:bg-treq-accent-light transition-colors"
            >
              <PlayIcon />
              Run Script
            </button>
          </Show>
        </div>
      </div>

      <Show
        when={hasOutput() || props.isRunning}
        fallback={
          <div class="flex-1 flex flex-col items-center justify-center gap-2 p-12 text-treq-text-muted dark:text-treq-dark-text-muted text-center border border-dashed border-treq-border-light dark:border-treq-dark-border-light rounded-treq">
            <p class="m-0">No script output yet</p>
            <p class="m-0 text-sm">Click "Run Script" to execute this file</p>
          </div>
        }
      >
        <div class="flex-1 min-h-0">
          <ScriptOutput
            stdoutLines={observer.state.stdoutLines}
            stderrLines={observer.state.stderrLines}
            exitCode={observer.state.exitCode}
            isRunning={props.isRunning}
            scriptPath={props.scriptPath}
          />
        </div>
      </Show>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3.5 2.5L11.5 7L3.5 11.5V2.5Z" fill="currentColor" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="3" y="3" width="8" height="8" fill="currentColor" rx="1" />
    </svg>
  );
}
