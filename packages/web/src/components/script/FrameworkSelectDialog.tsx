import { For, Show } from 'solid-js';
import type { TestFrameworkOption } from '../../sdk';

export interface FrameworkSelectDialogProps {
  isOpen: boolean;
  testPath: string;
  options: TestFrameworkOption[];
  onSelect: (frameworkId: string) => void;
  onClose: () => void;
}

export function FrameworkSelectDialog(props: FrameworkSelectDialogProps) {
  const testName = () => {
    const parts = props.testPath.split('/');
    return parts[parts.length - 1] ?? 'Test';
  };

  return (
    <Show when={props.isOpen}>
      <div
        class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            props.onClose();
          }
        }}
      >
        <div class="bg-white dark:bg-treq-dark-bg-card rounded-treq shadow-xl max-w-md w-full mx-4 overflow-hidden border border-treq-border-light dark:border-treq-dark-border">
          <div class="px-6 py-4 border-b border-treq-border-light dark:border-treq-dark-border-light">
            <h2 class="text-heading-3 text-treq-text-strong dark:text-treq-dark-text-strong m-0">
              Select Framework
            </h2>
            <p class="text-sm text-treq-text-muted dark:text-treq-dark-text-muted mt-1 m-0">
              Choose how to test <span class="font-mono text-treq-accent">{testName()}</span>
            </p>
          </div>

          <div class="p-4">
            <Show
              when={props.options.length > 0}
              fallback={
                <div class="text-center py-8 text-treq-text-muted dark:text-treq-dark-text-muted">
                  No test frameworks available for this file type
                </div>
              }
            >
              <div class="flex flex-col gap-2">
                <For each={props.options}>
                  {(option) => (
                    <button
                      type="button"
                      onClick={() => props.onSelect(option.id)}
                      class="flex items-center gap-3 px-4 py-3 text-left rounded-treq border border-treq-border-light dark:border-treq-dark-border-light hover:border-treq-accent hover:bg-treq-accent/5 dark:hover:bg-treq-accent/10 transition-all duration-150"
                    >
                      <div class="w-8 h-8 flex items-center justify-center rounded-full bg-treq-accent/10 text-treq-accent">
                        <FrameworkIcon />
                      </div>
                      <div class="flex-1">
                        <div class="font-medium text-treq-text-strong dark:text-treq-dark-text-strong">
                          {option.label}
                        </div>
                        <div class="text-xs text-treq-text-muted dark:text-treq-dark-text-muted font-mono">
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
              class="px-4 py-2 text-sm font-medium text-treq-text dark:text-treq-dark-text hover:bg-treq-border-light dark:hover:bg-treq-dark-border-light rounded-treq transition-all duration-150"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}

function FrameworkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8L6.5 11.5L13 4.5"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
