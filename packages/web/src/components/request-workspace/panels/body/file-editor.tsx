import { Show } from 'solid-js';
import type { FileBodyEditorProps } from './types';

export function FileBodyEditor(props: FileBodyEditorProps) {
  return (
    <div class="space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          class="btn btn-ghost btn-xs font-mono"
          onClick={props.onBodyCopy}
          disabled={!props.hasRequest}
        >
          Copy
        </button>

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

      <div class="rounded-box border border-base-300 bg-base-100/80 p-2">
        <label
          for="request-workspace-body-file-path"
          class="mb-1 block font-mono text-[11px] uppercase tracking-[0.06em] text-base-content/70"
        >
          File Path
        </label>
        <input
          id="request-workspace-body-file-path"
          type="text"
          class="input input-sm w-full border-base-300 bg-base-100 font-mono text-xs"
          value={props.requestBodyFilePathDraft}
          onInput={(event) => props.onBodyFilePathChange(event.currentTarget.value)}
          disabled={!props.hasRequest || props.bodyDraftSaving}
          placeholder="./payload.json"
        />
      </div>
    </div>
  );
}
