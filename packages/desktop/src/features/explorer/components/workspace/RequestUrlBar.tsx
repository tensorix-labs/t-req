import { For } from 'solid-js';

export const REQUEST_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export type RequestMethod = (typeof REQUEST_METHODS)[number];

type RequestUrlBarProps = {
  method: string;
  url: string;
  disabled?: boolean;
  onMethodChange: (method: string) => void;
  onUrlChange: (url: string) => void;
};

export function RequestUrlBar(props: RequestUrlBarProps) {
  return (
    <section class="border-b border-base-300 bg-base-200/20 px-3 py-2.5" aria-label="Request URL">
      <div class="flex flex-wrap items-center gap-2">
        <select
          class="select select-sm w-28 border-base-300 bg-base-100 font-mono"
          value={props.method}
          onInput={(event) => props.onMethodChange(event.currentTarget.value)}
          disabled={props.disabled}
          aria-label="HTTP method"
        >
          <For each={REQUEST_METHODS}>{(method) => <option value={method}>{method}</option>}</For>
        </select>
        <input
          type="text"
          class="input input-sm flex-1 border-base-300 bg-base-100 font-mono text-xs"
          value={props.url}
          onInput={(event) => props.onUrlChange(event.currentTarget.value)}
          placeholder="https://api.example.com"
          disabled={props.disabled}
          aria-label="Request URL"
        />
        <button type="button" class="btn btn-primary btn-sm" disabled aria-disabled="true">
          Send
        </button>
      </div>
    </section>
  );
}
