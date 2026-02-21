import { createSignal, Match, Switch } from 'solid-js';

type RequestDetailsTab = 'params' | 'body' | 'headers';

export function RequestDetailsPanel() {
  const [activeTab, setActiveTab] = createSignal<RequestDetailsTab>('params');

  return (
    <section class="min-h-0 flex flex-col border-r border-base-300 bg-base-200/10 max-[1180px]:border-r-0 max-[1180px]:border-b">
      <header class="border-b border-base-300/80 px-3 py-2.5">
        <h3 class="m-0 text-sm font-semibold text-base-content">Request Details</h3>
      </header>

      <div role="tablist" class="tabs tabs-bordered tabs-sm px-3 pt-1">
        <button
          type="button"
          role="tab"
          class="tab"
          classList={{ 'tab-active': activeTab() === 'params' }}
          onClick={() => setActiveTab('params')}
        >
          Params
        </button>
        <button
          type="button"
          role="tab"
          class="tab"
          classList={{ 'tab-active': activeTab() === 'body' }}
          onClick={() => setActiveTab('body')}
        >
          Body
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
          <Match when={activeTab() === 'params'}>
            <div class="h-full overflow-auto rounded-box border border-base-300 bg-base-100/80 p-2">
              <table class="table table-xs">
                <thead>
                  <tr>
                    <th class="font-mono">Name</th>
                    <th class="font-mono">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="font-mono text-base-content/70">limit</td>
                    <td class="font-mono text-base-content/60">100</td>
                  </tr>
                  <tr>
                    <td class="font-mono text-base-content/70">sort</td>
                    <td class="font-mono text-base-content/60">desc</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Match>

          <Match when={activeTab() === 'body'}>
            <label class="flex h-full flex-col gap-2">
              <span class="text-[11px] font-semibold uppercase tracking-[0.05em] text-base-content/60">
                JSON Body
              </span>
              <textarea
                class="textarea textarea-sm h-full min-h-[160px] w-full border-base-300 bg-base-100 font-mono text-xs"
                value={'{\n  "name": "example",\n  "enabled": true\n}'}
                disabled
                aria-label="Request body editor"
              />
            </label>
          </Match>

          <Match when={activeTab() === 'headers'}>
            <div class="h-full overflow-auto rounded-box border border-base-300 bg-base-100/80 p-2">
              <table class="table table-xs">
                <thead>
                  <tr>
                    <th class="font-mono">Header</th>
                    <th class="font-mono">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="font-mono text-base-content/70">Accept</td>
                    <td class="font-mono text-base-content/60">application/json</td>
                  </tr>
                  <tr>
                    <td class="font-mono text-base-content/70">Authorization</td>
                    <td class="font-mono text-base-content/60">Bearer {'{{token}}'}</td>
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
