/* @refresh reload */
import { createStore } from 'solid-js/store';
import { render } from 'solid-js/web';
import {
  type ConnectionState,
  ObserverProvider,
  ScriptRunnerProvider,
  SDKProvider,
  TestRunnerProvider,
  WorkspaceProvider
} from './context';
import { createObserverStore } from './stores/observer';
import { createWorkspaceStore } from './stores/workspace';
import '@t-req/ui/fonts';
import './index.css';
import App from './App.tsx';

const root = document.getElementById('root');

render(() => {
  const [connection, setConnection] = createStore<ConnectionState>({
    sdk: null,
    client: null
  });
  const workspaceStore = createWorkspaceStore({
    connection: () => connection,
    setConnection: (next) => setConnection(next)
  });
  const observerStore = createObserverStore();

  return (
    <SDKProvider connection={connection}>
      <WorkspaceProvider store={workspaceStore}>
        <ObserverProvider store={observerStore}>
          <ScriptRunnerProvider>
            <TestRunnerProvider>
              <App />
            </TestRunnerProvider>
          </ScriptRunnerProvider>
        </ObserverProvider>
      </WorkspaceProvider>
    </SDKProvider>
  );
}, root!);
