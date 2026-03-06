import { For, Show } from 'solid-js';
import type { InlineBodyEditorProps } from './types';

export function InlineBodyEditor(props: InlineBodyEditorProps) {
  return (
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
  );
}
