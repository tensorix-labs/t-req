import { For, Index, Match, Show, Switch } from 'solid-js';
import type { RequestBodySummary, RequestDetailsRow } from '../../utils/request-details';

interface RequestWorkspaceParamsPanelProps {
  requestMethod: string;
  requestParams: RequestDetailsRow[];
}

interface RequestWorkspaceHeadersPanelProps {
  hasRequest: boolean;
  requestHeaders: RequestDetailsRow[];
  headerDraftDirty: boolean;
  headerDraftSaving: boolean;
  headerDraftSaveError?: string;
  onHeaderChange: (index: number, field: 'key' | 'value', value: string) => void;
  onAddHeader: () => void;
  onRemoveHeader: (index: number) => void;
  onSaveHeaders: () => void;
  onDiscardHeaders: () => void;
}

interface RequestWorkspaceBodyPanelProps {
  hasRequest: boolean;
  requestBodySummary: RequestBodySummary;
  requestBodyDraft: string;
  bodyDraftDirty: boolean;
  bodyDraftSaving: boolean;
  bodyDraftSaveError?: string;
  bodyDraftValidationError?: string;
  bodyDraftIsJsonEditable: boolean;
  bodyDraftTemplateWarnings: string[];
  onBodyChange: (value: string) => void;
  onBodyPrettify: () => void;
  onBodyMinify: () => void;
  onBodyCopy: () => void;
  onSaveBody: () => void;
  onDiscardBody: () => void;
}

