import { useWorkspace } from '../../context';
import { RequestList } from '../request-list';
import { ExecutionPanel } from '../execution';

export function MainContent() {
  const store = useWorkspace();

  const selectedFileName = () => {
    const node = store.selectedNode();
    return node?.node.name;
  };

  return (
    <main class="flex-1 flex flex-col overflow-hidden bg-treq-bg-card dark:bg-treq-dark-bg-card">
      <div class="px-6 py-3 border-b border-treq-border-light dark:border-treq-dark-border-light">
        <h2 class="text-base font-semibold text-treq-text-strong m-0 dark:text-treq-dark-text-strong">
          {selectedFileName() || 'Requests'}
        </h2>
      </div>
      <div class="flex-1 overflow-hidden px-6 py-4">
        <div class="flex h-full gap-6">
          <div class="flex-1 min-w-[300px] max-w-[400px] overflow-y-auto">
            <RequestList />
          </div>
          <div class="flex-[2] min-w-0 overflow-hidden">
            <ExecutionPanel />
          </div>
        </div>
      </div>
    </main>
  );
}
