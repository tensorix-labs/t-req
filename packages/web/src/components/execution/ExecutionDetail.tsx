import { For, Show } from 'solid-js';
import type { ExecutionSummary } from '../../stores/observer';
import { ResponseViewer } from '../response';

interface ExecutionDetailProps {
  execution: ExecutionSummary;
}

export function ExecutionDetail(props: ExecutionDetailProps) {
  const timing = () => {
    const ms = props.execution.timing.durationMs;
    if (ms === undefined) return 'Running...';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const methodClasses = () => {
    const base = 'font-mono text-xs font-semibold px-2 py-1 rounded uppercase';
    const method = props.execution.method?.toUpperCase();
    switch (method) {
      case 'GET':
        return `${base} bg-http-get/15 text-http-get`;
      case 'POST':
        return `${base} bg-http-post/15 text-http-post`;
      case 'PUT':
        return `${base} bg-http-put/15 text-http-put`;
      case 'PATCH':
        return `${base} bg-http-patch/15 text-http-patch`;
      case 'DELETE':
        return `${base} bg-http-delete/15 text-http-delete`;
      default:
        return `${base} bg-treq-border-light text-treq-text-muted`;
    }
  };

  const statusClasses = () => {
    const base = 'font-mono text-sm font-semibold';
    const status = props.execution.response?.status;
    if (!status) return base;
    if (status >= 200 && status < 300) return `${base} text-http-get`;
    if (status >= 300 && status < 400) return `${base} text-http-put`;
    if (status >= 400) return `${base} text-http-delete`;
    return base;
  };

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="flex flex-col gap-2 px-4 py-3 border-b border-treq-border-light bg-treq-bg dark:border-treq-dark-border-light dark:bg-treq-dark-bg">
        <div class="flex items-center gap-3">
          <span class={methodClasses()}>
            {props.execution.method?.toUpperCase()}
          </span>
          <span class="flex-1 font-mono text-sm text-treq-text-strong overflow-hidden text-ellipsis whitespace-nowrap dark:text-treq-dark-text-strong">
            {props.execution.urlResolved}
          </span>
        </div>
        <div class="flex items-center gap-4">
          <Show when={props.execution.response}>
            <span class={statusClasses()}>
              {props.execution.response!.status} {props.execution.response!.statusText}
            </span>
          </Show>
          <span class="font-mono text-xs text-treq-text-muted dark:text-treq-dark-text-muted">
            {timing()}
          </span>
        </div>
      </div>

      <Show when={props.execution.error}>
        <div class="px-4 py-3 bg-http-delete/10 text-http-delete text-sm">
          <strong>{props.execution.error!.stage}:</strong> {props.execution.error!.message}
        </div>
      </Show>

      <Show when={props.execution.response}>
        <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          <div>
            <h4 class="text-xs font-semibold uppercase tracking-wide text-treq-text-muted m-0 mb-2 dark:text-treq-dark-text-muted">
              Response Headers
            </h4>
            <div class="flex flex-col gap-1">
              <For each={props.execution.response!.headers}>
                {(header) => (
                  <div class="flex gap-4 font-mono text-xs">
                    <span class="min-w-[150px] text-treq-text-muted dark:text-treq-dark-text-muted">
                      {header.name}
                    </span>
                    <span class="flex-1 text-treq-text-strong break-all dark:text-treq-dark-text-strong">
                      {header.value}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </div>

          <Show when={props.execution.response!.body}>
            <div class="flex-1 flex flex-col min-h-0">
              <h4 class="text-xs font-semibold uppercase tracking-wide text-treq-text-muted m-0 mb-2 dark:text-treq-dark-text-muted">
                Response Body
              </h4>
              <div class="flex-1 border border-treq-border-light rounded-treq overflow-hidden min-h-[200px] dark:border-treq-dark-border-light">
                <ResponseViewer
                  body={props.execution.response!.body!}
                  contentType={getContentType(props.execution.response!.headers)}
                  encoding={props.execution.response!.encoding}
                  truncated={props.execution.response!.truncated}
                  bodyBytes={props.execution.response!.bodyBytes}
                />
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function getContentType(headers: Array<{ name: string; value: string }>): string | undefined {
  const header = headers.find(h => h.name.toLowerCase() === 'content-type');
  return header?.value;
}
