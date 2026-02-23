import { createMemo, createSignal, For, Index, Match, Show, Switch } from 'solid-js';
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
  bodyDraft: string;
  diagnostics: ParseDiagnostic[];
  fileDiagnostics: ParseDiagnostic[];
  isLoading?: boolean;
  error?: string;
  saveError?: string;
  hasUnsavedChanges: boolean;
  isSaving?: boolean;
  onParamChange: (index: number, field: 'key' | 'value', value: string) => void;
  onHeaderChange: (index: number, field: 'key' | 'value', value: string) => void;
  onAddParam: () => void;
  onRemoveParam: (index: number) => void;
  onAddHeader: () => void;
  onRemoveHeader: (index: number) => void;
  onBodyChange: (value: string) => void;
  onSave: () => void;
  onDiscard: () => void;
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
  const saveDisabled = createMemo(
    () => !props.hasRequest || !props.hasUnsavedChanges || Boolean(props.isSaving)
  );

  return (
    <section class="min-h-0 min-w-0 flex flex-col overflow-hidden border-r border-base-300 bg-base-200/10">
      <header class="flex items-center justify-between gap-2 border-b border-base-300/80 px-3 py-2.5">
        <h3 class="m-0 text-sm font-semibold text-base-content">Request Details</h3>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="btn btn-ghost btn-xs font-mono"
            onClick={props.onDiscard}
            disabled={saveDisabled()}
          >
            Discard
          </button>
          <button
            type="button"
            class="btn btn-primary btn-xs font-mono"
            onClick={props.onSave}
            disabled={saveDisabled()}
          >
            {props.isSaving ? 'Saving…' : 'Save'}
          </button>
          <Show when={props.hasUnsavedChanges && !props.isSaving}>
            <span class="badge badge-sm badge-warning font-mono">Unsaved</span>
          </Show>
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

      <Show when={props.saveError}>
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
            <div class="h-full min-w-0 overflow-auto rounded-box border border-base-300 bg-base-100/80 p-2">
              <div class="mb-2 flex justify-end">
                <button
                  type="button"
                  class="btn btn-ghost btn-xs font-mono"
                  onClick={props.onAddParam}
                  disabled={!props.hasRequest}
                >
                  Add Param
                </button>
              </div>
              <table class="table table-sm table-fixed">
                <thead>
                  <tr>
                    <th class="w-[40%] font-mono">Name</th>
                    <th class="w-[44%] font-mono">Value</th>
                    <th class="w-[16%] font-mono text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <Index each={props.params}>
                    {(param, index) => (
                      <tr>
                        <td>
                          <input
                            type="text"
                            class="input input-xs w-full border-base-300 bg-base-100 font-mono text-xs"
                            value={param().key}
                            onInput={(event) =>
                              props.onParamChange(index, 'key', event.currentTarget.value)
                            }
                            disabled={!props.hasRequest}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            class="input input-xs w-full border-base-300 bg-base-100 font-mono text-xs"
                            value={param().value}
                            onInput={(event) =>
                              props.onParamChange(index, 'value', event.currentTarget.value)
                            }
                            disabled={!props.hasRequest}
                          />
                        </td>
                        <td class="text-right">
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs text-error"
                            onClick={() => props.onRemoveParam(index)}
                            disabled={!props.hasRequest}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    )}
                  </Index>
                </tbody>
              </table>
            </div>
          </Match>

          <Match when={activeTab() === 'body'}>
            <Show
              when={props.hasRequest}
              fallback={
                <div class="h-full overflow-auto rounded-box border border-base-300 bg-base-100/80 p-3" />
              }
            >
              <div class="h-full min-w-0 overflow-auto rounded-box border border-base-300 bg-base-100/80 p-3">
                <div class="mb-3 flex flex-wrap items-center gap-2">
                  <span class="badge badge-sm border-base-300 bg-base-300/60 font-mono">
                    {props.bodySummary.kind === 'inline'
                      ? 'Inline Body'
                      : props.bodySummary.kind === 'form-data'
                        ? 'Form Data'
                        : props.bodySummary.kind === 'file'
                          ? 'Body File'
                          : 'No Body'}
                  </span>
                  <Show when={props.bodySummary.contentType}>
                    {(contentType) => (
                      <span class="badge badge-sm border-base-300 bg-base-300/60 font-mono">
                        {contentType()}
                      </span>
                    )}
                  </Show>
                  <Show when={props.bodySummary.kind === 'inline' && props.bodySummary.isJsonLike}>
                    <span class="badge badge-sm badge-info font-mono">JSON-like</span>
                  </Show>
                </div>

                <Switch>
                  <Match when={props.bodySummary.kind === 'inline'}>
                    <textarea
                      class="textarea textarea-sm h-[calc(100%-1rem)] w-full resize-none border-base-300 bg-base-100 font-mono text-xs leading-6"
                      value={props.bodyDraft}
                      onInput={(event) => props.onBodyChange(event.currentTarget.value)}
                      spellcheck={false}
                      disabled={!props.hasRequest}
                    />
                  </Match>

                  <Match when={props.bodySummary.kind === 'form-data'}>
                    <div class="space-y-2">
                      <p class="text-sm text-base-content/75">{props.bodySummary.description}</p>
                      <Show when={(props.bodySummary.fields?.length ?? 0) > 0}>
                        <div class="max-h-[240px] overflow-auto rounded-box border border-base-300/70 bg-base-100/70 p-2">
                          <table class="table table-xs table-fixed">
                            <thead>
                              <tr>
                                <th class="w-[35%] font-mono">Field</th>
                                <th class="w-[25%] font-mono">Type</th>
                                <th class="w-[40%] font-mono">Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              <For each={props.bodySummary.fields}>
                                {(field) => (
                                  <tr>
                                    <td class="font-mono text-xs">{field.name}</td>
                                    <td class="font-mono text-xs text-base-content/70">
                                      {field.isFile ? 'file' : 'text'}
                                    </td>
                                    <td class="font-mono text-xs break-all text-base-content/70">
                                      {field.isFile ? (field.path ?? '') : field.value}
                                    </td>
                                  </tr>
                                )}
                              </For>
                            </tbody>
                          </table>
                        </div>
                      </Show>
                    </div>
                  </Match>

                  <Match when={props.bodySummary.kind === 'file'}>
                    <div class="space-y-2">
                      <p class="text-sm text-base-content/75">{props.bodySummary.description}</p>
                      <Show when={props.bodySummary.filePath}>
                        {(path) => (
                          <input
                            type="text"
                            class="input input-sm w-full border-base-300 bg-base-100 font-mono text-xs"
                            value={path()}
                            readOnly
                          />
                        )}
                      </Show>
                    </div>
                  </Match>

                  <Match when={props.bodySummary.kind === 'none'}>
                    <p class="text-sm text-base-content/70">{props.bodySummary.description}</p>
                  </Match>
                </Switch>
              </div>
            </Show>
          </Match>

          <Match when={activeTab() === 'headers'}>
            <div class="h-full min-w-0 overflow-auto rounded-box border border-base-300 bg-base-100/80 p-2">
              <div class="mb-2 flex justify-end">
                <button
                  type="button"
                  class="btn btn-ghost btn-xs font-mono"
                  onClick={props.onAddHeader}
                  disabled={!props.hasRequest}
                >
                  Add Header
                </button>
              </div>
              <table class="table table-sm table-fixed">
                <thead>
                  <tr>
                    <th class="w-[40%] font-mono">Header</th>
                    <th class="w-[44%] font-mono">Value</th>
                    <th class="w-[16%] font-mono text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <Index each={props.headers}>
                    {(header, index) => (
                      <tr>
                        <td>
                          <input
                            type="text"
                            class="input input-xs w-full border-base-300 bg-base-100 font-mono text-xs"
                            value={header().key}
                            onInput={(event) =>
                              props.onHeaderChange(index, 'key', event.currentTarget.value)
                            }
                            disabled={!props.hasRequest}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            class="input input-xs w-full border-base-300 bg-base-100 font-mono text-xs"
                            value={header().value}
                            onInput={(event) =>
                              props.onHeaderChange(index, 'value', event.currentTarget.value)
                            }
                            disabled={!props.hasRequest}
                          />
                        </td>
                        <td class="text-right">
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs text-error"
                            onClick={() => props.onRemoveHeader(index)}
                            disabled={!props.hasRequest}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    )}
                  </Index>
                </tbody>
              </table>
            </div>
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
