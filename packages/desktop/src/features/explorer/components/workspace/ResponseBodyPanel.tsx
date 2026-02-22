import { createSignal, Match, Switch } from 'solid-js';

type ResponseTab = 'response' | 'headers';

export function ResponseBodyPanel() {
  const [activeTab, setActiveTab] = createSignal<ResponseTab>('response');

  return (
    <section class="min-h-0 flex flex-col bg-base-200/10">
      <header class="flex flex-wrap items-center justify-between gap-2 border-b border-base-300/80 px-3 py-2.5">
        <h3 class="m-0 text-sm font-semibold text-base-content">Response Body</h3>
        <div class="flex items-center gap-2">
          <span class="badge badge-success badge-sm font-mono">200 OK</span>
          <span class="text-sm text-base-content/65">480 ms · 2 KB</span>
        </div>
      </header>

      <div role="tablist" class="tabs tabs-bordered tabs-md px-3 pt-1">
        <button
          type="button"
          role="tab"
          class="tab"
          classList={{ 'tab-active': activeTab() === 'response' }}
          onClick={() => setActiveTab('response')}
        >
          Response
        </button>
        <button
          type="button"
          role="tab"
          class="tab"
          classList={{ 'tab-active': activeTab() === 'headers' }}
          onClick={() => setActiveTab('headers')}
        >
          Headers
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-2">
        <Switch>
          <Match when={activeTab() === 'response'}>
            <pre class="h-full overflow-auto rounded-box border border-base-300 bg-base-100/80 p-3 font-mono text-sm leading-7 text-base-content/80">
              {`{
  "status": "ok",
  "message": "Response preview appears here.",
  "data": []
}`}
            </pre>
          </Match>
          <Match when={activeTab() === 'headers'}>
            <div class="h-full overflow-auto rounded-box border border-base-300 bg-base-100/80 p-2">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th class="font-mono">Header</th>
                    <th class="font-mono">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="font-mono text-base-content/70">Content-Type</td>
                    <td class="font-mono text-base-content/60">application/json</td>
                  </tr>
                  <tr>
                    <td class="font-mono text-base-content/70">Cache-Control</td>
                    <td class="font-mono text-base-content/60">no-cache</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Match>
        </Switch>
      </div>
    </section>
  );
}
