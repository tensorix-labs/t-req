import { createSignal, createResource, For, Show } from 'solid-js';
import type { ExecutionSummary } from '../../stores/observer';
import { ResponseViewer } from '../response';
import { useSDK } from '../../context/workspace';
import type { PluginHookInfo } from '../../sdk';

type TabType = 'response' | 'headers' | 'plugins';

interface ExecutionDetailProps {
  execution: ExecutionSummary;
}

export function ExecutionDetail(props: ExecutionDetailProps) {
  const sdk = useSDK();
  const [activeTab, setActiveTab] = createSignal<TabType>('response');

  // Fetch full execution details (includes pluginHooks) when plugins tab is active
  const [executionDetail] = createResource(
    () => (activeTab() === 'plugins' ? props.execution : null),
    async (exec) => {
      if (!exec || !sdk()) return null;
      try {
        return await sdk()!.getExecution(exec.flowId, exec.reqExecId);
      } catch {
        return null;
      }
    }
  );

  const pluginHooks = (): PluginHookInfo[] => {
    return executionDetail()?.pluginHooks ?? [];
  };

  const timing = () => {
    const ms = props.execution.timing.durationMs;
    if (ms === undefined) return 'Running...';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
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

  const tabClasses = (tab: TabType) => {
    const base = 'px-4 py-2 text-sm font-medium transition-all duration-150 border-b-2 -mb-px';
    if (activeTab() === tab) {
      return `${base} text-treq-accent border-treq-accent`;
    }
    return `${base} text-treq-text-muted dark:text-treq-dark-text-muted border-transparent hover:text-treq-text-strong dark:hover:text-treq-dark-text-strong`;
  };

  return (
    <div class="flex flex-col h-full overflow-hidden">
      {/* Status bar - compact, no URL duplication */}
      <div class="flex items-center gap-4 px-4 py-2 border-b border-treq-border-light bg-white dark:border-treq-dark-border-light dark:bg-treq-dark-bg">
        <Show when={props.execution.response}>
          <span class={statusClasses()}>
            {props.execution.response!.status} {props.execution.response!.statusText}
          </span>
        </Show>
        <Show when={props.execution.status === 'running'}>
          <span class="text-sm text-treq-text-muted dark:text-treq-dark-text-muted">
            Running...
          </span>
        </Show>
        <span class="font-mono text-xs text-treq-text-muted dark:text-treq-dark-text-muted">
          {timing()}
        </span>
      </div>

      <Show when={props.execution.error}>
        <div class="px-4 py-3 bg-http-delete/10 text-http-delete text-sm font-medium rounded-treq mx-4 mt-4">
          <strong>{props.execution.error!.stage}:</strong> {props.execution.error!.message}
        </div>
      </Show>

      <Show when={props.execution.response}>
        <div class="flex border-b border-treq-border-light dark:border-treq-dark-border-light bg-white dark:bg-treq-dark-bg">
          <button
            type="button"
            class={tabClasses('response')}
            onClick={() => setActiveTab('response')}
          >
            Response
          </button>
          <button
            type="button"
            class={tabClasses('headers')}
            onClick={() => setActiveTab('headers')}
          >
            Headers
            <span class="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-treq-border-light dark:bg-treq-dark-border-light">
              {props.execution.response!.headers.length}
            </span>
          </button>
          <button
            type="button"
            class={tabClasses('plugins')}
            onClick={() => setActiveTab('plugins')}
          >
            Plugins
          </button>
        </div>

        <div class="flex-1 overflow-y-auto bg-white dark:bg-treq-dark-bg-card">
          <Show when={activeTab() === 'response'}>
            <Show when={props.execution.response!.body}>
              <div class="flex-1 flex flex-col min-h-0 h-full">
                <div class="flex-1 overflow-hidden min-h-[200px]">
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
            <Show when={!props.execution.response!.body}>
              <div class="p-4 text-center text-treq-text-muted dark:text-treq-dark-text-muted">
                No response body
              </div>
            </Show>
          </Show>

          <Show when={activeTab() === 'headers'}>
            <div class="p-4">
              <div class="flex flex-col gap-1 p-3 bg-slate-50 dark:bg-slate-800 rounded-treq">
                <For each={props.execution.response!.headers}>
                  {(header) => (
                    <div class="flex gap-4 font-mono text-[13px] leading-relaxed">
                      <span class="min-w-[180px] text-treq-text-muted dark:text-treq-dark-text-muted shrink-0">
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
          </Show>

          <Show when={activeTab() === 'plugins'}>
            <div class="p-4">
              <Show when={executionDetail.loading}>
                <div class="text-center text-treq-text-muted dark:text-treq-dark-text-muted">
                  Loading plugin info...
                </div>
              </Show>
              <Show when={!executionDetail.loading && pluginHooks().length === 0}>
                <div class="text-center text-treq-text-muted dark:text-treq-dark-text-muted">
                  No plugins executed
                </div>
              </Show>
              <Show when={!executionDetail.loading && pluginHooks().length > 0}>
                <div class="flex flex-col gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-treq">
                  <For each={pluginHooks()}>
                    {(hookInfo) => (
                      <div class="flex items-center gap-3 font-mono text-[13px]">
                        <span class="text-treq-accent font-medium">
                          {hookInfo.pluginName}
                        </span>
                        <span class="text-treq-text-muted dark:text-treq-dark-text-muted">
                          {hookInfo.hook}
                        </span>
                        <span class="text-treq-text-muted dark:text-treq-dark-text-muted">
                          +{hookInfo.durationMs}ms
                        </span>
                        <Show when={hookInfo.modified}>
                          <span class="text-http-get font-medium">(mod)</span>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
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
