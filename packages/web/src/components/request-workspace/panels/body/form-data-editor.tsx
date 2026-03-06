import { Index, Show } from 'solid-js';
import type { FormDataEditorProps } from './types';

export function FormDataEditor(props: FormDataEditorProps) {
  return (
    <div class="space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          class="btn btn-ghost btn-xs font-mono"
          onClick={props.onBodyFormDataAddField}
          disabled={!props.hasRequest || props.bodyDraftSaving}
        >
          Add Field
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

      <div class="overflow-auto rounded-box border border-base-300 bg-base-100/80">
        <table class="table table-xs">
          <thead>
            <tr>
              <th class="font-mono uppercase tracking-[0.06em] text-[11px]">Name</th>
              <th class="font-mono uppercase tracking-[0.06em] text-[11px]">Type</th>
              <th class="font-mono uppercase tracking-[0.06em] text-[11px]">Value</th>
              <th class="font-mono uppercase tracking-[0.06em] text-[11px]">Filename</th>
              <th class="font-mono uppercase tracking-[0.06em] text-[11px] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <Show
              when={props.requestBodyFormDataDraft.length > 0}
              fallback={
                <tr>
                  <td colSpan={5} class="font-mono text-xs text-base-content/70 text-center py-3">
                    No form-data fields configured.
                  </td>
                </tr>
              }
            >
              <Index each={props.requestBodyFormDataDraft}>
                {(field, index) => (
                  <tr>
                    <td>
                      <input
                        type="text"
                        class="input input-xs w-full border-base-300 bg-base-100 font-mono text-xs"
                        value={field().name}
                        onInput={(event) =>
                          props.onBodyFormDataNameChange(index, event.currentTarget.value)
                        }
                        disabled={!props.hasRequest || props.bodyDraftSaving}
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
                        disabled={!props.hasRequest || props.bodyDraftSaving}
                      >
                        <option value="text">text</option>
                        <option value="file">file</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        class="input input-xs w-full border-base-300 bg-base-100 font-mono text-xs"
                        value={field().isFile ? (field().path ?? '') : field().value}
                        onInput={(event) =>
                          props.onBodyFormDataValueChange(index, event.currentTarget.value)
                        }
                        placeholder={field().isFile ? './path/to/file' : 'value'}
                        disabled={!props.hasRequest || props.bodyDraftSaving}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        class="input input-xs w-full border-base-300 bg-base-100 font-mono text-xs"
                        value={field().filename ?? ''}
                        onInput={(event) =>
                          props.onBodyFormDataFilenameChange(index, event.currentTarget.value)
                        }
                        placeholder="optional"
                        disabled={!props.hasRequest || props.bodyDraftSaving || !field().isFile}
                      />
                    </td>
                    <td class="text-right">
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs text-error"
                        onClick={() => props.onBodyFormDataRemoveField(index)}
                        disabled={!props.hasRequest || props.bodyDraftSaving}
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
