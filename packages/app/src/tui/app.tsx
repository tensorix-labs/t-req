import { useKeyboard } from '@opentui/solid';
import { createEffect, createMemo, createSignal } from 'solid-js';
import { theme, rgba } from './theme';
import { Header } from './components/header';
import { Footer } from './components/footer';
import { FileTree } from './components/file-tree';
import { RequestList } from './components/request-list';
import { useExit, useSDK, useStore } from './context';

export function App() {
  const sdk = useSDK();
  const store = useStore();
  const exit = useExit();

  // Track in-flight fetch paths to prevent duplicate requests (reactive for UI)
  const [loadingPaths, setLoadingPaths] = createSignal<Set<string>>(new Set());

  // Keyboard handling
  useKeyboard((event) => {
    switch (event.name) {
      case 'q':
        void exit();
        break;
      case 'j':
      case 'down':
        store.selectNext();
        break;
      case 'k':
      case 'up':
        store.selectPrevious();
        break;
      case 'return': {
        const selected = store.selectedNode();
        if (selected) {
          if (selected.node.isDir) {
            store.toggleDir(selected.node.path);
          } else {
            // Load requests for selected file
            loadRequestsForFile(selected.node.path);
          }
        }
        break;
      }
      case 'h':
      case 'left': {
        const selected = store.selectedNode();
        if (selected?.node.isDir && selected.isExpanded) {
          store.collapseDir(selected.node.path);
        }
        break;
      }
      case 'l':
      case 'right': {
        const selected = store.selectedNode();
        if (selected?.node.isDir && !selected.isExpanded) {
          store.expandDir(selected.node.path);
        }
        break;
      }
    }
  });

  // Load requests when a file is selected
  async function loadRequestsForFile(path: string) {
    // Check if already loaded or currently loading
    if (store.requestsByPath()[path] || loadingPaths().has(path)) {
      return;
    }

    setLoadingPaths((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
    try {
      const response = await sdk.listWorkspaceRequests(path);
      store.setRequestsForPath(path, response.requests);
    } catch (_e) {
      // Silently fail - requests panel will show empty
      // Set empty array to prevent retry on re-select
      store.setRequestsForPath(path, []);
    } finally {
      setLoadingPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  }

  // Auto-load requests when selection changes to a file
  createEffect(() => {
    const selected = store.selectedNode();
    if (selected && !selected.node.isDir) {
      loadRequestsForFile(selected.node.path);
    }
  });

  // Get the selected file path for the request list
  const selectedFilePath = () => {
    const selected = store.selectedNode();
    return selected && !selected.node.isDir ? selected.node.path : undefined;
  };

  const requestListLoading = createMemo(() => {
    const path = selectedFilePath();
    if (!path) return false;
    return loadingPaths().has(path);
  });

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={rgba(theme.background)}
    >
      <Header
        serverUrl={sdk.serverUrl}
        connectionStatus={store.connectionStatus()}
        error={store.error()}
      />

      <box flexGrow={1} flexDirection="row">
        <box width="50%">
          <FileTree
            nodes={store.flattenedVisible()}
            selectedIndex={store.selectedIndex()}
            onSelect={store.setSelectedIndex}
            onToggle={store.toggleDir}
          />
        </box>

        <box width={1} backgroundColor={rgba(theme.borderSubtle)} />

        <box flexGrow={1}>
          <RequestList
            requests={store.selectedFileRequests()}
            selectedFile={selectedFilePath()}
            isLoading={requestListLoading()}
          />
        </box>
      </box>

      <Footer workspacePath={store.workspaceRoot()} />

      <box height={1} paddingLeft={2} flexDirection="row" gap={2}>
        <box flexDirection="row">
          <text fg={rgba(theme.text)}>j/k</text>
          <text fg={rgba(theme.textMuted)}> navigate</text>
        </box>
        <box flexDirection="row">
          <text fg={rgba(theme.text)}>Enter</text>
          <text fg={rgba(theme.textMuted)}> select</text>
        </box>
        <box flexDirection="row">
          <text fg={rgba(theme.text)}>h/l</text>
          <text fg={rgba(theme.textMuted)}> collapse/expand</text>
        </box>
        <box flexDirection="row">
          <text fg={rgba(theme.text)}>q</text>
          <text fg={rgba(theme.textMuted)}> quit</text>
        </box>
      </box>
    </box>
  );
}
