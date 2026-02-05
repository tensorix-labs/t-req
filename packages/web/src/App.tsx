import { Show, createSignal } from 'solid-js';
import { useWorkspace, useScriptRunner, useTestRunner } from './context';
import { useAutoConnect, useRequestLoader } from './hooks';
import {
  AppShell,
  AppHeader,
  ConnectionScreen,
  Sidebar,
  MainContent,
} from './components/layout';
import { Toast } from './components/Toast';
import { RunnerSelectDialog, FrameworkSelectDialog } from './components/script';

function App() {
  const store = useWorkspace();
  const scriptRunner = useScriptRunner();
  const testRunner = useTestRunner();
  const [sidebarCollapsed, setSidebarCollapsed] = createSignal(false);

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
          <Sidebar
            collapsed={sidebarCollapsed()}
            onToggle={() => setSidebarCollapsed((prev) => !prev)}
          />
          <MainContent />
        </div>
      </Show>
      <Toast />

      <RunnerSelectDialog
        isOpen={scriptRunner.dialogOpen()}
        scriptPath={scriptRunner.dialogScriptPath()}
        options={scriptRunner.dialogOptions()}
        onSelect={scriptRunner.handleRunnerSelect}
        onClose={scriptRunner.handleDialogClose}
      />

      <FrameworkSelectDialog
        isOpen={testRunner.dialogOpen()}
        testPath={testRunner.dialogTestPath()}
        options={testRunner.dialogOptions()}
        onSelect={testRunner.handleFrameworkSelect}
        onClose={testRunner.handleDialogClose}
      />
    </AppShell>
  );
}

export default App;
