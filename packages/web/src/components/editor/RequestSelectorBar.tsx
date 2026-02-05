import { type Component, For, Show, createSignal } from 'solid-js';
import type { WorkspaceRequest } from '../../sdk';
import { getMethodClasses } from '@t-req/ui';
import { ChevronIcon, SpinnerIcon } from '../icons';

interface RequestSelectorBarProps {
  requests: WorkspaceRequest[];
  selectedIndex: number;
  onSelectRequest: (index: number) => void;
  onExecute: () => void;
  executing: boolean;
  disabled: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const RequestSelectorBar: Component<RequestSelectorBarProps> = (props) => {
  const [dropdownOpen, setDropdownOpen] = createSignal(false);

  const selectedRequest = () => props.requests[props.selectedIndex];
  const hasRequests = () => props.requests.length > 0;
  const method = () => selectedRequest()?.method?.toUpperCase() ?? 'GET';

  const handleSelect = (index: number) => {
    props.onSelectRequest(index);
    setDropdownOpen(false);
  };

  const truncateUrl = (url: string, maxLength: number = 60) => {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
  };

  return (
    <div class="flex items-center gap-2 px-3 py-2 bg-white dark:bg-treq-dark-bg border-b border-treq-border-light dark:border-treq-dark-border-light">
      {/* Request selector dropdown */}
      <div class="relative flex-1 min-w-0">
        <Show
          when={hasRequests()}
          fallback={
            <div class="flex items-center gap-2 px-3 py-1.5 text-sm text-treq-text-muted dark:text-treq-dark-text-muted">
              No requests in file
            </div>
          }
        >
          <button
            type="button"
            class="flex items-center gap-2 w-full px-3 py-1.5 text-left bg-treq-bg dark:bg-treq-dark-bg-card border border-treq-border-light dark:border-treq-dark-border-light rounded-treq hover:border-treq-accent transition-colors"
            onClick={() => setDropdownOpen(!dropdownOpen())}
            disabled={props.disabled}
          >
            {/* Method badge */}
            <span class={getMethodClasses(method(), 'sm')}>
              {method()}
            </span>

            {/* URL display */}
            <span class="flex-1 text-sm text-treq-text-strong dark:text-treq-dark-text-strong truncate">
              {truncateUrl(selectedRequest()?.url ?? '')}
            </span>

            {/* Request name badge */}
            <Show when={selectedRequest()?.name}>
              <span class="text-xs text-treq-text-muted px-2 py-0.5 bg-treq-border-light rounded dark:text-treq-dark-text-muted dark:bg-treq-dark-border-light shrink-0">
                {selectedRequest()!.name}
              </span>
            </Show>

            {/* Dropdown indicator */}
            <span
              class="text-treq-text-muted dark:text-treq-dark-text-muted transition-transform shrink-0"
              classList={{ 'rotate-90': dropdownOpen() }}
            >
              <ChevronIcon />
            </span>
          </button>

          {/* Dropdown menu */}
          <Show when={dropdownOpen()}>
            {/* Backdrop to close dropdown */}
            <div
              class="fixed inset-0 z-10"
              onClick={() => setDropdownOpen(false)}
            />
            <div class="absolute top-full left-0 right-0 mt-1 z-20 bg-white dark:bg-treq-dark-bg-card border border-treq-border-light dark:border-treq-dark-border-light rounded-treq shadow-lg max-h-64 overflow-y-auto">
              <For each={props.requests}>
                {(request, index) => (
                  <button
                    type="button"
                    class="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-treq-border-light dark:hover:bg-treq-dark-border-light transition-colors"
                    classList={{
                      'bg-treq-accent/10': index() === props.selectedIndex
                    }}
                    onClick={() => handleSelect(index())}
                  >
                    <span class={getMethodClasses(request.method.toUpperCase(), 'sm')}>
                      {request.method.toUpperCase()}
                    </span>
                    <span class="flex-1 text-sm text-treq-text-strong dark:text-treq-dark-text-strong truncate">
                      {truncateUrl(request.url, 50)}
                    </span>
                    <Show when={request.name}>
                      <span class="text-xs text-treq-text-muted px-1.5 py-0.5 bg-treq-border-light rounded dark:text-treq-dark-text-muted dark:bg-treq-dark-border-light">
                        {request.name}
                      </span>
                    </Show>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>

      {/* Send button */}
      <button
        type="button"
        class="flex items-center justify-center gap-2 px-4 py-1.5 bg-http-get text-white text-sm font-medium rounded-treq transition-all duration-150 shrink-0 hover:enabled:bg-http-get/90 disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={props.onExecute}
        disabled={props.disabled || !hasRequests() || props.executing}
      >
        <Show when={props.executing}>
          <SpinnerIcon size="sm" />
        </Show>
        <span>{props.executing ? 'Sending...' : 'Send'}</span>
      </button>

      {/* Collapse toggle */}
      <button
        type="button"
        class="flex items-center justify-center w-8 h-8 text-treq-text-muted dark:text-treq-dark-text-muted hover:text-treq-text-strong dark:hover:text-treq-dark-text-strong hover:bg-treq-border-light dark:hover:bg-treq-dark-border-light rounded transition-colors"
        onClick={props.onToggleCollapse}
        title={props.collapsed ? 'Show results panel' : 'Hide results panel'}
      >
        <span
          class="transition-transform"
          classList={{
            'rotate-180': props.collapsed,
            'rotate-0': !props.collapsed
          }}
        >
          <ChevronIcon />
        </span>
      </button>
    </div>
  );
};
