import { For, Show } from 'solid-js';
import { useWorkspace, useObserver } from '../../context';
import type { WorkspaceRequest } from '../../sdk';
import { SpinnerIcon } from '../icons';
import { RequestItem } from './RequestItem';

export function RequestList() {
  const store = useWorkspace();
  const observer = useObserver();

  const handleExecute = (request: WorkspaceRequest) => {
    const sdk = store.sdk();
    const path = store.selectedPath();
    if (!sdk || !path) return;
    const profile = store.activeProfile();
    observer.execute(sdk, path, request.index, profile);
  };

  return (
    <div class="flex flex-col h-full">
      <Show when={!store.selectedPath()}>
        <div class="flex flex-col items-center justify-center gap-3 p-12 text-treq-text-muted dark:text-treq-dark-text-muted text-center">
          <p>Select a file to view requests</p>
        </div>
      </Show>

      <Show when={store.selectedPath() && store.loadingRequests()}>
        <div class="flex items-center justify-center gap-3 p-12 text-treq-text-muted dark:text-treq-dark-text-muted">
          <SpinnerIcon />
          <span>Loading requests...</span>
        </div>
      </Show>

      <Show when={store.selectedPath() && !store.loadingRequests() && store.selectedRequests().length === 0}>
        <div class="flex flex-col items-center justify-center gap-3 p-12 text-treq-text-muted dark:text-treq-dark-text-muted text-center">
          <p>No requests in this file</p>
        </div>
      </Show>

      <Show when={store.selectedPath() && !store.loadingRequests() && store.selectedRequests().length > 0}>
        <ul class="list-none p-0 m-0 flex flex-col gap-2">
          <For each={store.selectedRequests()}>
            {(request) => (
              <RequestItem
                request={request}
                executing={observer.state.executing}
                onExecute={handleExecute}
              />
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
