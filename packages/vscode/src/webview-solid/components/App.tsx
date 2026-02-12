import { createSignal, onCleanup, onMount } from 'solid-js';
import type { ExecutionResult } from '../../execution/types';
import type { AppTab } from '../types';
import { BodyTab } from './BodyTab';
import { HeadersTab } from './HeadersTab';
import { PluginsTab } from './PluginsTab';
import { SummaryBar } from './SummaryBar';
import { TabBar } from './TabBar';

type AppProps = {
  result: ExecutionResult;
  profile?: string;
};

export function App(props: AppProps) {
  const [activeTab, setActiveTab] = createSignal<AppTab>('body');

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '1') setActiveTab('body');
      if (event.key === '2') setActiveTab('headers');
      if (event.key === '3') setActiveTab('plugins');
    };

    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => {
      document.removeEventListener('keydown', onKeyDown);
    });
  });

  return (
    <div class="container">
      <SummaryBar result={props.result} profile={props.profile} />
      <TabBar activeTab={activeTab()} onTabSelect={setActiveTab} />
      <section
        class="tab-content"
        classList={{ active: activeTab() === 'body' }}
        data-content="body"
      >
        <BodyTab result={props.result} />
      </section>
      <section
        class="tab-content"
        classList={{ active: activeTab() === 'headers' }}
        data-content="headers"
      >
        <HeadersTab result={props.result} />
      </section>
      <section
        class="tab-content"
        classList={{ active: activeTab() === 'plugins' }}
        data-content="plugins"
      >
        <PluginsTab result={props.result} />
      </section>
    </div>
  );
}
