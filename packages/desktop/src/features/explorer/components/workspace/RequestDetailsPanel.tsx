import { createMemo, createSignal, For, Index, Match, Show, Switch } from 'solid-js';
import {
  formatDiagnosticLocation,
  type ParseDiagnostic,
  type RequestBodyField,
  type RequestBodySummary,
  type RequestDetailsRow
} from '../../utils/request-details';
import { formatUnresolvedVariablesPreview } from '../../utils/template-variables';
import { JsonBodyEditor } from './JsonBodyEditor';
import type { TemplateTokenResolver } from './template-codemirror';

type RequestDetailsTab = 'params' | 'body' | 'headers' | 'diagnostics';
type RequestBodyDraftMode = 'none' | 'inline' | 'form-data' | 'file';

type RequestDetailsPanelProps = {
  hasRequest: boolean;
  params: RequestDetailsRow[];
  headers: RequestDetailsRow[];
  bodySummary: RequestBodySummary;
  bodyMode: RequestBodyDraftMode;
  isJsonBodyMode: boolean;
  bodyDraft: string;
  formDataDraft: RequestBodyField[];
  bodyUnresolvedVariables?: string[];
  bodyValidationError?: string;
  diagnostics: ParseDiagnostic[];
  fileDiagnostics: ParseDiagnostic[];
  resolveTemplateToken?: TemplateTokenResolver;
  templateRefreshKey?: string;
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
  onBodyModeChange: (mode: RequestBodyDraftMode) => void;
  onBodyChange: (value: string) => void;
  onBodyFormDataNameChange: (index: number, value: string) => void;
  onBodyFormDataTypeChange: (index: number, isFile: boolean) => void;
  onBodyFormDataValueChange: (index: number, value: string) => void;
  onBodyFormDataFilenameChange: (index: number, value: string) => void;
  onBodyFormDataAddField: () => void;
  onBodyFormDataRemoveField: (index: number) => void;
  onBodyPrettify: () => void;
  onBodyMinify: () => void;
  onBodyCopy: () => void;
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
  const [isBodyFocused, setIsBodyFocused] = createSignal(false);
  const bodyUnresolvedVariables = createMemo(() => props.bodyUnresolvedVariables ?? []);
  const visibleDiagnostics = createMemo(() => {
    if (props.diagnostics.length > 0) {
      return props.diagnostics;
    }
    return props.fileDiagnostics;
  });
  const shouldShowBodyValidationError = createMemo(
    () => Boolean(props.bodyValidationError) && !isBodyFocused()
  );
  const bodyValidationBadge = createMemo(() => {
    if (!props.isJsonBodyMode) {
      return undefined;
    }
    if (props.bodyValidationError && isBodyFocused()) {
      return {
        className: 'badge badge-xs badge-warning font-mono',
        label: 'Editing JSON'
      };
    }
    if (props.bodyValidationError) {
      return {
        className: 'badge badge-xs badge-warning font-mono',
        label: 'Needs Fix'
      };
    }
    return {
      className: 'badge badge-xs badge-success font-mono',
      label: 'Valid JSON'
    };
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
                <div class="mb-2 flex items-center gap-2">
                  <span class="font-mono text-[11px] uppercase tracking-[0.05em] text-base-content/55">
                    Type
                  </span>
                  <select
                    class="select select-xs w-[160px] border-base-300 bg-base-100 font-mono text-xs"
                    value={props.bodyMode}
                    onChange={(event) =>
                      props.onBodyModeChange(event.currentTarget.value as RequestBodyDraftMode)
                    }
                    disabled={!props.hasRequest}
                  >
                    <option value="none">none</option>
                    <option value="inline">json</option>
                    <option value="form-data">form-data</option>
                    <Show when={props.bodySummary.kind === 'file'}>
                      <option value="file">file</option>
                    </Show>
                  </select>
                </div>

                <Switch>
                  <Match when={props.bodyMode === 'inline'}>
                    <div class="flex h-full min-h-0 flex-col gap-2">
                      <Show when={props.isJsonBodyMode}>
                        <div class="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs font-mono"
                            onClick={props.onBodyPrettify}
                            disabled={!props.hasRequest || Boolean(props.bodyValidationError)}
                          >
                            Prettify
                          </button>
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs font-mono"
                            onClick={props.onBodyMinify}
                            disabled={!props.hasRequest || Boolean(props.bodyValidationError)}
                          >
                            Minify
                          </button>
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs font-mono"
                            onClick={props.onBodyCopy}
                            disabled={!props.hasRequest}
                          >
                            Copy
                          </button>
                          <Show when={bodyValidationBadge()}>
                            {(badge) => <span class={badge().className}>{badge().label}</span>}
                          </Show>
                        </div>
                      </Show>

                      <Show
                        when={
                          shouldShowBodyValidationError() ? props.bodyValidationError : undefined
                        }
                      >
                        {(message) => (
                          <div
                            class="rounded-box border border-warning/[0.35] bg-warning/[0.12] px-2.5 py-2 text-xs text-base-content"
                            role="alert"
                          >
                            {message()}
                          </div>
                        )}
                      </Show>

                      <Show when={bodyUnresolvedVariables().length > 0}>
                        <output class="rounded-box border border-warning/[0.35] bg-warning/[0.12] px-2.5 py-2 text-xs text-base-content">
                          Unresolved body variables:{' '}
                          {formatUnresolvedVariablesPreview(bodyUnresolvedVariables())}
                        </output>
                      </Show>

                      <div class="min-h-0 min-w-0 flex-1 overflow-hidden rounded-box border border-base-300 bg-base-100">
                        <JsonBodyEditor
                          value={props.bodyDraft}
                          disabled={!props.hasRequest}
                          onChange={props.onBodyChange}
                          onSaveRequest={props.onSave}
                          onFocusChange={setIsBodyFocused}
                          resolveTemplateToken={props.resolveTemplateToken}
                          templateRefreshKey={props.templateRefreshKey}
                        />
                      </div>
                    </div>
                  </Match>

                  <Match when={props.bodyMode === 'form-data'}>
                    <div class="flex h-full min-h-0 flex-col gap-2">
                      <div class="flex items-center justify-end">
                        <button
                          type="button"
                          class="btn btn-ghost btn-xs font-mono"
                          onClick={props.onBodyFormDataAddField}
                          disabled={!props.hasRequest}
                        >
                          Add Field
                        </button>
                      </div>

                      <div class="min-h-0 min-w-0 flex-1 overflow-auto rounded-box border border-base-300 bg-base-100/70 p-2">
                        <table class="table table-sm table-fixed">
                          <thead>
                            <tr>
                              <th class="w-[30%] font-mono">Field</th>
                              <th class="w-[18%] font-mono">Type</th>
                              <th class="w-[40%] font-mono">Value</th>
                              <th class="w-[12%] font-mono text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            <Index each={props.formDataDraft}>
                              {(field, index) => (
                                <>
                                  <tr>
                                    <td>
                                      <input
                                        type="text"
                                        class="input input-xs w-full border-base-300 bg-base-100 font-mono text-xs"
                                        value={field().name}
                                        onInput={(event) =>
                                          props.onBodyFormDataNameChange(
                                            index,
                                            event.currentTarget.value
                                          )
                                        }
                                        disabled={!props.hasRequest}
                                      />
                                    </td>
                                    <td>
                                      <select
                                        class="select select-xs w-full border-base-300 bg-base-100 font-mono text-xs"
                                        value={field().isFile ? 'file' : 'text'}
                                        onChange={(event) =>
                                          props.onBodyFormDataTypeChange(
                                            index,
                                            event.currentTarget.value === 'file'
                                          )
                                        }
                                        disabled={!props.hasRequest}
                                      >
                                        <option value="text">text</option>
                                        <option value="file">file</option>
                                      </select>
                                    </td>
                                    <td>
                                      <input
                                        type="text"
                                        class="input input-xs w-full border-base-300 bg-base-100 font-mono text-xs"
                                        value={
                                          field().isFile ? (field().path ?? '') : field().value
                                        }
                                        onInput={(event) =>
                                          props.onBodyFormDataValueChange(
                                            index,
                                            event.currentTarget.value
                                          )
                                        }
                                        placeholder={field().isFile ? './path/to/file' : 'value'}
                                        disabled={!props.hasRequest}
                                      />
                                    </td>
                                    <td class="text-right align-top">
                                      <button
                                        type="button"
                                        class="btn btn-ghost btn-xs text-error"
                                        onClick={() => props.onBodyFormDataRemoveField(index)}
                                        disabled={!props.hasRequest}
                                      >
                                        Remove
                                      </button>
                                    </td>
                                  </tr>
                                  <Show when={field().isFile}>
                                    <tr>
                                      <td />
                                      <td class="font-mono text-[11px] text-base-content/55">
                                        filename
                                      </td>
                                      <td>
                                        <input
                                          type="text"
                                          class="input input-xs w-full border-base-300 bg-base-100 font-mono text-xs"
                                          value={field().filename ?? ''}
                                          onInput={(event) =>
                                            props.onBodyFormDataFilenameChange(
                                              index,
                                              event.currentTarget.value
                                            )
                                          }
                                          placeholder="optional filename"
                                          disabled={!props.hasRequest}
                                        />
                                      </td>
                                      <td />
                                    </tr>
                                  </Show>
                                </>
                              )}
                            </Index>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </Match>

                  <Match when={props.bodyMode === 'file'}>
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

                  <Match when={props.bodyMode === 'none'}>
                    <p class="text-sm text-base-content/70">No body is defined for this request.</p>
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
