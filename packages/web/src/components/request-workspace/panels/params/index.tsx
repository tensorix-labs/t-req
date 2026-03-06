import { For, Show } from 'solid-js';
import type { RequestDetailsRow } from '../../../../utils/request-details';

interface ParamsPanelProps {
  requestMethod: string;
  requestParams: RequestDetailsRow[];
}

export function ParamsPanel(props: ParamsPanelProps) {
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
