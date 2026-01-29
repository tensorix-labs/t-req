import { For, Show } from 'solid-js';
import type { ExecutionSummary } from '../../stores/observer';
import { ExecutionListItem } from './ExecutionListItem';

interface ExecutionHistoryModalProps {
  executions: ExecutionSummary[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}

export function ExecutionHistoryModal(props: ExecutionHistoryModalProps) {
  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      props.onClose();
    }
  };

  const handleSelect = (id: string) => {
    props.onSelect(id);
    props.onClose();
  };

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div class="bg-white dark:bg-treq-dark-bg-card rounded-treq shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col border border-treq-border-light dark:border-treq-dark-border-light">
        <div class="flex items-center justify-between px-4 py-3 border-b border-treq-border-light dark:border-treq-dark-border-light">
          <h2 class="text-base font-semibold text-treq-text-strong dark:text-treq-dark-text-strong m-0">
            Execution History
          </h2>
          <div class="flex items-center gap-2">
            <button
              type="button"
              onClick={props.onClearAll}
              class="text-xs px-2 py-1 rounded bg-http-delete/10 text-http-delete hover:bg-http-delete/20 transition-colors"
            >
              Clear All
            </button>
            <button
              type="button"
              onClick={props.onClose}
              class="text-treq-text-muted dark:text-treq-dark-text-muted hover:text-treq-text-strong dark:hover:text-treq-dark-text-strong transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M6 6L14 14M14 6L6 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto">
          <Show
            when={props.executions.length > 0}
            fallback={
              <div class="flex items-center justify-center p-8 text-treq-text-muted dark:text-treq-dark-text-muted">
                No executions yet
              </div>
            }
          >
            <ul class="list-none p-0 m-0">
              <For each={props.executions}>
                {(exec) => (
                  <ExecutionListItem
                    execution={exec}
                    isSelected={props.selectedId === exec.reqExecId}
                    onSelect={() => handleSelect(exec.reqExecId)}
                  />
                )}
              </For>
            </ul>
          </Show>
        </div>

        <div class="px-4 py-3 border-t border-treq-border-light dark:border-treq-dark-border-light text-xs text-treq-text-muted dark:text-treq-dark-text-muted">
          {props.executions.length} execution{props.executions.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}
