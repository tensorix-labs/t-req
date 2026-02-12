import { createMemo, For, Show } from 'solid-js';
import type { ExecutionResult } from '../../execution/types';

type HeadersTabProps = {
  result: ExecutionResult;
};

export function HeadersTab(props: HeadersTabProps) {
  const setCookies = createMemo(() =>
    props.result.response.headers.filter((header) => header.name.toLowerCase() === 'set-cookie')
  );
  const otherHeaders = createMemo(() =>
    props.result.response.headers.filter((header) => header.name.toLowerCase() !== 'set-cookie')
  );

  return (
    <>
      <Show when={setCookies().length > 0}>
        <section>
          <h3>Set-Cookie</h3>
          <table>
            <tbody>
              <For each={setCookies()}>
                {(header) => (
                  <tr>
                    <th>{header.name}</th>
                    <td>{header.value}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </section>
      </Show>
      <section>
        <h3>Headers</h3>
        <Show when={otherHeaders().length > 0} fallback={<div class="empty">No headers</div>}>
          <table>
            <tbody>
              <For each={otherHeaders()}>
                {(header) => (
                  <tr>
                    <th>{header.name}</th>
                    <td>{header.value}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </section>
    </>
  );
}
