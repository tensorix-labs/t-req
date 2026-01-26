import { For, Show } from 'solid-js';
import type { RunnerOption } from '../../sdk';

export interface RunnerSelectDialogProps {
  isOpen: boolean;
  scriptPath: string;
  options: RunnerOption[];
  onSelect: (runnerId: string) => void;
  onClose: () => void;
}

export function RunnerSelectDialog(props: RunnerSelectDialogProps) {
  const scriptName = () => {
    const parts = props.scriptPath.split('/');
    return parts[parts.length - 1] ?? 'Script';
  };

  return (
    <Show when={props.isOpen}>
      <div
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            props.onClose();
          }
        }}
      >
        <div class="bg-treq-bg-card dark:bg-treq-dark-bg-card rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
          <div class="px-6 py-4 border-b border-treq-border-light dark:border-treq-dark-border-light">
            <h2 class="text-lg font-semibold text-treq-text-strong dark:text-treq-dark-text-strong m-0">
              Select Runner
            </h2>
            <p class="text-sm text-treq-text-muted dark:text-treq-dark-text-muted mt-1 m-0">
              Choose how to run <span class="font-mono">{scriptName()}</span>
            </p>
          </div>

          <div class="p-4">
            <Show
              when={props.options.length > 0}
              fallback={
                <div class="text-center py-8 text-treq-text-muted dark:text-treq-dark-text-muted">
                  No runners available for this file type
                </div>
              }
            >
              <div class="flex flex-col gap-2">
                <For each={props.options}>
                  {(option) => (
                    <button
                      type="button"
                      onClick={() => props.onSelect(option.id)}
                      class="flex items-center gap-3 px-4 py-3 text-left rounded-treq border border-treq-border-light dark:border-treq-dark-border-light hover:bg-treq-border-light dark:hover:bg-treq-dark-border-light transition-colors"
                    >
                      <div class="w-8 h-8 flex items-center justify-center rounded-full bg-treq-accent/10 text-treq-accent">
                        <RunnerIcon />
                      </div>
                      <div class="flex-1">
                        <div class="font-medium text-treq-text-strong dark:text-treq-dark-text-strong">
                          {option.label}
                        </div>
                        <div class="text-xs text-treq-text-muted dark:text-treq-dark-text-muted">
                          {option.id}
                        </div>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>

          <div class="px-6 py-4 border-t border-treq-border-light dark:border-treq-dark-border-light flex justify-end">
            <button
              type="button"
              onClick={props.onClose}
              class="px-4 py-2 text-sm font-medium text-treq-text dark:text-treq-dark-text hover:bg-treq-border-light dark:hover:bg-treq-dark-border-light rounded-treq transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}

function RunnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M4 3L12 8L4 13V3Z"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
    </svg>
  );
}
