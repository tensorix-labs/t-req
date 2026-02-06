import { render } from '@opentui/solid';
import { App } from './app';
import { createObserverStore } from './observer-store';
import { createTreqClient } from '@t-req/sdk/client';
import { createStore } from './store';
import {
  DialogProvider,
  ExitProvider,
  KeybindProvider,
  LogProvider,
  ObserverProvider,
  SDKProvider,
  StoreProvider,
  UpdateProvider,
  unwrap,
  type ExitFn
} from './context';
import { ToastProvider } from './components/toast';

export interface TuiConfig {
  serverUrl: string;
  token?: string;
  onExit?: (reason?: unknown) => Promise<void> | void;
}

export async function startTui(config: TuiConfig): Promise<void> {
  const sdk = createTreqClient({ baseUrl: config.serverUrl, token: config.token });
  const store = createStore();
  const observerStore = createObserverStore();

  let exiting = false;
  let exitFn: ExitFn | undefined;

  const handleQuit = (reason?: unknown) => {
    if (exiting) return; // Prevent double cleanup
    exiting = true;

    // If the renderer is up, exit through it to restore terminal state.
    if (exitFn) {
      void exitFn(reason);
      return;
    }

    process.exit(0);
  };

  // Handle Ctrl+C and SIGTERM
  process.once('SIGINT', () => handleQuit('SIGINT'));
  process.once('SIGTERM', () => handleQuit('SIGTERM'));

  // Start fetching data immediately (in background)
  const dataPromise = (async () => {
    try {
      const response = await unwrap(sdk.getWorkspaceFiles());
      store.setWorkspaceRoot(response.workspaceRoot);
      store.setFiles(response.files);
      store.setConnectionStatus('connected');
    } catch (e) {
      store.setConnectionStatus('error');
      store.setError(e instanceof Error ? e.message : String(e));
    }
  })();

  // Render immediately in 'connecting' state
  // This gives the user immediate feedback while we fetch data
  await render(
    () => (
      <SDKProvider sdk={sdk}>
        <StoreProvider store={store}>
          <ObserverProvider store={observerStore}>
            <ExitProvider register={(fn) => (exitFn = fn)} onExit={config.onExit}>
              <KeybindProvider>
                <LogProvider>
                  <ToastProvider>
                    <DialogProvider>
                      <UpdateProvider>
                        <App />
                      </UpdateProvider>
                    </DialogProvider>
                  </ToastProvider>
                </LogProvider>
              </KeybindProvider>
            </ExitProvider>
          </ObserverProvider>
        </StoreProvider>
      </SDKProvider>
    ),
    {
      targetFps: 60,
      exitOnCtrlC: false
    }
  );

  // Wait for initial data fetch (UI is already rendering).
  await dataPromise;

  // Keep process alive (ExitProvider exits the process).
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  return new Promise(() => { });
}