export function RequestWorkspaceParamsPanel(props: RequestWorkspaceParamsPanelProps) {
  return (
    <Show
      when={props.requestParams.length > 0}
      fallback={<p>No query params in URL for {props.requestMethod.toUpperCase()} requests.</p>}
    >
      <div class="overflow-auto rounded-box border border-base-300 bg-base-100/80">
        <table class="table table-xs">
          <thead>
            <tr>
              <th class="font-mono uppercase tracking-[0.06em] text-[11px]">Name</th>
              <th class="font-mono uppercase tracking-[0.06em] text-[11px]">Value</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.requestParams}>
              {(param) => (
                <tr>
                  <td class="font-mono text-xs text-base-content">{param.key}</td>
                  <td class="font-mono text-xs text-base-content/80">{param.value}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  );
}

export function RequestWorkspaceHeadersPanel(props: RequestWorkspaceHeadersPanelProps) {
  return (
    <div class="space-y-2">
      <Show when={props.headerDraftSaveError}>
        {(message) => (
          <div class="rounded-box border border-error/35 bg-error/10 px-2 py-1.5 text-xs text-base-content">
            {message()}
          </div>
        )}
      </Show>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          class="btn btn-ghost btn-xs font-mono"
          onClick={props.onAddHeader}
          disabled={!props.hasRequest || props.headerDraftSaving}
        >
          Add Header
        </button>

        <div class="flex items-center gap-2">
          <Show when={props.headerDraftDirty && !props.headerDraftSaving}>
            <span class="badge badge-sm badge-warning font-mono">Unsaved</span>
          </Show>
          <button
            type="button"
            class="btn btn-ghost btn-xs font-mono"
            onClick={props.onDiscardHeaders}
            disabled={!props.hasRequest || !props.headerDraftDirty || props.headerDraftSaving}
          >
            Discard
          </button>
          <button
            type="button"
            class="btn btn-primary btn-xs font-mono"
            onClick={props.onSaveHeaders}
            disabled={!props.hasRequest || !props.headerDraftDirty || props.headerDraftSaving}
          >
            {props.headerDraftSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div class="overflow-auto rounded-box border border-base-300 bg-base-100/80">
        <table class="table table-xs">
          <thead>
            <tr>
              <th class="font-mono uppercase tracking-[0.06em] text-[11px]">Name</th>
              <th class="font-mono uppercase tracking-[0.06em] text-[11px]">Value</th>
              <th class="font-mono uppercase tracking-[0.06em] text-[11px] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <Show
              when={props.requestHeaders.length > 0}
              fallback={
                <tr>
                  <td colSpan={3} class="font-mono text-xs text-base-content/70 text-center py-3">
                    No headers configured for this request.
                  </td>
                </tr>
              }
            >
              <Index each={props.requestHeaders}>
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
                        disabled={!props.hasRequest || props.headerDraftSaving}
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
                        disabled={!props.hasRequest || props.headerDraftSaving}
                      />
                    </td>
                    <td class="text-right">
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs text-error"
                        onClick={() => props.onRemoveHeader(index)}
                        disabled={!props.hasRequest || props.headerDraftSaving}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                )}
              </Index>
            </Show>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RequestWorkspaceBodyPanel(props: RequestWorkspaceBodyPanelProps) {
  const shouldShowDescription =
    props.requestBodySummary.description !== 'Request includes an inline body payload.';

  return (
    <div class="space-y-2">
      <Show when={props.bodyDraftSaveError}>
        {(message) => (
          <div class="rounded-box border border-error/35 bg-error/10 px-2 py-1.5 text-xs text-base-content">
            {message()}
          </div>
        )}
      </Show>

      <Show when={shouldShowDescription}>
        <p>{props.requestBodySummary.description}</p>
      </Show>

      <Switch>
        <Match when={props.requestBodySummary.kind === 'inline'}>
          <Show
            when={props.bodyDraftIsJsonEditable}
            fallback={
              <div class="space-y-2">
                <p>Inline non-JSON body editing is not supported yet.</p>
                <Show
                  when={props.requestBodySummary.text !== undefined}
                  fallback={<p>No inline body content was parsed.</p>}
                >
                  <pre class="max-h-52 overflow-auto rounded-box border border-base-300 bg-base-100/80 p-2 font-mono text-xs text-base-content">
                    {props.requestBodySummary.text}
                  </pre>
                </Show>
              </div>
            }
          >
            <div class="space-y-2">
              <Show when={props.bodyDraftTemplateWarnings.length > 0}>
                <div class="rounded-box border border-warning/35 bg-warning/12 px-2 py-1.5 text-xs text-base-content">
                  <For each={props.bodyDraftTemplateWarnings}>{(warning) => <p>{warning}</p>}</For>
                </div>
              </Show>

              <Show when={props.bodyDraftValidationError}>
                {(message) => (
                  <div
                    class="rounded-box border border-warning/35 bg-warning/12 px-2 py-1.5 text-xs text-base-content"
                    role="alert"
                  >
                    {message()}
                  </div>
                )}
              </Show>

              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs font-mono"
                    onClick={props.onBodyPrettify}
                    disabled={
                      !props.hasRequest ||
                      props.bodyDraftSaving ||
                      Boolean(props.bodyDraftValidationError)
                    }
                  >
                    Prettify
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs font-mono"
                    onClick={props.onBodyMinify}
                    disabled={
                      !props.hasRequest ||
                      props.bodyDraftSaving ||
                      Boolean(props.bodyDraftValidationError)
                    }
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
                </div>

                <div class="flex items-center gap-2">
                  <Show when={props.bodyDraftDirty && !props.bodyDraftSaving}>
                    <span class="badge badge-sm badge-warning font-mono">Unsaved</span>
                  </Show>
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs font-mono"
                    onClick={props.onDiscardBody}
                    disabled={!props.hasRequest || !props.bodyDraftDirty || props.bodyDraftSaving}
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary btn-xs font-mono"
                    onClick={props.onSaveBody}
                    disabled={!props.hasRequest || !props.bodyDraftDirty || props.bodyDraftSaving}
                  >
                    {props.bodyDraftSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              <textarea
                class="textarea textarea-sm min-h-48 w-full border-base-300 bg-base-100/80 font-mono text-xs text-base-content"
                value={props.requestBodyDraft}
                onInput={(event) => props.onBodyChange(event.currentTarget.value)}
                disabled={!props.hasRequest || props.bodyDraftSaving}
              />
            </div>
          </Show>
        </Match>

        <Match when={props.requestBodySummary.kind === 'form-data'}>
          <Show
            when={(props.requestBodySummary.fields?.length ?? 0) > 0}
            fallback={<p>No form-data fields were parsed.</p>}
          >
            <div class="overflow-auto rounded-box border border-base-300 bg-base-100/80">
              <table class="table table-xs">
                <thead>
                  <tr>
                    <th class="font-mono uppercase tracking-[0.06em] text-[11px]">Name</th>
                    <th class="font-mono uppercase tracking-[0.06em] text-[11px]">Type</th>
                    <th class="font-mono uppercase tracking-[0.06em] text-[11px]">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={props.requestBodySummary.fields}>
                    {(field) => (
                      <tr>
                        <td class="font-mono text-xs text-base-content">{field.name}</td>
                        <td class="font-mono text-xs text-base-content/80">
                          {field.isFile ? 'file' : 'text'}
                        </td>
                        <td class="font-mono text-xs text-base-content/80">
                          {field.isFile
                            ? (field.path ?? field.filename ?? field.value)
                            : field.value}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Match>

        <Match when={props.requestBodySummary.kind === 'file'}>
          <Show
            when={props.requestBodySummary.filePath}
            fallback={<p>No request body file path was parsed.</p>}
          >
            {(filePath) => (
              <div class="rounded-box border border-base-300 bg-base-100/80 p-2">
                <p class="font-mono text-xs text-base-content/80">{filePath()}</p>
              </div>
            )}
          </Show>
        </Match>
      </Switch>
    </div>
  );
}
