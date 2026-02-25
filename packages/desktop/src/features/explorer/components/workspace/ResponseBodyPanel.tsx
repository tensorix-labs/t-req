import type { PostExecuteResponses } from '@t-req/sdk/client';
import { createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';
import { decodeResponseBody, formatBytes, formatDuration } from '../../utils/response';
import { toResponseBodyViewModel } from '../../utils/response-view';
import { ChevronRightIcon } from '../icons';
import { JsonResponseViewer } from './JsonResponseViewer';

type ResponseTab = 'response' | 'headers';

type ExecuteResponseBody = PostExecuteResponses[200]['response'];

type ResponseBodyPanelProps = {
  onCollapse: () => void;
  response?: ExecuteResponseBody;
  durationMs?: number;
  isExecuting: boolean;
  error?: string;
};

export function ResponseBodyPanel(props: ResponseBodyPanelProps) {
  const [activeTab, setActiveTab] = createSignal<ResponseTab>('response');
  const statusBadgeClass = createMemo(() => {
    const base = 'badge badge-sm font-mono';
    if (props.isExecuting) {
      return `${base} badge-warning`;
    }
    if (props.error) {
      return `${base} badge-error`;
    }
    const response = props.response;
    if (!response) {
      return `${base} badge-ghost`;
    }
    if (response.status >= 200 && response.status < 300) {
      return `${base} badge-success`;
    }
    if (response.status >= 400) {
      return `${base} badge-error`;
    }
    return `${base} badge-info`;
  });

  const statusLabel = createMemo(() => {
    if (props.isExecuting) {
      return 'Sending';
    }
    if (props.error) {
      return 'Failed';
    }
    if (!props.response) {
      return 'Idle';
    }
    return `${props.response.status} ${props.response.statusText}`;
  });

  const metaLabel = createMemo(() => {
    if (props.isExecuting) {
      return 'Waiting for response…';
    }
    if (props.error) {
      return 'Execution error';
    }
    if (!props.response) {
      return 'Send a request to view response details';
    }
    const duration = props.durationMs ?? 0;
    const size = formatBytes(props.response.bodyBytes);
    const truncated = props.response.truncated ? ' (truncated)' : '';
    return `${formatDuration(duration)} · ${size}${truncated}`;
  });

  const responseBodyView = createMemo(() => {
    const response = props.response;
    if (!response) {
      return undefined;
    }
    return toResponseBodyViewModel(decodeResponseBody(response), response.headers);
  });

  return (
    <section class="min-h-0 min-w-0 flex flex-col overflow-hidden bg-base-200/10">
      <header class="flex flex-wrap items-center justify-between gap-2 border-b border-base-300/80 px-3 py-2.5">
        <div class="flex items-center gap-2">
          <h3 class="m-0 text-sm font-semibold text-base-content">Response Body</h3>
          <button
            type="button"
            class="btn btn-ghost btn-xs btn-square h-6 min-h-6 text-base-content/70 hover:text-base-content"
            onClick={props.onCollapse}
            aria-label="Collapse response panel"
            title="Collapse response panel"
          >
            <ChevronRightIcon class="size-3" />
          </button>
        </div>
        <div class="flex items-center gap-2">
          <span class={statusBadgeClass()}>{statusLabel()}</span>
          <span class="text-sm text-base-content/65">{metaLabel()}</span>
        </div>
      </header>

      <div role="tablist" class="tabs tabs-bordered tabs-md px-3 pt-1">
        <button
          type="button"
          role="tab"
          class="tab"
          classList={{ 'tab-active': activeTab() === 'response' }}
          onClick={() => setActiveTab('response')}
        >
          Response
        </button>
        <button
          type="button"
          role="tab"
          class="tab"
          classList={{ 'tab-active': activeTab() === 'headers' }}
          onClick={() => setActiveTab('headers')}
        >
          Headers
        </button>
      </div>

      <div class="min-h-0 min-w-0 flex-1 overflow-hidden px-3 pb-3 pt-2">
        <Switch>
          <Match when={activeTab() === 'response'}>
            <Switch>
              <Match when={props.error}>
                {(message) => (
                  <div
                    class="h-full overflow-auto rounded-box border border-error/40 bg-error/15 p-3 font-mono text-sm text-base-content"
                    role="alert"
                  >
                    {message()}
                  </div>
                )}
              </Match>

              <Match when={props.isExecuting}>
                <div class="h-full overflow-auto rounded-box border border-base-300 bg-base-100/80 p-3 font-mono text-sm text-base-content/70">
                  Executing request…
                </div>
              </Match>

              <Match when={!props.response}>
                <div class="h-full overflow-auto rounded-box border border-base-300 bg-base-100/80 p-3 font-mono text-sm text-base-content/70">
                  Send a request to view the response body.
                </div>
              </Match>

              <Match when={responseBodyView()}>
                {(bodyView) => {
                  const resolvedBodyView = bodyView();
                  switch (resolvedBodyView.kind) {
                    case 'json':
                      return (
                        <div class="h-full min-w-0 overflow-hidden rounded-box border border-base-300 bg-base-100">
                          <JsonResponseViewer value={resolvedBodyView.text} />
                        </div>
                      );
                    case 'text':
                      return (
                        <pre class="h-full min-w-0 overflow-auto whitespace-pre-wrap break-all rounded-box border border-base-300 bg-base-100/80 p-3 font-mono text-sm leading-7 text-base-content/80">
                          {resolvedBodyView.text}
                        </pre>
                      );
                    case 'empty':
                      return (
                        <div class="h-full overflow-auto rounded-box border border-base-300 bg-base-100/80 p-3 font-mono text-sm text-base-content/70">
                          No response body.
                        </div>
                      );
                  }
                }}
              </Match>
            </Switch>
          </Match>
          <Match when={activeTab() === 'headers'}>
            <Show
              when={props.response}
              fallback={
                <div class="h-full overflow-auto rounded-box border border-base-300 bg-base-100/80 p-3 font-mono text-sm text-base-content/70">
                  Send a request to view response headers.
                </div>
              }
            >
              {(response) => (
                <div class="h-full min-w-0 overflow-auto rounded-box border border-base-300 bg-base-100/80 p-2">
                  <table class="table table-sm table-fixed">
                    <thead>
                      <tr>
                        <th class="font-mono">Header</th>
                        <th class="font-mono">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={response().headers}>
                        {(header) => (
                          <tr>
                            <td class="font-mono text-base-content/70">{header.name}</td>
                            <td class="font-mono break-all text-base-content/60">{header.value}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              )}
            </Show>
          </Match>
        </Switch>
      </div>
    </section>
  );
}
