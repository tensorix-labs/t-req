import { createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';
import {
  formatDiagnosticLocation,
  type ParseDiagnostic,
  type RequestBodySummary,
  type RequestDetailsRow
} from '../../utils/request-details';

type RequestDetailsTab = 'params' | 'body' | 'headers' | 'diagnostics';

type RequestDetailsPanelProps = {
  hasRequest: boolean;
  params: RequestDetailsRow[];
  headers: RequestDetailsRow[];
  bodySummary: RequestBodySummary;
  diagnostics: ParseDiagnostic[];
  fileDiagnostics: ParseDiagnostic[];
  isLoading?: boolean;
  error?: string;
};

function diagnosticSeverityClass(severity: ParseDiagnostic['severity']): string {
  const base = 'badge badge-xs font-mono uppercase tracking-[0.04em]';
  switch (severity) {
    case 'error':
      return `${base} badge-error`;
    case 'warning':
      return `${base} badge-warning`;
    default:
      return `${base} badge-info`;
  }
}

export function RequestDetailsPanel(props: RequestDetailsPanelProps) {
  const [activeTab, setActiveTab] = createSignal<RequestDetailsTab>('params');
  const visibleDiagnostics = createMemo(() => {
    if (props.diagnostics.length > 0) {
      return props.diagnostics;
    }
    return props.fileDiagnostics;
  });

  return (
    <section class="min-h-0 min-w-0 flex flex-col overflow-hidden border-r border-base-300 bg-base-200/10">
      <header class="flex items-center justify-between gap-2 border-b border-base-300/80 px-3 py-2.5">
        <h3 class="m-0 text-sm font-semibold text-base-content">Request Details</h3>
        <div class="flex items-center gap-2">
          <Show when={props.isLoading}>
            <span class="badge badge-sm badge-warning font-mono">Parsing…</span>
          </Show>
          <Show when={!props.isLoading && props.error}>
            <span class="badge badge-sm badge-error font-mono">Unavailable</span>
          </Show>
        </div>
      </header>

      <Show when={props.error}>
        {(message) => (
          <div class="mx-3 mt-2 rounded-box border border-error/40 bg-error/15 px-3 py-2 text-sm text-base-content">
            {message()}
          </div>
        )}
      </Show>

      <div role="tablist" class="tabs tabs-bordered tabs-md px-3 pt-1">
        <button
          type="button"
          role="tab"
          class="tab"
          classList={{ 'tab-active': activeTab() === 'params' }}
          onClick={() => setActiveTab('params')}
        >
          Params
        </button>
        <button
          type="button"
          role="tab"
          class="tab"
          classList={{ 'tab-active': activeTab() === 'body' }}
          onClick={() => setActiveTab('body')}
        >
          Body
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
        <button
          type="button"
          role="tab"
          class="tab"
          classList={{ 'tab-active': activeTab() === 'diagnostics' }}
          onClick={() => setActiveTab('diagnostics')}
        >
          Diagnostics
        </button>
      </div>

      <div class="min-h-0 min-w-0 flex-1 overflow-hidden px-3 pb-3 pt-2">
        <Switch>
          <Match when={activeTab() === 'params'}>
            <Show
              when={props.hasRequest}
              fallback={
                <div class="h-full overflow-auto rounded-box border border-base-300 bg-base-100/80 p-2" />
              }
            >
              <div class="h-full min-w-0 overflow-auto rounded-box border border-base-300 bg-base-100/80 p-2">
                <table class="table table-sm table-fixed">
                  <thead>
                    <tr>
                      <th class="font-mono">Name</th>
                      <th class="font-mono">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={props.params}>
                      {(param) => (
                        <tr>
                          <td class="font-mono break-all text-base-content/70">{param.key}</td>
                          <td class="font-mono break-all text-base-content/60">{param.value}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </Match>

          <Match when={activeTab() === 'body'}>
            <Show
              when={props.hasRequest}
              fallback={
                <div class="h-full overflow-auto rounded-box border border-base-300 bg-base-100/80 p-3" />
              }
            >
              {(() => {
                const hasAnyBodySignal =
                  props.bodySummary.hasBody ||
                  props.bodySummary.hasFormData ||
                  props.bodySummary.hasBodyFile;
                const bodyKindLabel =
                  props.bodySummary.kind === 'inline'
                    ? 'Inline Body'
                    : props.bodySummary.kind === 'form-data'
                      ? 'Form Data'
                      : props.bodySummary.kind === 'file'
                        ? 'Body File'
                        : undefined;

                return (
                  <div class="h-full overflow-auto rounded-box border border-base-300 bg-base-100/80 p-3">
                    <Show when={hasAnyBodySignal}>
                      <div class="flex flex-wrap items-center gap-2">
                        <Show when={bodyKindLabel}>
                          {(label) => (
                            <span class="badge badge-sm border-base-300 bg-base-300/60 font-mono">
                              {label()}
                            </span>
                          )}
                        </Show>
                        <Show when={props.bodySummary.hasBody}>
                          <span class="badge badge-sm badge-success font-mono">hasBody</span>
                        </Show>
                        <Show when={props.bodySummary.hasFormData}>
                          <span class="badge badge-sm badge-success font-mono">hasFormData</span>
                        </Show>
                        <Show when={props.bodySummary.hasBodyFile}>
                          <span class="badge badge-sm badge-success font-mono">hasBodyFile</span>
                        </Show>
                      </div>
                    </Show>
                  </div>
                );
              })()}
            </Show>
          </Match>

          <Match when={activeTab() === 'headers'}>
            <Show
              when={props.hasRequest}
              fallback={
                <div class="h-full overflow-auto rounded-box border border-base-300 bg-base-100/80 p-2" />
              }
            >
              <div class="h-full min-w-0 overflow-auto rounded-box border border-base-300 bg-base-100/80 p-2">
                <table class="table table-sm table-fixed">
                  <thead>
                    <tr>
                      <th class="font-mono">Header</th>
                      <th class="font-mono">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={props.headers}>
                      {(header) => (
                        <tr>
                          <td class="font-mono break-all text-base-content/70">{header.key}</td>
                          <td class="font-mono break-all text-base-content/60">{header.value}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </Match>

          <Match when={activeTab() === 'diagnostics'}>
            <Show
              when={props.hasRequest}
              fallback={
                <div class="h-full overflow-auto rounded-box border border-base-300 bg-base-100/80 p-2" />
              }
            >
              <ul class="h-full space-y-2 overflow-auto rounded-box border border-base-300 bg-base-100/80 p-2">
                <For each={visibleDiagnostics()}>
                  {(diagnostic) => (
                    <li class="rounded-box border border-base-300/80 bg-base-200/35 px-2.5 py-2">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class={diagnosticSeverityClass(diagnostic.severity)}>
                          {diagnostic.severity}
                        </span>
                        <span class="font-mono text-[11px] text-base-content/55">
                          {diagnostic.code}
                        </span>
                        <span class="font-mono text-[11px] text-base-content/50">
                          {formatDiagnosticLocation(diagnostic)}
                        </span>
                      </div>
                      <p class="mt-1 text-sm text-base-content/80">{diagnostic.message}</p>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Match>
        </Switch>
      </div>
    </section>
  );
}
