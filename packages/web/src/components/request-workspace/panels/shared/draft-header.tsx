import { Show } from 'solid-js';

interface DraftHeaderProps {
  itemLabel: string;
  hasRequest: boolean;
  draftDirty: boolean;
  draftSaving: boolean;
  onAdd: () => void;
  onSave: () => void;
  onDiscard: () => void;
}

export function DraftHeader(props: DraftHeaderProps) {
  return (
    <div class="flex flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        class="btn btn-ghost btn-xs font-mono"
        onClick={props.onAdd}
        disabled={!props.hasRequest || props.draftSaving}
      >
        Add {props.itemLabel}
      </button>

      <div class="flex items-center gap-2">
        <Show when={props.draftDirty && !props.draftSaving}>
          <span class="badge badge-sm badge-warning font-mono">Unsaved</span>
        </Show>
        <button
          type="button"
          class="btn btn-ghost btn-xs font-mono"
          onClick={props.onDiscard}
          disabled={!props.hasRequest || !props.draftDirty || props.draftSaving}
        >
          Discard
        </button>
        <button
          type="button"
          class="btn btn-primary btn-xs font-mono"
          onClick={props.onSave}
          disabled={!props.hasRequest || !props.draftDirty || props.draftSaving}
        >
          {props.draftSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
