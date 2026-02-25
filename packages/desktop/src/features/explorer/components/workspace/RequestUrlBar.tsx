import { For, Show } from 'solid-js';
import { type RequestOption, toRequestIndex } from '../../utils/request-workspace';

type RequestUrlBarProps = {
  method: string;
  url: string;
  requestOptions: RequestOption[];
  selectedRequestIndex: number;
  disabled?: boolean;
  sendDisabled?: boolean;
  isSending?: boolean;
  onRequestIndexChange: (requestIndex: number) => void;
  onUrlChange: (url: string) => void;
  onSend: () => void;
};

export function RequestUrlBar(props: RequestUrlBarProps) {
  return (
    <section class="border-b border-base-300 bg-base-200/20 px-3 py-2.5" aria-label="Request URL">
      <div class="flex flex-wrap items-center gap-2">
        <Show when={props.requestOptions.length > 1}>
          <select
            class="select select-sm w-[190px] max-w-full border-base-300 bg-base-100 font-mono text-sm"
            value={String(props.selectedRequestIndex)}
            onInput={(event) => {
              const nextIndex = toRequestIndex(event.currentTarget.value);
              if (nextIndex === undefined) {
                return;
              }
              props.onRequestIndexChange(nextIndex);
            }}
            disabled={props.disabled}
            aria-label="Request selection"
          >
            <For each={props.requestOptions}>
              {(option) => <option value={String(option.index)}>{option.label}</option>}
            </For>
          </select>
        </Show>
        <span class="badge badge-sm border-base-300 bg-base-300/60 px-2.5 font-mono text-[11px]">
          {props.method}
        </span>
        <input
          type="text"
          class="input input-sm flex-1 border-base-300 bg-base-100 font-mono text-sm"
          value={props.url}
          onInput={(event) => props.onUrlChange(event.currentTarget.value)}
          placeholder="https://api.example.com"
          disabled={props.disabled}
          aria-label="Request URL"
        />
        <button
          type="button"
          class="btn btn-primary btn-sm"
          onClick={props.onSend}
          disabled={props.sendDisabled || props.disabled || props.isSending}
          aria-busy={props.isSending}
        >
          {props.isSending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </section>
  );
}
