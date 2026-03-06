import { Index, Show } from 'solid-js';
import type { RequestDetailsRow } from '../../../../utils/request-details';

interface KeyValueRowProps {
  item: RequestDetailsRow;
  index: number;
  hasRequest: boolean;
  isSaving: boolean;
  onChange: (index: number, field: 'key' | 'value', value: string) => void;
  onRemove: (index: number) => void;
}

function KeyValueRow(props: KeyValueRowProps) {
  return (
    <tr>
      <td>
        <input
          type="text"
          class="input input-xs w-full border-base-300 bg-base-100 font-mono text-xs"
          value={props.item.key}
          onInput={(event) => props.onChange(props.index, 'key', event.currentTarget.value)}
          disabled={!props.hasRequest || props.isSaving}
        />
      </td>
      <td>
        <input
          type="text"
          class="input input-xs w-full border-base-300 bg-base-100 font-mono text-xs"
          value={props.item.value}
          onInput={(event) => props.onChange(props.index, 'value', event.currentTarget.value)}
          disabled={!props.hasRequest || props.isSaving}
        />
      </td>
      <td class="text-right">
        <button
          type="button"
          class="btn btn-ghost btn-xs text-error"
          onClick={() => props.onRemove(props.index)}
          disabled={!props.hasRequest || props.isSaving}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

interface KeyValueTableProps {
  items: RequestDetailsRow[];
  hasRequest: boolean;
  isSaving: boolean;
  emptyMessage: string;
  onChange: (index: number, field: 'key' | 'value', value: string) => void;
  onRemove: (index: number) => void;
}

export function KeyValueTable(props: KeyValueTableProps) {
  return (
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
            when={props.items.length > 0}
            fallback={
              <tr>
                <td colSpan={3} class="font-mono text-xs text-base-content/70 text-center py-3">
                  {props.emptyMessage}
                </td>
              </tr>
            }
          >
            <Index each={props.items}>
              {(item, index) => (
                <KeyValueRow
                  item={item()}
                  index={index}
                  hasRequest={props.hasRequest}
                  isSaving={props.isSaving}
                  onChange={props.onChange}
                  onRemove={props.onRemove}
                />
              )}
            </Index>
          </Show>
        </tbody>
      </table>
    </div>
  );
}
