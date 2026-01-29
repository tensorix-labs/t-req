import { Show } from 'solid-js';
import { useWorkspace } from './context';
import { useAutoConnect, useRequestLoader } from './hooks';
import {
  AppShell,
  AppHeader,
  ConnectionScreen,
  Sidebar,
  MainContent,
} from './components/layout';
import { Toast } from './components/Toast';

function App() {
  const store = useWorkspace();

  useAutoConnect();
  useRequestLoader();

  return (
    <AppShell>
      <AppHeader />
      <Show
        when={store.connectionStatus() === 'connected'}
        fallback={<ConnectionScreen />}
      >
        <div class="flex-1 flex overflow-hidden">
          <Sidebar />
          <MainContent />
        </div>
      </Show>
      <Toast />
    </AppShell>
  );
}

export default App;
