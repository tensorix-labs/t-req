import { createMemo, createSignal } from 'solid-js';
import DesktopFooter from './components/DesktopFooter';
import ServerGate from './components/ServerGate';
import SettingsModal from './components/SettingsModal';
import { ServerProvider, useServer } from './context/server-context';
import { ExplorerScreen } from './features/explorer';
import './App.css';

function AppLayout() {
  const { client, status, workspacePath } = useServer();
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const canOpenSettings = createMemo(() => status().state === 'ready');

  function openSettings(): void {
    if (!canOpenSettings()) {
      return;
    }

    setSettingsOpen(true);
  }

  return (
    <div class="app-shell" data-theme="treq-desktop">
      <div class="app-main">
        <ServerGate>
          <ExplorerScreen />
        </ServerGate>
      </div>
      <DesktopFooter
        status={status()}
        workspacePath={workspacePath()}
        canOpenSettings={canOpenSettings()}
        onOpenSettings={openSettings}
      />
      <SettingsModal
        open={settingsOpen()}
        client={client()}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

function App() {
  return (
    <ServerProvider>
      <AppLayout />
    </ServerProvider>
  );
}

export default App;
