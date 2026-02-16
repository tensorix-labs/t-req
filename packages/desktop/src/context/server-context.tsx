import type { TreqClient } from '@t-req/sdk/client';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  type Accessor,
  createContext,
  createMemo,
  onCleanup,
  onMount,
  type ParentComponent,
  useContext
} from 'solid-js';
import { createStore } from 'solid-js/store';
import { toErrorMessage } from '../lib/errors';
import { createTreqDesktopClient } from '../lib/sdk';

const EVENT_SERVER_READY = 'server-ready';
const EVENT_SERVER_ERROR = 'server-error';
const EVENT_WORKSPACE_PICKING = 'workspace-picking';

export type ServerInfo = {
  port: number;
  token: string;
  baseUrl: string;
  workspace: string;
};

type ClientCredentials = Pick<ServerInfo, 'baseUrl' | 'token'>;

type ServerErrorPayload = {
  message: string;
};

type WorkspacePickingPayload = {
  reason: string;
};

export type ServerStatus =
  | { state: 'connecting' }
  | { state: 'picking-workspace'; reason: string }
  | { state: 'switching' }
  | { state: 'error'; message: string }
  | { state: 'ready'; info: ServerInfo };

type ServerContextValue = {
  status: Accessor<ServerStatus>;
  readyInfo: Accessor<ServerInfo | null>;
  client: Accessor<TreqClient | null>;
  workspacePath: Accessor<string | null>;
  init: () => Promise<void>;
  setWorkspace: (workspace: string) => Promise<ServerInfo>;
};

const ServerContext = createContext<ServerContextValue>();

export const ServerProvider: ParentComponent = (props) => {
  const [state, setState] = createStore<{ status: ServerStatus }>({
    status: { state: 'connecting' }
  });
  let initPromise: Promise<void> | null = null;
  let unlistenHandles: UnlistenFn[] = [];

  const status = createMemo<ServerStatus>(() => state.status);

  const readyInfo = createMemo<ServerInfo | null>(() => {
    const current = status();
    if (current.state !== 'ready') {
      return null;
    }

    return current.info;
  });

  const workspacePath = createMemo(() => readyInfo()?.workspace ?? null);
  const clientCredentials = createMemo<ClientCredentials | null>(
    () => {
      const info = readyInfo();
      if (!info) {
        return null;
      }

      return { baseUrl: info.baseUrl, token: info.token };
    },
    null,
    {
      equals: (previous, next) => {
        if (!previous || !next) {
          return previous === next;
        }

        return previous.baseUrl === next.baseUrl && previous.token === next.token;
      }
    }
  );

  const client = createMemo<TreqClient | null>(() => {
    const credentials = clientCredentials();
    if (!credentials) {
      return null;
    }

    return createTreqDesktopClient(credentials);
  });

  async function registerListeners(): Promise<void> {
    if (unlistenHandles.length > 0) {
      return;
    }

    const [readyUnlisten, errorUnlisten, workspacePickingUnlisten] = await Promise.all([
      listen<ServerInfo>(EVENT_SERVER_READY, (event) => {
        setState('status', { state: 'ready', info: event.payload });
      }),
      listen<ServerErrorPayload>(EVENT_SERVER_ERROR, (event) => {
        setState('status', { state: 'error', message: event.payload.message });
      }),
      listen<WorkspacePickingPayload>(EVENT_WORKSPACE_PICKING, (event) => {
        setState('status', {
          state: 'picking-workspace',
          reason: event.payload.reason
        });
      })
    ]);

    unlistenHandles = [readyUnlisten, errorUnlisten, workspacePickingUnlisten];
  }

  async function init(): Promise<void> {
    if (initPromise) {
      return initPromise;
    }

    initPromise = (async () => {
      await registerListeners();

      try {
        const info = await invoke<ServerInfo | null>('get_server_info');
        if (info) {
          setState('status', { state: 'ready', info });
        } else {
          setState('status', { state: 'connecting' });
        }
      } catch (error) {
        setState('status', {
          state: 'error',
          message: `Failed to fetch server info: ${toErrorMessage(error)}`
        });
        throw error;
      }
    })();

    return initPromise;
  }

  async function setWorkspace(workspace: string): Promise<ServerInfo> {
    setState('status', { state: 'switching' });

    try {
      const info = await invoke<ServerInfo>('set_workspace', { workspace });
      setState('status', { state: 'ready', info });
      return info;
    } catch (error) {
      setState('status', {
        state: 'error',
        message: `Failed to switch workspace: ${toErrorMessage(error)}`
      });
      throw error;
    }
  }

  onMount(() => {
    void init().catch((error) => {
      console.error('Failed to initialize server context', error);
    });
  });

  onCleanup(() => {
    for (const unlisten of unlistenHandles) {
      unlisten();
    }

    unlistenHandles = [];
    initPromise = null;
  });

  const value: ServerContextValue = {
    status,
    readyInfo,
    client,
    workspacePath,
    init,
    setWorkspace
  };

  return <ServerContext.Provider value={value}>{props.children}</ServerContext.Provider>;
};

export function useServer(): ServerContextValue {
  const context = useContext(ServerContext);
  if (!context) {
    throw new Error('useServer must be used within a ServerProvider');
  }

  return context;
}
