import { For, Show } from 'solid-js';
import { useObserver } from '../../context';
import { ExecutionListItem } from './ExecutionListItem';
import { ExecutionDetail } from './ExecutionDetail';

export function ExecutionPanel() {
  const observer = useObserver();

  return (
    <div class="flex flex-col h-full">
      <Show when={observer.executionsList().length === 0}>
        <div class="flex flex-col items-center justify-center gap-2 p-12 text-treq-text-muted dark:text-treq-dark-text-muted text-center">
          <p class="m-0">No executions yet</p>
          <p class="m-0 text-sm">Click the play button on a request to execute it</p>
        </div>
      </Show>

      <Show when={observer.executionsList().length > 0}>
        <div class="flex flex-col h-full gap-4">
          <div class="flex flex-col max-h-[200px] border border-treq-border-light rounded-treq overflow-hidden dark:border-treq-dark-border-light">
            <div class="flex items-center justify-between px-3 py-2 border-b border-treq-border-light bg-treq-bg dark:border-treq-dark-border-light dark:bg-treq-dark-bg">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-treq-text-muted m-0 dark:text-treq-dark-text-muted">
                Executions
              </h3>
              <span class="text-xs px-1.5 py-0.5 bg-treq-accent text-white rounded-full">
                {observer.executionsList().length}
              </span>
            </div>
            <ul class="list-none p-0 m-0 overflow-y-auto">
              <For each={observer.executionsList()}>
                {(exec) => (
                  <ExecutionListItem
                    execution={exec}
                    isSelected={observer.selectedExecution()?.reqExecId === exec.reqExecId}
                    onSelect={() => observer.selectExecution(exec.reqExecId)}
                  />
                )}
              </For>
            </ul>
          </div>

          <Show when={observer.selectedExecution()}>
            <div class="flex-1 flex flex-col border border-treq-border-light rounded-treq overflow-hidden min-h-0 dark:border-treq-dark-border-light">
              <ExecutionDetail execution={observer.selectedExecution()!} />
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
