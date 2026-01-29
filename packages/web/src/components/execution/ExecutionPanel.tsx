import { Show, createMemo } from 'solid-js';
import { useObserver } from '../../context';
import { ExecutionDetail } from './ExecutionDetail';
import { ExecutionHistoryModal } from './ExecutionHistoryModal';

export function ExecutionPanel() {
  const observer = useObserver();

  // Only show explicitly selected execution (no fallback to latest)
  const displayedExecution = createMemo(() => {
    return observer.selectedExecution();
  });

  const handleClearAll = () => {
    observer.clearExecutions();
    observer.closeHistory();
  };

  const showHistory = () => observer.state.showHistory;

  return (
    <div class="flex flex-col h-full">
      <Show
        when={displayedExecution()}
        fallback={
          <div class="flex flex-col items-center justify-center gap-2 p-8 text-treq-text-muted dark:text-treq-dark-text-muted text-center h-full">
            <p class="m-0 text-sm">Click Send to execute the request</p>
          </div>
        }
      >
        <div class="flex-1 flex flex-col border border-treq-border-light rounded-treq overflow-hidden min-h-0 dark:border-treq-dark-border-light">
          <ExecutionDetail execution={displayedExecution()!} />
        </div>
      </Show>

      <Show when={showHistory()}>
        <ExecutionHistoryModal
          executions={observer.executionsList()}
          selectedId={observer.selectedExecution()?.reqExecId}
          onSelect={(id) => observer.selectExecution(id)}
          onClearAll={handleClearAll}
          onClose={() => observer.closeHistory()}
        />
      </Show>
    </div>
  );
}
